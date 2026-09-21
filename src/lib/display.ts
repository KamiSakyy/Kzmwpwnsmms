import { fixShikiHost, useAnimeMeta } from "@/api/meta";
import { useSettings } from "@/store/settings";
import type { AnimeRef, AnimeSummary, Track } from "@/types";

export interface AnimeDisplay {
  /** primary title (Russian when available & enabled) */
  title: string;
  /** original title when it differs from primary */
  original: string | null;
  /** best poster for the current data mode */
  cover: string | null;
  /** lightweight poster for tiny thumbnails */
  thumb: string | null;
  banner: string | null;
  color: string | null;
  score: number | null;
  malId: number | null;
}

type Like = (AnimeRef & { cover?: string | null; coverSmall?: string | null }) | null | undefined;

/** Resolve display data for an anime-like object (Track.anime, AnimeSummary, …). */
export function useAnimeDisplay(anime: Like, fallbackCover?: string | null, fallbackSmall?: string | null): AnimeDisplay {
  const { settings } = useSettings();
  const malId = anime?.malId ?? null;
  const meta = useAnimeMeta(malId);
  const name = anime?.name ?? "";
  const ru = settings.ruTitles ? meta?.ru ?? null : null;
  const title = ru || name || meta?.name || "";
  const large = anime?.cover ?? fallbackCover ?? null;
  const small = anime?.coverSmall ?? fallbackSmall ?? null;
  const hi = fixShikiHost(meta?.poster ?? meta?.posterShiki ?? null);
  const cover = settings.dataSaver ? small ?? large ?? hi : hi ?? large ?? small;
  return {
    title,
    original: ru && ru !== name && name ? name : null,
    cover,
    // thumbnails: full-size art unless the user asked to save data
    thumb: settings.dataSaver ? small ?? large ?? hi : large ?? hi ?? small,
    banner: meta?.banner ?? null,
    color: meta?.color ?? null,
    score: meta?.score ?? null,
    malId,
  };
}

export function useTrackDisplay(t: Track | null | undefined): AnimeDisplay {
  return useAnimeDisplay(t?.anime ?? null, t?.cover ?? null, t?.coverSmall ?? null);
}

export function useSummaryDisplay(a: AnimeSummary | null | undefined): AnimeDisplay {
  return useAnimeDisplay(a ?? null, a?.cover ?? null, a?.coverSmall ?? null);
}
