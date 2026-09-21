import { useRef, useState } from "react";
import { usePlayer, usePlayerTime } from "@/store/player";
import { useLibrary } from "@/store/library";
import { useMediaQuery } from "@/lib/hooks";
import { useTrackDisplay } from "@/lib/display";
import { artistNames, formatTime } from "@/lib/utils";
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";
import { Cover, IconButton, Spinner } from "./ui";

export function MiniPlayer() {
  const p = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const { isFavorite, toggleFavorite } = useLibrary();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [scrub, setScrub] = useState<number | null>(null);
  const startY = useRef<number | null>(null);
  const t = p.current;
  const d = useTrackDisplay(t);
  if (!t) return null;

  const shown = scrub ?? currentTime;
  const pct = duration ? (shown / duration) * 100 : 0;
  const fav = isFavorite(t.id);

  /* iOS mini player: floating card above the tab bar */
  if (!isDesktop) {
    return (
      <div className={cn("fixed inset-x-0 z-40 px-2 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", "bottom-[calc(49px_+_env(safe-area-inset-bottom,0px)_+_6px)]", p.nowPlayingOpen && "pointer-events-none translate-y-3 opacity-0")}>
        <div
          role="button"
          tabIndex={0}
          aria-label="Открыть плеер"
          onClick={p.openNowPlaying}
          onKeyDown={(e) => e.key === "Enter" && p.openNowPlaying()}
          onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
          onTouchEnd={(e) => {
            if (startY.current != null && startY.current - e.changedTouches[0].clientY > 36) p.openNowPlaying();
            startY.current = null;
          }}
          className="tap relative mx-auto flex h-[58px] max-w-lg items-center gap-2.5 overflow-hidden rounded-[14px] bg-surface-2 pl-2 pr-1 shadow-[0_6px_24px_rgba(0,0,0,0.6)] animate-slide-up"
        >
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
            <div className="h-full bg-white/70 transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <div className="relative h-[42px] w-[42px] shrink-0">
            <Cover src={d.thumb ?? d.cover} fallback={d.cover} alt="" className="h-full w-full" rounded="rounded-[8px]" iconSize={18} eager />
            {p.buffering && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/45">
                <Spinner size={18} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-medium leading-tight text-on-surface">{t.title}</p>
            <p className="truncate text-[12.5px] leading-tight text-on-surface-variant">{artistNames(t)}</p>
          </div>
          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            <IconButton icon={p.isPlaying ? "pause" : "play_arrow"} label={p.isPlaying ? "Пауза" : "Играть"} size={26} className="h-10 w-10" onClick={p.togglePlay} />
            <IconButton icon="skip_next" label="Дальше" size={24} className="h-10 w-10" onClick={p.next} disabled={p.queue.length < 2} />
          </div>
        </div>
      </div>
    );
  }

  /* Desktop dock */
  return (
    <div className={cn("fixed bottom-0 left-[240px] right-0 z-40 h-[74px] bg-surface-1 hairline-t transition-transform duration-300", p.nowPlayingOpen && "translate-y-full")}>
      <div className="grid h-full grid-cols-[minmax(0,28%)_1fr_minmax(0,28%)] items-center gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={p.openNowPlaying} className="tap-scale relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px]" aria-label="Открыть плеер">
            <Cover src={d.thumb ?? d.cover} fallback={d.cover} alt="" className="h-full w-full" rounded="rounded-[8px]" iconSize={18} eager />
            {p.buffering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                <Spinner size={18} />
              </div>
            )}
          </button>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-on-surface">{t.title}</p>
            <p className="truncate text-[12.5px] text-on-surface-variant">{artistNames(t)}</p>
          </div>
          <IconButton icon={fav ? "favorite" : "favorite_border"} label="В избранное" size={18} className={cn("h-9 w-9", fav ? "text-secondary" : "text-on-surface-dim")} onClick={() => toggleFavorite(t)} />
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-0.5">
          <div className="flex items-center gap-2">
            <IconButton icon="shuffle" label="Перемешать" size={18} active={p.shuffle} className={cn("h-8 w-8", !p.shuffle && "text-on-surface-dim")} onClick={p.toggleShuffle} />
            <IconButton icon="skip_previous" label="Назад" size={24} className="h-9 w-9" onClick={p.prev} />
            <button type="button" onClick={p.togglePlay} aria-label={p.isPlaying ? "Пауза" : "Играть"} className="tap-scale flex h-9 w-9 items-center justify-center rounded-full bg-white text-black">
              <Icon name={p.isPlaying ? "pause" : "play_arrow"} size={20} />
            </button>
            <IconButton icon="skip_next" label="Дальше" size={24} className="h-9 w-9" onClick={p.next} />
            <IconButton icon={p.repeat === "one" ? "repeat_one" : "repeat"} label="Повтор" size={18} active={p.repeat !== "off"} className={cn("h-8 w-8", p.repeat === "off" && "text-on-surface-dim")} onClick={p.cycleRepeat} />
          </div>
          <div className="flex w-full items-center gap-2">
            <span className="w-9 text-right text-[11px] tabular-nums text-on-surface-variant">{formatTime(shown)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(shown, duration || 0)}
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={() => {
                if (scrub != null) p.seek(scrub);
                setScrub(null);
              }}
              onKeyUp={() => {
                if (scrub != null) p.seek(scrub);
                setScrub(null);
              }}
              disabled={!duration}
              aria-label="Перемотка"
              className="ios-slider h-3 flex-1"
              style={{ ["--pct" as string]: `${pct}%`, ["--track-h" as string]: "4px", ["--thumb" as string]: "10px" }}
            />
            <span className="w-9 text-[11px] tabular-nums text-on-surface-variant">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          <IconButton icon={p.videoMode ? "videocam" : "videocam_off"} label="Видео" size={19} active={p.videoMode} className={cn("h-9 w-9", !p.videoMode && "text-on-surface-dim")} onClick={p.toggleVideoMode} />
          <IconButton icon="queue_music" label="Очередь" size={19} active={p.queueOpen} className={cn("h-9 w-9", !p.queueOpen && "text-on-surface-dim")} onClick={() => p.setQueueOpen(!p.queueOpen)} />
          <IconButton icon={p.muted || p.volume === 0 ? "volume_off" : p.volume < 0.5 ? "volume_down" : "volume_up"} label="Звук" size={19} className="h-9 w-9 text-on-surface-dim" onClick={p.toggleMute} />
          <input type="range" min={0} max={1} step={0.02} value={p.muted ? 0 : p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} className="ios-slider w-20" style={{ ["--pct" as string]: `${(p.muted ? 0 : p.volume) * 100}%`, ["--track-h" as string]: "4px", ["--thumb" as string]: "10px" }} aria-label="Громкость" />
          <IconButton icon="expand_less" label="Развернуть" size={20} className="h-9 w-9" onClick={p.openNowPlaying} />
        </div>
      </div>
    </div>
  );
}
