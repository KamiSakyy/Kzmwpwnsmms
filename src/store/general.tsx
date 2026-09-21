import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useLocalStorage } from "@/lib/hooks";
import { filterMature } from "@/core/catalog";
import type { Track } from "@/types";

export type Period = "today" | "week" | "all";
export type Mature = "off" | "on";

interface GeneralState {
  period: Period;
  setPeriod: (v: Period) => void;
  mature: Mature;
  setMature: (v: Mature) => void;
  filterTracks: (tracks: Track[]) => Track[];
}

const Ctx = createContext<GeneralState | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useLocalStorage<Period>("anibeat:period", "all");
  const [mature, setMature] = useLocalStorage<Mature>("anibeat:mature", "off");
  const value = useMemo<GeneralState>(
    () => ({
      period,
      setPeriod,
      mature,
      setMature,
      filterTracks: (tracks: Track[]) => filterMature(tracks, mature),
    }),
    [period, setPeriod, mature, setMature],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGeneralStore(): GeneralState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGeneralStore outside provider");
  return v;
}

/** Tiny external store for the "live song" ticker on the home screen. */
let liveTrack: Track | null = null;
let liveNonce = 0;
const liveListeners = new Set<() => void>();

export function setLiveSong(t: Track | null) {
  liveTrack = t;
  liveNonce++;
  liveListeners.forEach((l) => l());
}

export function useLiveSong(): Track | null {
  const snap = useSyncExternalStore(
    (fn) => {
      liveListeners.add(fn);
      return () => {
        liveListeners.delete(fn);
      };
    },
    () => liveNonce,
    () => 0,
  );
  void snap;
  return liveTrack;
}
