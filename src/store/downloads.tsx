import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Track } from "@/types";
import { STORES, idbGet } from "@/lib/idb";
import { downloadFilename, hasOffline, initOffline, removeOffline, saveBlobToDevice, saveOffline, streamDownload, type MediaKind } from "@/lib/offline";
import { useUIActions } from "./ui";

export type JobStatus = "queued" | "downloading" | "done" | "error" | "cancelled" | "external";

export interface DownloadJob {
  key: string;
  track: Track;
  kind: MediaKind;
  url: string;
  received: number;
  total: number | null;
  status: JobStatus;
  error?: string;
  saveToDevice: boolean;
  createdAt: number;
}

interface DownloadsCtx {
  jobs: DownloadJob[];
  activeCount: number;
  /** overall progress of active jobs 0..100 (null when unknown) */
  progress: number | null;
  download: (track: Track, opts?: { kind?: MediaKind; saveToDevice?: boolean }) => void;
  cancel: (key: string) => void;
  dismiss: (key: string) => void;
  clearFinished: () => void;
  remove: (trackId: string, kind: MediaKind) => Promise<void>;
}

const Ctx = createContext<DownloadsCtx | null>(null);
const MAX_PARALLEL = 2;

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { toast } = useUIActions();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const jobsRef = useRef<DownloadJob[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(0);

  useEffect(() => {
    void initOffline();
  }, []);

  const commit = useCallback((next: DownloadJob[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);
  const patch = useCallback((key: string, p: Partial<DownloadJob>) => commit(jobsRef.current.map((j) => (j.key === key ? { ...j, ...p } : j))), [commit]);

  const pumpRef = useRef<() => void>(() => {});

  const run = useCallback(
    async (job: DownloadJob) => {
      const ctrl = new AbortController();
      controllers.current.set(job.key, ctrl);
      running.current++;
      patch(job.key, { status: "downloading" });
      let lastTick = 0;
      try {
        const blob = await streamDownload(job.url, {
          signal: ctrl.signal,
          fallbackType: job.kind === "audio" ? "audio/ogg" : "video/webm",
          onProgress: ({ received, total }) => {
            const now = performance.now();
            if (now - lastTick > 150 || (total && received >= total)) {
              lastTick = now;
              patch(job.key, { received, total });
            }
          },
        });
        const stored = await saveOffline(job.track, job.kind, blob);
        if (job.saveToDevice) saveBlobToDevice(blob, downloadFilename(job.track, job.kind));
        patch(job.key, { status: "done", received: blob.size, total: blob.size });
        toast(job.saveToDevice ? `Скачано: ${job.track.title}` : stored ? `Доступно офлайн: ${job.track.title}` : "Не хватило места в хранилище");
      } catch (e) {
        if (ctrl.signal.aborted) patch(job.key, { status: "cancelled" });
        else if (e instanceof TypeError) {
          patch(job.key, { status: "error", error: "Файл недоступен" });
          toast("Не удалось скачать файл");
        } else patch(job.key, { status: "error", error: e instanceof Error ? e.message : "Ошибка" });
      } finally {
        controllers.current.delete(job.key);
        running.current--;
        pumpRef.current();
      }
    },
    [patch, toast],
  );

  pumpRef.current = () => {
    while (running.current < MAX_PARALLEL) {
      const next = jobsRef.current.find((j) => j.status === "queued");
      if (!next) break;
      void run(next);
    }
  };

  const download = useCallback(
    async (track: Track, opts?: { kind?: MediaKind; saveToDevice?: boolean }) => {
      const kind = opts?.kind ?? "audio";
      const saveToDevice = opts?.saveToDevice ?? true;
      const key = `${track.id}|${kind}`;
      if (jobsRef.current.some((j) => j.key === key && (j.status === "queued" || j.status === "downloading"))) {
        toast("Уже загружается");
        return;
      }
      if (hasOffline(track.id, kind)) {
        if (!saveToDevice) {
          toast("Уже доступно офлайн");
          return;
        }
        const blob = await idbGet<Blob>(STORES.files, key);
        if (blob) {
          saveBlobToDevice(blob, downloadFilename(track, kind));
          toast("Файл сохранён на устройство");
          return;
        }
      }
      const job: DownloadJob = { key, track, kind, url: kind === "audio" ? track.audioUrl : track.videoUrl, received: 0, total: null, status: "queued", saveToDevice, createdAt: Date.now() };
      commit([job, ...jobsRef.current.filter((j) => j.key !== key)]);
      pumpRef.current();
    },
    [commit, toast],
  );

  const cancel = useCallback(
    (key: string) => {
      controllers.current.get(key)?.abort();
      const j = jobsRef.current.find((x) => x.key === key);
      if (j?.status === "queued") patch(key, { status: "cancelled" });
    },
    [patch],
  );
  const dismiss = useCallback(
    (key: string) => {
      controllers.current.get(key)?.abort();
      commit(jobsRef.current.filter((j) => j.key !== key));
    },
    [commit],
  );
  const clearFinished = useCallback(() => commit(jobsRef.current.filter((j) => j.status === "queued" || j.status === "downloading")), [commit]);
  const remove = useCallback(
    async (trackId: string, kind: MediaKind) => {
      await removeOffline(trackId, kind);
      toast("Удалено из офлайн");
    },
    [toast],
  );

  const value = useMemo<DownloadsCtx>(() => {
    const active = jobs.filter((j) => j.status === "queued" || j.status === "downloading");
    const known = active.filter((j) => j.total);
    const progress = known.length ? (known.reduce((n, j) => n + j.received / (j.total as number), 0) / active.length) * 100 : active.length ? null : 0;
    return { jobs, activeCount: active.length, progress, download, cancel, dismiss, clearFinished, remove };
  }, [jobs, download, cancel, dismiss, clearFinished, remove]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDownloads() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDownloads outside DownloadsProvider");
  return v;
}
