import { memo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { AnimeSummary, ArtistSummary, Track } from "@/types";
import { cn } from "@/utils/cn";
import { artistNames } from "@/lib/utils";
import { useIsOffline } from "@/lib/offline";
import { useSummaryDisplay, useTrackDisplay } from "@/lib/display";
import { prefetchAnime, prefetchArtist } from "@/api/animethemes";
import { useNowPlaying, usePlayerActions } from "@/store/player";
import { useUIActions } from "@/store/ui";
import { useLibrary } from "@/store/library";
import { Icon } from "./Icon";
import { Cover, PlayingBars, Tag } from "./ui";

/* ---------------- Track row ---------------- */
interface TrackRowProps {
  track: Track;
  context?: Track[];
  index?: number;
  showAnime?: boolean;
  showVersion?: boolean;
  dense?: boolean;
  onRemove?: () => void;
  trailing?: ReactNode;
}

export const TrackRow = memo(function TrackRow({ track, context, showAnime = true, showVersion = false, dense = false, onRemove, trailing }: TrackRowProps) {
  const { playTrack } = usePlayerActions();
  const now = useNowPlaying();
  const { openTrackMenu } = useUIActions();
  const { isFavorite } = useLibrary();
  const offline = useIsOffline(track.id);
  const d = useTrackDisplay(track);
  const active = now.id === track.id;
  const playing = active && now.isPlaying;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => playTrack(track, context)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playTrack(track, context);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openTrackMenu(track);
      }}
      className={cn("row-tap group relative flex w-full items-center gap-3 pl-4 pr-1 text-left md:pl-6", dense ? "py-1.5" : "py-[7px]")}
    >
      <div className="relative shrink-0">
        <Cover src={d.thumb ?? d.cover} fallback={d.cover} alt="" className={cn(dense ? "h-11 w-11" : "h-[50px] w-[50px]")} rounded="rounded-[10px]" iconSize={20} />
        <div className={cn("absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/55 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          {active ? <PlayingBars paused={!playing} /> : <Icon name="play_arrow" size={24} className="text-white" />}
        </div>
      </div>
      <div className={cn("flex min-w-0 flex-1 items-center gap-3", dense ? "border-t-0" : "")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate text-[15.5px] leading-tight", active ? "text-on-surface" : "text-on-surface", active && "font-semibold")}>{track.title}</span>
            {track.nsfw && <Tag tone="warn">18+</Tag>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] leading-tight text-on-surface-variant">
            <Tag tone={track.type}>
              {track.themeSlug}
              {showVersion && track.version && track.version > 1 ? ` v${track.version}` : ""}
            </Tag>
            {offline && <Icon name="offline_pin" size={13} className="shrink-0 text-tertiary" />}
            <span className="truncate">
              {artistNames(track)}
              {showAnime && ` · ${d.title}`}
            </span>
          </p>
        </div>
        {isFavorite(track.id) && <Icon name="favorite" size={14} className="shrink-0 text-on-surface-variant" />}
        {trailing}
        <button
          type="button"
          aria-label={onRemove ? "Убрать" : "Ещё"}
          onClick={(e) => {
            e.stopPropagation();
            if (onRemove) onRemove();
            else openTrackMenu(track);
          }}
          className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-dim"
        >
          <Icon name={onRemove ? "close" : "more_horiz"} size={onRemove ? 17 : 20} />
        </button>
      </div>
    </div>
  );
});

/* ---------------- Track card ---------------- */
export const TrackCard = memo(function TrackCard({ track, context, className }: { track: Track; context?: Track[]; className?: string }) {
  const { playTrack } = usePlayerActions();
  const now = useNowPlaying();
  const { openTrackMenu } = useUIActions();
  const d = useTrackDisplay(track);
  const active = now.id === track.id;
  return (
    <div className={cn("w-[138px] shrink-0 snap-start md:w-[156px]", className)}>
      <button
        type="button"
        onClick={() => playTrack(track, context)}
        onContextMenu={(e) => {
          e.preventDefault();
          openTrackMenu(track);
        }}
        className="tap-scale relative block w-full overflow-hidden rounded-[14px] text-left"
      >
        <Cover src={d.cover} fallback={d.thumb} alt={d.title} className="aspect-square w-full" rounded="rounded-[14px]" iconSize={40} />
        <div className={cn("absolute inset-0 flex items-center justify-center rounded-[14px] bg-black/45 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-xl">
            {active ? <PlayingBars paused={!now.isPlaying} color="bg-black" /> : <Icon name="play_arrow" size={26} />}
          </span>
        </div>
      </button>
      <p className="mt-2 truncate text-[14px] font-medium leading-tight text-on-surface">{track.title}</p>
      <p className="mt-0.5 truncate text-[12.5px] leading-tight text-on-surface-variant">
        <span className="font-semibold text-on-surface-variant/80">{track.themeSlug}</span> · {d.title}
      </p>
    </div>
  );
});

/* ---------------- Anime card ---------------- */
export const AnimeCard = memo(function AnimeCard({ anime, className, wide }: { anime: AnimeSummary; className?: string; wide?: boolean }) {
  const navigate = useNavigate();
  const d = useSummaryDisplay(anime);
  const warm = () => prefetchAnime(anime.slug);
  return (
    <button type="button" onClick={() => navigate(`/anime/${anime.slug}`)} onPointerEnter={warm} onTouchStart={warm} onFocus={warm} className={cn("tap-scale shrink-0 snap-start text-left", wide ? "w-full" : "w-[112px] md:w-[136px]", className)}>
      <div className="relative overflow-hidden rounded-[12px]">
        <Cover src={d.cover} fallback={d.thumb} alt={d.title} className="aspect-[2/3] w-full" rounded="rounded-[12px]" iconSize={32} />
        {d.score != null && d.score > 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold text-white">{d.score.toFixed(1)}</span>}
      </div>
      <p className="mt-2 line-clamp-2 text-[13.5px] font-medium leading-tight text-on-surface">{d.title}</p>
      {anime.year && <p className="mt-1 truncate text-[12px] leading-none text-on-surface-dim">{anime.year}</p>}
    </button>
  );
});

/* ---------------- Artist card ---------------- */
export const ArtistCard = memo(function ArtistCard({ artist, className }: { artist: ArtistSummary; className?: string }) {
  const navigate = useNavigate();
  const warm = () => prefetchArtist(artist.slug);
  return (
    <button type="button" onClick={() => navigate(`/artist/${artist.slug}`)} onPointerEnter={warm} onTouchStart={warm} onFocus={warm} className={cn("tap-scale w-[92px] shrink-0 snap-start text-center", className)}>
      <div className="relative mx-auto h-[84px] w-[84px] overflow-hidden rounded-full">
        {artist.image || artist.imageSmall ? (
          <Cover src={artist.image ?? artist.imageSmall} fallback={artist.imageSmall} alt={artist.name} className="h-full w-full" rounded="rounded-full" iconSize={30} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-2 text-on-surface-dim">
            <Icon name="mic" size={26} />
          </div>
        )}
      </div>
      <p className="mt-2 truncate text-[13px] font-medium text-on-surface">{artist.name}</p>
    </button>
  );
});

/* ---------------- Mix card (monochrome tile) ---------------- */
export function MixCard({ title, subtitle, onPlay, loading }: { title: string; subtitle: string; color?: string; onPlay: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onPlay} className="tap-scale relative h-[108px] w-[196px] shrink-0 snap-start rounded-[16px] bg-surface-2 p-4 text-left md:w-[224px]">
      <Icon name="auto_awesome" size={18} className="text-on-surface-dim" />
      <div className="absolute bottom-3.5 left-4 right-12">
        <p className="text-[15px] font-bold leading-tight text-on-surface">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">{subtitle}</p>
      </div>
      <span className="absolute bottom-3 right-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black">
        {loading ? <Spinner18 /> : <Icon name="play_arrow" size={18} />}
      </span>
    </button>
  );
}

const Spinner18 = () => <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />;
