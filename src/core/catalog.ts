import { useMemo } from "react";
import type { Track } from "@/types";
import { getMeta, useMetaVersion } from "@/api/meta";
import { useGeneralStore as useCatalog, type Period, type Mature } from "@/store/general";

export type { Period, Mature };
export { useCatalog };

/* ---------------- "live" helpers ---------------- */
export function filterMature(tracks: Track[], mature: Mature): Track[] {
  return mature === "on" ? tracks : tracks.filter((t) => !t.nsfw);
}

/* ---------------- Genres ---------------- */
const GENRE_DB: [string[], string][] = [
  [["экшен", "боевик", "action"], "action"],
  [["фантастика", "sci-fi", "фэнтези", "fantasy"], "fantasy"],
  [["романтика", "romance"], "romance"],
  [["комедия", "comedy"], "comedy"],
  [["драма", "drama"], "drama"],
  [["приключения", "adventure"], "adventure"],
  [["спорт", "sports"], "sports"],
  [["музыка", "music", "идол", "idol"], "music"],
  [["хоррор", "ужасы", "horror", "триллер", "thriller", "мистика", "mystery", "детектив"], "thriller"],
  [["сёдзё", "shoujo"], "shoujo"],
  [["сейнен", "seinen"], "seinen"],
  [["сёнэн", "shounen", "shonen"], "shounen"],
  [["меха", "mecha"], "mecha"],
  [["повседневность", "slice of life"], "slice"],
  [["школа", "school"], "school"],
  [["исторический", "historical"], "historical"],
];

export interface GenreDef {
  id: string;
  label: string;
}

export const GENRES: GenreDef[] = GENRE_DB.map(([match, id]) => ({ id, label: match[0][0].toUpperCase() + match[0].slice(1) }));

export function trackGenreIds(malId: number | null | undefined): string[] {
  const g = malId ? getMeta(malId)?.genres ?? [] : [];
  if (!g.length) return [];
  const out: string[] = [];
  for (const [needles, id] of GENRE_DB) {
    if (needles.some((n) => g.some((x) => x.includes(n)))) out.push(id);
  }
  return out;
}

/** Recomputes whenever metadata lands; genre filter with graceful fallback. */
export function useGenreFilter(tracks: Track[], genre: string | null): Track[] {
  const version = useMetaVersion();
  return useMemo(() => {
    void version;
    if (!genre) return tracks;
    return tracks.filter((t) => {
      const g = trackGenreIds(t.anime.malId);
      return g.length === 0 ? true : g.includes(genre);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, genre, version]);
}
