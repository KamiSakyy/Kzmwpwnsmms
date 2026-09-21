/**
 * Offline media storage + streaming downloader.
 * Blobs live in IndexedDB ("files"), lightweight metadata in "meta".
 */
import { useSyncExternalStore } from "react";
import type { Track } from "@/types";
import { STORES, idbDelete, idbGet, idbGetAll, idbSet } from "@/lib/idb";

export type MediaKind = "audio" | "video";

export interface OfflineMeta {
  key: string;
  trackId: string;
  kind: MediaKind;
  track: Track;
  size: number;
  type: string;
  savedAt: number;
}

export const offlineKey = (trackId: string, kind: MediaKind) => `${trackId}|${kind}`;

let index = new Map<string, OfflineMeta>();
let snapshot: OfflineMeta[] = [];
const listeners = new Set<() => void>();
const objectUrls = new Map<string, string>();
let readyPromise: Promise<void> | null = null;

function emit() {
  snapshot = [...index.values()].sort((a, b) => b.savedAt - a.savedAt);
  listeners.forEach((l) => l());
}

export function initOffline(): Promise<void> {
  if (!readyPromise) {
    readyPromise = idbGetAll<OfflineMeta>(STORES.meta)
      .then((all) => {
        index = new Map(all.filter((m) => m && m.key).map((m) => [m.key, m]));
        emit();
      })
      .catch(() => {});
  }
  return readyPromise;
}

export function subscribeOffline(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const getOfflineSnapshot = () => snapshot;
export const hasOffline = (trackId: string, kind: MediaKind) => index.has(offlineKey(trackId, kind));
export const getOfflineMeta = (trackId: string, kind: MediaKind) => index.get(offlineKey(trackId, kind));

export async function getOfflineUrl(trackId: string, kind: MediaKind): Promise<string | null> {
  const key = offlineKey(trackId, kind);
  if (!index.has(key)) return null;
  const cached = objectUrls.get(key);
  if (cached) return cached;
  const blob = await idbGet<Blob>(STORES.files, key);
  if (!blob) {
    index.delete(key);
    void idbDelete(STORES.meta, key);
    emit();
    return null;
  }
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}

export async function saveOffline(track: Track, kind: MediaKind, blob: Blob): Promise<boolean> {
  const key = offlineKey(track.id, kind);
  const ok = await idbSet(STORES.files, key, blob);
  if (!ok) return false;
  const meta: OfflineMeta = { key, trackId: track.id, kind, track, size: blob.size, type: blob.type, savedAt: Date.now() };
  await idbSet(STORES.meta, key, meta);
  index.set(key, meta);
  emit();
  return true;
}

export async function removeOffline(trackId: string, kind: MediaKind): Promise<void> {
  const key = offlineKey(trackId, kind);
  await idbDelete(STORES.files, key);
  await idbDelete(STORES.meta, key);
  const url = objectUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(key);
  }
  index.delete(key);
  emit();
}

export async function clearOffline(): Promise<void> {
  const keys = [...index.values()];
  for (const m of keys) await removeOffline(m.trackId, m.kind);
}

export function offlineTotalSize(): number {
  let n = 0;
  index.forEach((m) => (n += m.size));
  return n;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

/* React bindings (subscribe only to what changes) */
export function useOfflineList(): OfflineMeta[] {
  return useSyncExternalStore(subscribeOffline, getOfflineSnapshot, getOfflineSnapshot);
}
export function useIsOffline(trackId: string, kind: MediaKind = "audio"): boolean {
  return useSyncExternalStore(
    subscribeOffline,
    () => hasOffline(trackId, kind),
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Streaming download with progress                                    */
/* ------------------------------------------------------------------ */
export interface DownloadProgress {
  received: number;
  total: number | null;
}

export async function streamDownload(url: string, o: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void; fallbackType: string }): Promise<Blob> {
  const res = await fetch(url, { signal: o.signal, mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || null;
  const type = res.headers.get("content-type") || o.fallbackType;
  if (!res.body) {
    const blob = await res.blob();
    o.onProgress?.({ received: blob.size, total: blob.size });
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    o.onProgress?.({ received, total });
  }
  return new Blob(chunks as unknown as BlobPart[], { type });
}

export function saveBlobToDevice(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadFilename(track: Track, kind: MediaKind): string {
  const url = kind === "audio" ? track.audioUrl : track.videoUrl;
  const fromUrl = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  const ext = fromUrl ?? (kind === "audio" ? "ogg" : "webm");
  const artists = track.artists.map((a) => a.name).join(", ") || "Unknown Artist";
  const raw = `${artists} - ${track.title} [${track.anime.name} ${track.themeSlug}]`;
  return `${raw.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 150)}.${ext}`;
}

export function formatBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return "0 Б";
  if (n < 1024) return `${n} Б`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} МБ`;
  return `${(mb / 1024).toFixed(2)} ГБ`;
}
