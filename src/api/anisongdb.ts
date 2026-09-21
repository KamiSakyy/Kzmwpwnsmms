/**
 * AnisongDB (anisongdb.com) — the database behind Anime Music Quiz and most
 * "AniSong" players. Covers openings, endings AND insert songs; media is
 * served as MP3 / WEBM from naedist.animemusicquiz.com. Key-less, CORS-enabled.
 */
import type { ThemeType, Track } from "@/types";
import { DAY, HOUR, request, rev } from "./http";

const BASE = rev("ipa/moc.bdgnosina//:sptth");
const MEDIA = rev("/moc.ziuqcisumemina.tsidean//:sptth");

interface RawArtist { id: number; names: string[] }
interface RawSong {
  annId: number;
  annSongId: number;
  animeENName: string;
  animeJPName: string;
  animeVintage?: string | null;
  animeType?: string | null;
  songType: string; // "Opening 1" | "Ending 2" | "Insert Song"
  songName: string;
  songArtist: string;
  HQ: string | null;
  MQ: string | null;
  audio: string | null;
  artists?: RawArtist[];
  linked_ids?: Record<string, number | number[] | null | undefined> | null;
}

const FILTERS = { ignore_duplicate: false, opening_filter: true, ending_filter: true, insert_filter: true };

function parseType(songType: string): { type: ThemeType; slug: string; sequence: number | null } {
  const m = /^(Opening|Ending|Insert)\s*(\d+)?/i.exec(songType);
  const kind = m?.[1]?.toLowerCase();
  const n = m?.[2] ? Number(m[2]) : null;
  if (kind === "opening") return { type: "OP", slug: `OP${n ?? ""}`, sequence: n };
  if (kind === "ending") return { type: "ED", slug: `ED${n ?? ""}`, sequence: n };
  return { type: "IN", slug: n ? `IN${n}` : "IN", sequence: n };
}

function first(v: number | number[] | null | undefined): number | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "number" ? v : null;
}

function parseVintage(v: string | null | undefined): { year: number | null; season: Track["anime"]["season"] } {
  if (!v) return { year: null, season: null };
  const m = /(Winter|Spring|Summer|Fall)\s+(\d{4})/i.exec(v);
  if (!m) return { year: null, season: null };
  const s = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return { year: Number(m[2]), season: s as Track["anime"]["season"] };
}

export function toTrack(s: RawSong): Track | null {
  const audio = s.audio ? MEDIA + s.audio : null;
  const video = s.HQ ? MEDIA + s.HQ : s.MQ ? MEDIA + s.MQ : null;
  if (!audio && !video) return null;
  const { type, slug, sequence } = parseType(s.songType);
  const malId = first(s.linked_ids?.[rev("tsileminaym")]);
  const anilistId = first(s.linked_ids?.[rev("tsilina")]);
  const { year, season } = parseVintage(s.animeVintage);
  return {
    id: `asdb:${s.annSongId}`,
    themeId: -s.annSongId,
    themeSlug: slug,
    type,
    sequence,
    title: s.songName,
    artists: (s.artists?.length ? s.artists : [{ id: 0, names: [s.songArtist] }]).map((a) => ({ id: -(a.id || 0), name: a.names?.[0] ?? s.songArtist, slug: "" })),
    anime: { id: -s.annId, name: s.animeJPName || s.animeENName, slug: malId ? `mal-${malId}` : `ann-${s.annId}`, year, season, malId, anilistId },
    cover: null,
    coverSmall: null,
    audioUrl: audio ?? (video as string),
    videoUrl: video ?? (audio as string),
    resolution: s.HQ ? 720 : s.MQ ? 480 : null,
    tags: s.HQ ? "HQ" : s.MQ ? "MQ" : "",
    version: null,
    episodes: null,
    nsfw: false,
    spoiler: false,
    source: "extra",
  };
}

const dedupe = (list: RawSong[]) => {
  const seen = new Set<number>();
  return list.filter((s) => (seen.has(s.annSongId) ? false : (seen.add(s.annSongId), true)));
};

export async function searchAnisongDB(q: string, signal?: AbortSignal): Promise<Track[]> {
  const body = JSON.stringify({
    anime_search_filter: { search: q, partial_match: true },
    song_name_search_filter: { search: q, partial_match: true },
    artist_search_filter: { search: q, partial_match: true, group_granularity: 0, max_other_artist: 99 },
    and_logic: false,
    ...FILTERS,
  });
  const list = await request<RawSong[]>(`${BASE}/search_request`, { body, fresh: 6 * HOUR, maxAge: 7 * DAY, signal, timeout: 15_000 });
  return dedupe(list ?? []).map(toTrack).filter((t): t is Track => !!t).slice(0, 60);
}

/** All songs for an anime: tries MAL-id lookup, falls back to exact-name search. */
export async function getAnisongsForAnime(malId: number | null | undefined, names: string[], signal?: AbortSignal): Promise<Track[]> {
  let list: RawSong[] = [];
  if (malId) {
    try {
      list = (await request<RawSong[]>(`${BASE}/malIDs_request`, { body: JSON.stringify({ malIds: [malId], ...FILTERS }), fresh: 7 * DAY, maxAge: 30 * DAY, signal, timeout: 15_000 })) ?? [];
    } catch {
      list = [];
    }
  }
  if (!list.length) {
    for (const name of names.filter(Boolean).slice(0, 2)) {
      try {
        const r = await request<RawSong[]>(`${BASE}/search_request`, {
          body: JSON.stringify({ anime_search_filter: { search: name, partial_match: false }, and_logic: false, ...FILTERS }),
          fresh: 7 * DAY,
          maxAge: 30 * DAY,
          signal,
          timeout: 15_000,
        });
        if (r?.length) {
          list = r;
          break;
        }
      } catch {
        /* try next name */
      }
    }
  }
  const tracks = dedupe(list).map(toTrack).filter((t): t is Track => !!t);
  const order = { OP: 0, ED: 1, IN: 2 };
  return tracks.sort((a, b) => order[a.type] - order[b.type] || (a.sequence ?? 0) - (b.sequence ?? 0));
}

export async function getRandomAnisongs(signal?: AbortSignal): Promise<Track[]> {
  const list = await request<RawSong[]>(`${BASE}/get_50_random_songs`, { body: "{}", cacheKey: `${BASE}/get_50_random_songs#${Date.now()}`, noStore: true, signal, timeout: 15_000 });
  return dedupe(list ?? []).map(toTrack).filter((t): t is Track => !!t);
}
