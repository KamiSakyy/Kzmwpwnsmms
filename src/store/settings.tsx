import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useLocalStorage } from "@/lib/hooks";
import type { MediaKind } from "@/lib/offline";

export interface Settings {
  /** small covers only, no next-track preloading */
  dataSaver: boolean;
  /** warm up the next track in the queue a few seconds in */
  preloadNext: boolean;
  /** default format for the quick download button */
  downloadKind: MediaKind;
  /** Russian titles from Shikimori */
  ruTitles: boolean;
  /** include AnisongDB (insert songs, extra OP/ED) in search & anime pages */
  extraSources: boolean;
}

function detectSaveData(): boolean {
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !!c?.saveData;
  } catch {
    return false;
  }
}

const DEFAULTS: Settings = { dataSaver: detectSaveData(), preloadNext: true, downloadKind: "audio", ruTitles: true, extraSources: true };

interface SettingsCtx {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useLocalStorage<Partial<Settings>>("anibeat:settings", {});
  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => setSaved((p) => ({ ...p, [key]: value })), [setSaved]);
  const value = useMemo<SettingsCtx>(() => ({ settings: { ...DEFAULTS, ...saved }, set }), [saved, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings outside SettingsProvider");
  return v;
}
