import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Track } from "@/types";

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface UIState {
  toasts: Toast[];
  menuTrack: Track | null;
  pickerTrack: Track | null;
  settingsOpen: boolean;
}

interface UIActions {
  toast: (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => void;
  dismissToast: (id: number) => void;
  openTrackMenu: (t: Track) => void;
  closeTrackMenu: () => void;
  openPlaylistPicker: (t: Track) => void;
  closePlaylistPicker: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const StateCtx = createContext<UIState | null>(null);
const ActionsCtx = createContext<UIActions | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const counter = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => {
      const id = ++counter.current;
      setToasts((t) => [...t.slice(-2), { id, message, ...opts }]);
      setTimeout(() => dismissToast(id), opts?.actionLabel ? 5000 : 3000);
    },
    [dismissToast],
  );

  const actions = useMemo<UIActions>(
    () => ({
      toast,
      dismissToast,
      openTrackMenu: (t) => setMenuTrack(t),
      closeTrackMenu: () => setMenuTrack(null),
      openPlaylistPicker: (t) => setPickerTrack(t),
      closePlaylistPicker: () => setPickerTrack(null),
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
    }),
    [toast, dismissToast],
  );
  const state = useMemo<UIState>(() => ({ toasts, menuTrack, pickerTrack, settingsOpen }), [toasts, menuTrack, pickerTrack, settingsOpen]);

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

/** Stable actions only — safe for list items (never causes re-renders). */
export function useUIActions(): UIActions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error("useUIActions outside UIProvider");
  return v;
}

export function useUI(): UIState & UIActions {
  const s = useContext(StateCtx);
  const a = useContext(ActionsCtx);
  if (!s || !a) throw new Error("useUI outside UIProvider");
  return useMemo(() => ({ ...s, ...a }), [s, a]);
}
