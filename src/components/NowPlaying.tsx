import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer, usePlayerTime } from "@/store/player";
import { useLibrary } from "@/store/library";
import { useUIActions } from "@/store/ui";
import { useDownloads } from "@/store/downloads";
import { useSettings } from "@/store/settings";
import { useIsOffline } from "@/lib/offline";
import { useTrackDisplay } from "@/lib/display";
import { artistNames, extractColor, formatTime, haptic, relativeDay } from "@/lib/utils";
import { useBackClose, useMediaQuery } from "@/lib/hooks";
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";
import { Cover, IconButton, Spinner } from "./ui";

/* ---------------- Fullscreen helpers ---------------- */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const fsElement = () => {
  const d = document as FsDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
};

async function enterFullscreen(container: HTMLElement, video: HTMLVideoElement | null) {
  const el = container as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else {
      (video as IOSVideo | null)?.webkitEnterFullscreen?.();
      return;
    }
  } catch {
    (video as IOSVideo | null)?.webkitEnterFullscreen?.();
    return;
  }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
  } catch {
    /* orientation lock unsupported */
  }
}

async function exitFullscreen() {
  const d = document as FsDoc;
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
  } catch {
    /* ignore */
  }
  try {
    if (d.exitFullscreen && d.fullscreenElement) await d.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
}

/* ---------------- Seek bar ---------------- */
function SeekBar({ compact }: { compact?: boolean }) {
  const p = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? currentTime;
  const pct = duration ? (shown / duration) * 100 : 0;
  const commit = () => {
    if (scrub != null) p.seek(scrub);
    setScrub(null);
  };
  return (
    <div className={cn("w-full", compact && "flex items-center gap-2.5")}>
      {compact && <span className="w-9 text-right text-[11px] tabular-nums text-white/85">{formatTime(shown)}</span>}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(shown, duration || 0)}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onTouchEnd={commit}
        aria-label="Перемотка"
        className="ios-slider flex-1"
        style={{ ["--pct" as string]: `${pct}%`, ["--track-h" as string]: compact ? "4px" : "7px", ["--thumb" as string]: compact ? "10px" : "0px" }}
        disabled={!duration}
      />
      {compact ? (
        <span className="w-9 text-[11px] tabular-nums text-white/85">{formatTime(duration)}</span>
      ) : (
        <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-on-surface-variant">
          <span>{formatTime(shown)}</span>
          <span>-{formatTime(Math.max(0, duration - shown))}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Now Playing ---------------- */
export function NowPlaying() {
  const p = usePlayer();
  const { isFavorite, toggleFavorite } = useLibrary();
  const { openTrackMenu } = useUIActions();
  const { download } = useDownloads();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const t = p.current;
  const d = useTrackDisplay(t);
  const offline = useIsOffline(t?.id ?? "__none__", "audio");
  const open = p.nowPlayingOpen && !!t;

  useBackClose(open, p.closeNowPlaying, "now-playing");

  const [accent, setAccent] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setAccent(d.color ?? null);
    extractColor(d.cover ?? d.thumb ?? null).then((c) => alive && c && setAccent(c));
    return () => {
      alive = false;
    };
  }, [d.cover, d.thumb, d.color]);

  const videoHost = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = videoHost.current;
    const el = p.media;
    if (!host || !el) return;
    if (el.parentElement !== host) host.appendChild(el);
  }, [p.media]);

  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => {
      const active = !!fsElement();
      setFs(active);
      if (!active) {
        try {
          (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (fsElement()) void exitFullscreen();
    else if (stage.current) {
      if (!p.videoMode) p.toggleVideoMode();
      void enterFullscreen(stage.current, p.media);
    }
  }, [p]);

  /* auto-hiding video controls */
  const [ctrls, setCtrls] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const poke = useCallback(() => {
    setCtrls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setCtrls(false), 2600);
  }, []);
  useEffect(() => {
    if (p.videoMode && p.isPlaying) poke();
    else {
      setCtrls(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    }
  }, [p.videoMode, p.isPlaying, poke]);

  const lastTap = useRef(0);
  const onStageTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      toggleFullscreen();
      return;
    }
    lastTap.current = now;
    if (!p.videoMode) return;
    if (ctrls && p.isPlaying) {
      setCtrls(false);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    } else poke();
  };

  /* swipe down to dismiss */
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (startY.current = e.touches[0].clientY),
    onTouchMove: (e: React.TouchEvent) => {
      if (startY.current == null || fs) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) setDragY(dy);
    },
    onTouchEnd: () => {
      if (dragY > 110) p.closeNowPlaying();
      setDragY(0);
      startY.current = null;
    },
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const fav = t ? isFavorite(t.id) : false;
  const goAnime = () => {
    if (!t) return;
    p.closeNowPlaying();
    navigate(`/anime/${t.anime.slug}`);
  };

  return (
    <div
      className={cn("fixed inset-0 z-[60] flex flex-col overflow-hidden text-on-surface transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] md:left-[240px]", open ? "translate-y-0" : "pointer-events-none translate-y-full")}
      style={{ backgroundColor: p.videoMode ? "#000" : accent ? `color-mix(in srgb, ${accent} 34%, #0a0a0c)` : "#141416", ...(dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : null) }}
      aria-hidden={!open}
    >
      {/* Grabber + bar */}
      <div className="flex h-11 shrink-0 items-center justify-between px-2 safe-top" {...swipe}>
        <IconButton icon="expand_more" label="Свернуть" size={24} className="text-white/85" onClick={p.closeNowPlaying} />
        <div className="h-[5px] w-9 rounded-full bg-white/30" />
        <IconButton icon="more_horiz" label="Ещё" size={22} className="text-white/85" onClick={() => t && openTrackMenu(t)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn("mx-auto flex min-h-full w-full max-w-[1100px] flex-col items-center justify-center px-6 pb-8 md:flex-row md:gap-16", p.videoMode && "px-0 md:px-8")}>
          {/* Stage: artwork ⇄ video */}
          <div className={cn("relative w-full shrink-0 transition-all duration-500", p.videoMode ? "max-w-none md:max-w-[620px]" : "max-w-[min(82vw,380px)] md:max-w-[420px]")} {...(p.videoMode ? {} : swipe)}>
            <div
              ref={stage}
              onClick={onStageTap}
              onMouseMove={p.videoMode ? poke : undefined}
              className={cn(
                "group relative overflow-hidden bg-black transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                p.videoMode ? "aspect-video w-full md:rounded-xl" : "aspect-square rounded-[14px] shadow-[0_22px_60px_rgba(0,0,0,0.65)]",
                !p.videoMode && !p.isPlaying && "scale-[0.86]",
                fs && "flex h-full w-full items-center justify-center rounded-none",
              )}
            >
              {t && !p.videoMode && <Cover src={d.cover} fallback={d.thumb} alt={d.title} className="h-full w-full" rounded="rounded-[14px]" iconSize={56} priority />}
              {/* clean video surface — no overlays, no watermarks */}
              <div ref={videoHost} className={cn("absolute inset-0 bg-black", p.videoMode ? "block" : "hidden")} />
              {p.buffering && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Spinner size={38} />
                </div>
              )}

              {p.videoMode && (
                <div className={cn("absolute inset-0 flex flex-col justify-between transition-opacity duration-300", ctrls ? "opacity-100" : "pointer-events-none opacity-0")}>
                  <div className="flex items-center justify-between px-1.5 pt-1.5">
                    {fs ? (
                      <button type="button" onClick={() => void exitFullscreen()} className="tap flex h-9 items-center gap-1 rounded-full bg-black/45 pl-1.5 pr-3 text-[15px] text-white">
                        <Icon name="expand_more" size={20} />
                        Свернуть
                      </button>
                    ) : (
                      <span />
                    )}
                    <IconButton icon="videocam_off" label="Только звук" size={21} className="h-9 w-9 bg-black/40 text-white" onClick={() => { if (fs) void exitFullscreen(); p.toggleVideoMode(); }} />
                  </div>
                  <button type="button" onClick={() => { p.togglePlay(); poke(); }} aria-label={p.isPlaying ? "Пауза" : "Играть"} className="absolute left-1/2 top-1/2 flex h-[58px] w-[58px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white">
                    <Icon name={p.isPlaying ? "pause" : "play_arrow"} size={30} />
                  </button>
                  <div className="flex items-center gap-1 px-3 pb-2" onPointerDown={poke}>
                    <div className="flex-1">
                      <SeekBar compact />
                    </div>
                    <IconButton icon={fs ? "fullscreen_exit" : "fullscreen"} label={fs ? "Свернуть" : "Во весь экран"} size={22} className="h-9 w-9 text-white" onClick={toggleFullscreen} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info + controls */}
          <div className={cn("mt-7 w-full max-w-[460px] md:mt-0", p.videoMode && "px-6 md:px-0")}>
            {t && (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[22px] font-bold leading-tight tracking-[-0.02em] text-white">{t.title}</h2>
                  <p className="mt-0.5 truncate text-[19px] leading-tight text-white/60">
                    {t.artists.length && t.artists[0].slug ? (
                      t.artists.map((a, i) => (
                        <span key={a.id}>
                          {i > 0 && ", "}
                          <button type="button" className="tap" onClick={() => { p.closeNowPlaying(); navigate(`/artist/${a.slug}`); }}>
                            {a.name}
                          </button>
                        </span>
                      ))
                    ) : (
                      artistNames(t)
                    )}
                  </p>
                  <button type="button" onClick={goAnime} className="tap mt-1 flex max-w-full items-center gap-1.5 text-[13px] text-white/45">
                    <span className="font-semibold text-white/70">{t.themeSlug}</span>
                    <span className="truncate">{d.title}</span>
                    {t.createdAt && <span className="shrink-0 text-white/30">· {relativeDay(t.createdAt)}</span>}
                    <Icon name="chevron_right" size={13} />
                  </button>
                </div>
                <IconButton icon={fav ? "favorite" : "favorite_border"} label="В избранное" size={22} className={cn("mt-1 h-9 w-9 bg-white/10", fav ? "text-secondary" : "text-white")} onClick={() => toggleFavorite(t)} />
              </div>
            )}

            <div className="mt-5">
              <SeekBar />
            </div>

            {/* Transport */}
            <div className="mt-3 flex items-center justify-between px-2">
              <IconButton icon="shuffle" label="Перемешать" size={22} className={cn("h-11 w-11", p.shuffle ? "text-primary" : "text-white/55")} onClick={p.toggleShuffle} />
              <IconButton icon="skip_previous" label="Назад" size={36} className="h-14 w-14 text-white" onClick={p.prev} />
              <button type="button" onClick={() => { haptic(12); p.togglePlay(); }} aria-label={p.isPlaying ? "Пауза" : "Играть"} className="tap-scale flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white text-black">
                <Icon name={p.isPlaying ? "pause" : "play_arrow"} size={34} />
              </button>
              <IconButton icon="skip_next" label="Дальше" size={36} className="h-14 w-14 text-white" onClick={p.next} />
              <IconButton icon={p.repeat === "one" ? "repeat_one" : "repeat"} label="Повтор" size={22} className={cn("h-11 w-11", p.repeat !== "off" ? "text-primary" : "text-white/55")} onClick={p.cycleRepeat} />
            </div>

            {isDesktop && (
              <div className="mt-4 flex items-center gap-3 px-2">
                <Icon name="volume_down" size={16} className="text-white/45" />
                <input type="range" min={0} max={1} step={0.02} value={p.muted ? 0 : p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} className="ios-slider flex-1" style={{ ["--pct" as string]: `${(p.muted ? 0 : p.volume) * 100}%`, ["--track-h" as string]: "5px", ["--thumb" as string]: "0px" }} aria-label="Громкость" />
                <Icon name="volume_up" size={16} className="text-white/45" />
              </div>
            )}

            {/* Secondary actions */}
            <div className="mt-4 flex items-center justify-around">
              <button type="button" onClick={p.toggleVideoMode} className={cn("tap flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 text-[11px] font-medium", p.videoMode ? "text-primary" : "text-white/55")}>
                <Icon name={p.videoMode ? "videocam" : "videocam_off"} size={22} />
                Видео
              </button>
              <button type="button" onClick={toggleFullscreen} className="tap flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 text-[11px] font-medium text-white/55">
                <Icon name="fullscreen" size={22} />
                Экран
              </button>
              <button type="button" onClick={() => t && download(t, { kind: settings.downloadKind, saveToDevice: true })} className={cn("tap flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 text-[11px] font-medium", offline ? "text-tertiary" : "text-white/55")}>
                <Icon name={offline ? "download_done" : "download"} size={22} />
                Скачать
              </button>
              <button type="button" onClick={() => p.setQueueOpen(true)} className={cn("tap flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 text-[11px] font-medium", p.queueOpen ? "text-primary" : "text-white/55")}>
                <Icon name="queue_music" size={22} />
                Очередь
              </button>
            </div>

            {!p.videoMode && <p className="mt-3 text-center text-[11.5px] text-white/35">Видео загружается только по нажатию — звук не прерывается</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
