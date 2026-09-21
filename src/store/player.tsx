import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { RepeatMode, Track } from "@/types";
import { artistNames, loadJSON, saveJSON, shuffleArray } from "@/lib/utils";
import { getOfflineUrl, hasOffline, type MediaKind } from "@/lib/offline";
import { useLibrary } from "./library";
import { useUIActions } from "./ui";
import { useSettings } from "./settings";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
interface State {
  queue: Track[];
  original: Track[] | null;
  index: number;
  isPlaying: boolean;
  buffering: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  videoMode: boolean;
  nowPlayingOpen: boolean;
  queueOpen: boolean;
}

type Action =
  | { type: "SET_QUEUE"; queue: Track[]; index: number; shuffle?: boolean }
  | { type: "SET_INDEX"; index: number }
  | { type: "PLAYING"; value: boolean }
  | { type: "BUFFERING"; value: boolean }
  | { type: "VOLUME"; value: number }
  | { type: "MUTED"; value: boolean }
  | { type: "TOGGLE_SHUFFLE" }
  | { type: "REPEAT"; value: RepeatMode }
  | { type: "VIDEO_MODE"; value: boolean }
  | { type: "ADD"; tracks: Track[]; next?: boolean }
  | { type: "REMOVE"; index: number }
  | { type: "MOVE"; from: number; to: number }
  | { type: "CLEAR" }
  | { type: "NOW_PLAYING"; value: boolean }
  | { type: "QUEUE_OPEN"; value: boolean };

const PERSIST_KEY = "anibeat:player";
const clamp = (i: number, len: number) => Math.max(0, Math.min(i, Math.max(0, len - 1)));

function initialState(): State {
  const saved = loadJSON<Partial<State>>(PERSIST_KEY, {});
  const queue = Array.isArray(saved.queue) ? saved.queue.slice(0, 300) : [];
  return {
    queue,
    original: null,
    index: typeof saved.index === "number" ? clamp(saved.index, queue.length) : 0,
    isPlaying: false,
    buffering: false,
    volume: typeof saved.volume === "number" ? saved.volume : 1,
    muted: !!saved.muted,
    shuffle: !!saved.shuffle,
    repeat: (saved.repeat as RepeatMode) ?? "off",
    // video is always OFF on start: nothing heavy is fetched until the user asks for it
    videoMode: false,
    nowPlayingOpen: false,
    queueOpen: false,
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "SET_QUEUE": {
      const useShuffle = a.shuffle ?? s.shuffle;
      if (useShuffle && a.queue.length > 1) {
        const first = a.queue[a.index] ?? a.queue[0];
        const rest = a.queue.filter((t) => t !== first);
        return { ...s, shuffle: true, original: a.queue, queue: [first, ...shuffleArray(rest)], index: 0 };
      }
      return { ...s, shuffle: useShuffle, queue: a.queue, original: null, index: clamp(a.index, a.queue.length) };
    }
    case "SET_INDEX":
      return { ...s, index: clamp(a.index, s.queue.length) };
    case "PLAYING":
      return s.isPlaying === a.value ? s : { ...s, isPlaying: a.value };
    case "BUFFERING":
      return s.buffering === a.value ? s : { ...s, buffering: a.value };
    case "VOLUME":
      return { ...s, volume: Math.max(0, Math.min(1, a.value)), muted: a.value === 0 ? s.muted : false };
    case "MUTED":
      return { ...s, muted: a.value };
    case "TOGGLE_SHUFFLE": {
      const current = s.queue[s.index];
      if (!s.shuffle) {
        if (s.queue.length < 2) return { ...s, shuffle: true };
        const rest = s.queue.filter((_, i) => i !== s.index);
        return { ...s, shuffle: true, original: s.queue, queue: [current, ...shuffleArray(rest)], index: 0 };
      }
      const restored = s.original ?? s.queue;
      const idx = current ? Math.max(0, restored.findIndex((t) => t.id === current.id)) : 0;
      return { ...s, shuffle: false, original: null, queue: restored, index: idx };
    }
    case "REPEAT":
      return { ...s, repeat: a.value };
    case "VIDEO_MODE":
      return { ...s, videoMode: a.value };
    case "ADD": {
      const existing = new Set(s.queue.map((t) => t.id));
      const fresh = a.tracks.filter((t) => !existing.has(t.id));
      if (!fresh.length && !a.next) return s;
      if (!s.queue.length) return { ...s, queue: fresh, index: 0 };
      if (a.next) {
        const ids = new Set(a.tracks.map((t) => t.id));
        const filtered = s.queue.filter((t, i) => i <= s.index || !ids.has(t.id));
        filtered.splice(s.index + 1, 0, ...a.tracks);
        return { ...s, queue: filtered, original: s.original ? [...s.original, ...fresh] : null };
      }
      return { ...s, queue: [...s.queue, ...fresh], original: s.original ? [...s.original, ...fresh] : null };
    }
    case "REMOVE": {
      if (a.index < 0 || a.index >= s.queue.length) return s;
      const removedId = s.queue[a.index].id;
      const q = s.queue.filter((_, i) => i !== a.index);
      let index = s.index;
      if (a.index < s.index) index--;
      else if (a.index === s.index) index = Math.min(index, q.length - 1);
      return { ...s, queue: q, index: Math.max(0, index), original: s.original ? s.original.filter((t) => t.id !== removedId) : null };
    }
    case "MOVE": {
      const q = [...s.queue];
      const [item] = q.splice(a.from, 1);
      q.splice(a.to, 0, item);
      const currentId = s.queue[s.index]?.id;
      return { ...s, queue: q, index: Math.max(0, q.findIndex((t) => t.id === currentId)) };
    }
    case "CLEAR":
      return { ...s, queue: s.queue[s.index] ? [s.queue[s.index]] : [], original: null, index: 0 };
    case "NOW_PLAYING":
      // closing the player stops the video stream and falls back to audio-only
      return { ...s, nowPlayingOpen: a.value, queueOpen: a.value ? s.queueOpen : false, videoMode: a.value ? s.videoMode : false };
    case "QUEUE_OPEN":
      return { ...s, queueOpen: a.value };
    default:
      return s;
  }
}

/* ------------------------------------------------------------------ */
/* Contexts                                                            */
/* ------------------------------------------------------------------ */
export interface PlayerActions {
  playTracks: (tracks: Track[], startIndex?: number, opts?: { shuffle?: boolean }) => void;
  playTrack: (track: Track, context?: Track[]) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleVideoMode: () => void;
  addToQueue: (tracks: Track | Track[]) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpTo: (index: number) => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  setQueueOpen: (v: boolean) => void;
}
export interface PlayerState extends State {
  current: Track | null;
  media: HTMLVideoElement | null;
}
export type PlayerAPI = PlayerState & PlayerActions & { isCurrent: (id: string) => boolean };

interface TimeState { currentTime: number; duration: number; buffered: number }
interface NowState { id: string | null; isPlaying: boolean; buffering: boolean }

const ZERO_TIME: TimeState = { currentTime: 0, duration: 0, buffered: 0 };
const StateCtx = createContext<PlayerState | null>(null);
const ActionsCtx = createContext<PlayerActions | null>(null);
const TimeCtx = createContext<TimeState>(ZERO_TIME);
const NowCtx = createContext<NowState>({ id: null, isPlaying: false, buffering: false });

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [time, setTime] = useState<TimeState>(ZERO_TIME);
  const { addToHistory } = useLibrary();
  const { toast } = useUIActions();
  const { settings } = useSettings();

  const stateRef = useRef(state);
  stateRef.current = state;
  const addToHistoryRef = useRef(addToHistory);
  addToHistoryRef.current = addToHistory;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const wantPlay = useRef(false);
  const loadedTrackId = useRef<string | null>(null);
  const loadedSrc = useRef<string | null>(null);
  const loadToken = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const fallbackTried = useRef<string | null>(null);
  const errorTimer = useRef<number | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);

  // One media element for the whole app (audio by default, video on demand)
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  if (!mediaRef.current && typeof document !== "undefined") {
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.playsInline = true;
    v.disableRemotePlayback = false;
    // never speculatively fetch media — sources are attached on demand
    v.preload = "none";
    v.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000;display:block";
    mediaRef.current = v;
  }

  const current = state.queue[state.index] ?? null;

  /* ---------- source loading (offline-first, race-safe) ---------- */
  const applySource = useCallback((track: Track, opts: { autoplay: boolean; keepPosition?: boolean; restart?: boolean }) => {
    const el = mediaRef.current;
    if (!el) return;
    // Video bytes are only ever requested while the user is actually watching.
    const wantVideo = stateRef.current.videoMode && stateRef.current.nowPlayingOpen;
    const kind: MediaKind = wantVideo ? "video" : "audio";
    const remote = kind === "video" ? track.videoUrl : track.audioUrl;
    const token = ++loadToken.current;

    const load = (src: string) => {
      if (token !== loadToken.current) return;
      if (loadedSrc.current === src && loadedTrackId.current === track.id) {
        if (opts.restart) el.currentTime = 0;
        if (opts.autoplay) {
          el.preload = "auto";
          el.play().catch(() => {});
        }
        return;
      }
      const sameTrack = loadedTrackId.current === track.id;
      pendingSeek.current = sameTrack && opts.keepPosition ? el.currentTime : null;
      if (!sameTrack) {
        fallbackTried.current = null;
        setTime(ZERO_TIME);
        if (opts.autoplay) addToHistoryRef.current(track);
      }
      loadedTrackId.current = track.id;
      loadedSrc.current = src;
      el.preload = opts.autoplay ? "auto" : "metadata";
      el.poster = "";
      dispatch({ type: "BUFFERING", value: opts.autoplay });
      el.src = src;
      el.load();
      if (opts.autoplay) el.play().catch(() => dispatch({ type: "BUFFERING", value: false }));
    };

    if (hasOffline(track.id, kind)) {
      getOfflineUrl(track.id, kind)
        .then((u) => load(u ?? remote))
        .catch(() => load(remote));
    } else load(remote);
  }, []);

  const goTo = useCallback(
    (index: number, autoplay = true) => {
      const s = stateRef.current;
      const target = s.queue[index];
      if (!target) return;
      wantPlay.current = autoplay;
      if (index !== s.index) dispatch({ type: "SET_INDEX", index });
      applySource(target, { autoplay, restart: true });
    },
    [applySource],
  );

  const nextRef = useRef<(auto?: boolean) => void>(() => {});
  nextRef.current = (auto = false) => {
    const s = stateRef.current;
    if (!s.queue.length) return;
    if (s.index < s.queue.length - 1) goTo(s.index + 1);
    else if (s.repeat === "all" || !auto) goTo(0, true);
    else {
      wantPlay.current = false;
      dispatch({ type: "PLAYING", value: false });
    }
  };
  const prevRef = useRef<() => void>(() => {});
  prevRef.current = () => {
    const el = mediaRef.current;
    const s = stateRef.current;
    if (el && el.currentTime > 4) {
      el.currentTime = 0;
      return;
    }
    if (s.index > 0) goTo(s.index - 1);
    else if (s.repeat === "all" && s.queue.length) goTo(s.queue.length - 1);
    else if (el) el.currentTime = 0;
  };

  /* ---------- media element events ---------- */
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onTime = () => {
      let buffered = 0;
      try {
        if (el.buffered.length) buffered = el.buffered.end(el.buffered.length - 1);
      } catch {
        /* ignore */
      }
      setTime({ currentTime: el.currentTime, duration: isFinite(el.duration) ? el.duration : 0, buffered });
    };
    const onPlay = () => dispatch({ type: "PLAYING", value: true });
    const onPause = () => dispatch({ type: "PLAYING", value: false });
    const onWaiting = () => dispatch({ type: "BUFFERING", value: true });
    const onReady = () => dispatch({ type: "BUFFERING", value: false });
    const onMeta = () => {
      if (pendingSeek.current != null) {
        try {
          el.currentTime = pendingSeek.current;
        } catch {
          /* ignore */
        }
        pendingSeek.current = null;
      }
      onTime();
    };
    const onEnded = () => {
      if (stateRef.current.repeat === "one") {
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }
      nextRef.current(true);
    };
    const onError = () => {
      const cur = stateRef.current.queue[stateRef.current.index];
      if (!cur || !loadedSrc.current) return;
      if (fallbackTried.current !== cur.id) {
        fallbackTried.current = cur.id;
        const alt = loadedSrc.current === cur.videoUrl ? cur.audioUrl : cur.videoUrl;
        if (alt && alt !== loadedSrc.current) {
          loadedSrc.current = alt;
          el.src = alt;
          el.load();
          if (wantPlay.current) el.play().catch(() => {});
          return;
        }
      }
      dispatch({ type: "BUFFERING", value: false });
      toastRef.current(`Не удалось воспроизвести «${cur.title}»`);
      if (errorTimer.current) window.clearTimeout(errorTimer.current);
      errorTimer.current = window.setTimeout(() => {
        if (stateRef.current.queue.length > 1 && wantPlay.current) nextRef.current(true);
      }, 1500);
    };
    const pairs: [string, EventListener][] = [
      ["timeupdate", onTime], ["durationchange", onTime], ["progress", onTime], ["loadedmetadata", onMeta],
      ["play", onPlay], ["playing", onReady], ["pause", onPause], ["waiting", onWaiting], ["canplay", onReady],
      ["ended", onEnded], ["error", onError],
    ];
    pairs.forEach(([e, h]) => el.addEventListener(e, h));
    return () => pairs.forEach(([e, h]) => el.removeEventListener(e, h));
  }, []);

  /* ---------- react to track / mode changes ---------- */
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (!current) {
      loadToken.current++;
      loadedTrackId.current = null;
      loadedSrc.current = null;
      el.removeAttribute("src");
      el.load();
      setTime(ZERO_TIME);
      return;
    }
    applySource(current, { autoplay: wantPlay.current, keepPosition: true });
  }, [current?.id, state.videoMode, state.nowPlayingOpen, applySource]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- preload the next track (data-saver aware) ---------- */
  useEffect(() => {
    if (!settings.preloadNext || settings.dataSaver || state.videoMode || !state.isPlaying) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const next = state.queue[state.index + 1] ?? (state.repeat === "all" ? state.queue[0] : undefined);
    if (!next || next.id === current?.id || hasOffline(next.id, "audio")) return;
    const timer = window.setTimeout(() => {
      let a = preloadRef.current;
      if (!a) {
        a = document.createElement("audio");
        a.preload = "auto";
        a.muted = true;
        preloadRef.current = a;
      }
      if (a.src !== next.audioUrl) {
        a.src = next.audioUrl;
        a.load();
      }
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [current?.id, state.queue, state.index, state.repeat, state.videoMode, state.isPlaying, settings.preloadNext, settings.dataSaver]);

  /* ---------- volume ---------- */
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.volume = state.volume;
    el.muted = state.muted;
  }, [state.volume, state.muted]);

  /* ---------- persistence ---------- */
  useEffect(() => {
    const id = window.setTimeout(() => {
      saveJSON(PERSIST_KEY, {
        queue: state.queue.slice(0, 300),
        index: state.index,
        volume: state.volume,
        muted: state.muted,
        shuffle: state.shuffle,
        repeat: state.repeat,
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [state.queue, state.index, state.volume, state.muted, state.shuffle, state.repeat]);

  /* ---------- Media Session (lock screen / notification) ---------- */
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!current) {
      ms.metadata = null;
      return;
    }
    const mime = (u: string) => (u.endsWith(".png") ? "image/png" : u.endsWith(".avif") ? "image/avif" : u.endsWith(".webp") ? "image/webp" : "image/jpeg");
    const artwork = [current.cover, current.coverSmall].filter((x): x is string => !!x).map((src) => ({ src, sizes: "512x512", type: mime(src) }));
    ms.metadata = new MediaMetadata({ title: current.title, artist: artistNames(current), album: `${current.anime.name} · ${current.themeSlug}`, artwork });
  }, [current]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const el = mediaRef.current;
    const safe = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* unsupported */
      }
    };
    safe("play", () => {
      wantPlay.current = true;
      el?.play().catch(() => {});
    });
    safe("pause", () => el?.pause());
    safe("previoustrack", () => prevRef.current());
    safe("nexttrack", () => nextRef.current(false));
    safe("seekto", (d) => {
      if (el && d.seekTime != null) el.currentTime = d.seekTime;
    });
    safe("seekbackward", (d) => {
      if (el) el.currentTime = Math.max(0, el.currentTime - (d.seekOffset ?? 10));
    });
    safe("seekforward", (d) => {
      if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + (d.seekOffset ?? 10));
    });
    return () => (["play", "pause", "previoustrack", "nexttrack", "seekto", "seekbackward", "seekforward"] as MediaSessionAction[]).forEach((a) => safe(a, null));
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
      if (time.duration > 0 && time.currentTime <= time.duration) {
        navigator.mediaSession.setPositionState?.({ duration: time.duration, position: time.currentTime, playbackRate: 1 });
      }
    } catch {
      /* ignore */
    }
  }, [state.isPlaying, time.duration, time.currentTime]);

  /* ---------- keyboard shortcuts ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const el = mediaRef.current;
      if (!el) return;
      if (e.code === "Space" || e.key === "k") {
        e.preventDefault();
        if (!stateRef.current.queue.length) return;
        if (el.paused) {
          wantPlay.current = true;
          el.play().catch(() => {});
        } else el.pause();
      } else if (e.key === "ArrowRight" && e.shiftKey) nextRef.current(false);
      else if (e.key === "ArrowLeft" && e.shiftKey) prevRef.current();
      else if (e.key === "ArrowRight") el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
      else if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 5);
      else if (e.key === "m") dispatch({ type: "MUTED", value: !stateRef.current.muted });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- stable actions ---------- */
  const actions = useMemo<PlayerActions>(() => {
    const el = () => mediaRef.current;
    const play = () => {
      wantPlay.current = true;
      const s = stateRef.current;
      const t = s.queue[s.index];
      if (!t) return;
      applySource(t, { autoplay: true, keepPosition: true });
    };
    const pause = () => {
      wantPlay.current = false;
      el()?.pause();
    };
    return {
      playTracks: (tracks, startIndex = 0, opts) => {
        if (!tracks.length) return;
        const idx = opts?.shuffle ? Math.floor(Math.random() * tracks.length) : clamp(startIndex, tracks.length);
        wantPlay.current = true;
        dispatch({ type: "SET_QUEUE", queue: tracks, index: idx, shuffle: opts?.shuffle ? true : undefined });
        applySource(tracks[idx], { autoplay: true, restart: true });
      },
      playTrack: (track, context) => {
        wantPlay.current = true;
        if (context?.length) {
          const idx = Math.max(0, context.findIndex((t) => t.id === track.id));
          dispatch({ type: "SET_QUEUE", queue: context, index: idx });
        } else {
          const s = stateRef.current;
          const existing = s.queue.findIndex((t) => t.id === track.id);
          if (existing >= 0) dispatch({ type: "SET_INDEX", index: existing });
          else if (!s.queue.length) dispatch({ type: "SET_QUEUE", queue: [track], index: 0 });
          else {
            dispatch({ type: "ADD", tracks: [track], next: true });
            dispatch({ type: "SET_INDEX", index: s.index + 1 });
          }
        }
        applySource(track, { autoplay: true });
      },
      play,
      pause,
      togglePlay: () => {
        const e = el();
        if (!e) return;
        if (e.paused) play();
        else pause();
      },
      next: () => nextRef.current(false),
      prev: () => prevRef.current(),
      seek: (t) => {
        const e = el();
        if (!e) return;
        e.currentTime = Math.max(0, Math.min(t, e.duration || t));
        setTime((s) => ({ ...s, currentTime: e.currentTime }));
      },
      seekBy: (d) => {
        const e = el();
        if (e) e.currentTime = Math.max(0, Math.min(e.duration || 0, e.currentTime + d));
      },
      setVolume: (v) => dispatch({ type: "VOLUME", value: v }),
      toggleMute: () => dispatch({ type: "MUTED", value: !stateRef.current.muted }),
      toggleShuffle: () => dispatch({ type: "TOGGLE_SHUFFLE" }),
      cycleRepeat: () => {
        const order: RepeatMode[] = ["off", "all", "one"];
        dispatch({ type: "REPEAT", value: order[(order.indexOf(stateRef.current.repeat) + 1) % order.length] });
      },
      toggleVideoMode: () => {
        const on = !stateRef.current.videoMode;
        if (on && !stateRef.current.nowPlayingOpen) dispatch({ type: "NOW_PLAYING", value: true });
        dispatch({ type: "VIDEO_MODE", value: on });
      },
      addToQueue: (tracks) => dispatch({ type: "ADD", tracks: Array.isArray(tracks) ? tracks : [tracks] }),
      playNext: (track) => dispatch({ type: "ADD", tracks: [track], next: true }),
      removeFromQueue: (index) => dispatch({ type: "REMOVE", index }),
      moveInQueue: (from, to) => dispatch({ type: "MOVE", from, to }),
      clearQueue: () => dispatch({ type: "CLEAR" }),
      jumpTo: (index) => goTo(index),
      openNowPlaying: () => dispatch({ type: "NOW_PLAYING", value: true }),
      closeNowPlaying: () => dispatch({ type: "NOW_PLAYING", value: false }),
      setQueueOpen: (v) => dispatch({ type: "QUEUE_OPEN", value: v }),
    };
  }, [applySource, goTo]);

  const stateValue = useMemo<PlayerState>(() => ({ ...state, current, media: mediaRef.current }), [state, current]);
  const nowValue = useMemo<NowState>(() => ({ id: current?.id ?? null, isPlaying: state.isPlaying, buffering: state.buffering }), [current?.id, state.isPlaying, state.buffering]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={stateValue}>
        <NowCtx.Provider value={nowValue}>
          <TimeCtx.Provider value={time}>{children}</TimeCtx.Provider>
        </NowCtx.Provider>
      </StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */
/** Stable action set — never triggers re-renders. Use in lists. */
export function usePlayerActions(): PlayerActions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error("usePlayerActions outside PlayerProvider");
  return v;
}
export function usePlayerState(): PlayerState {
  const v = useContext(StateCtx);
  if (!v) throw new Error("usePlayerState outside PlayerProvider");
  return v;
}
/** Minimal subscription for rows / cards: current id + playing flag. */
export function useNowPlaying(): NowState {
  return useContext(NowCtx);
}
export function usePlayerTime(): TimeState {
  return useContext(TimeCtx);
}
/** Full API (state + actions) for heavy consumers like the player screens. */
export function usePlayer(): PlayerAPI {
  const s = usePlayerState();
  const a = usePlayerActions();
  return useMemo(() => ({ ...s, ...a, isCurrent: (id: string) => s.current?.id === id }), [s, a]);
}
