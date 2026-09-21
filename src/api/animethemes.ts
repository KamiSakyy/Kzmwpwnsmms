import type { AnimeDetail, AnimeRef, AnimeSummary, ArtistDetail, ArtistSummary, SearchResults, Season, ThemeType, Track } from "@/types";
import { ApiError, DAY, MIN, buildUrl, request, rev, type Priority } from "./http";
import { warmMeta } from "./meta";

const HOUR = 60 * 60_000;

export { ApiError };

/**
 * AnimeThemes.moe — public, key-less REST API with full OP/ED audio & video.
 * Docs: https://api-docs.animethemes.moe
 *
 * Endpoint quirks (verified live):
 *  • `/anime`       accepts include=resources and fields[resource]
 *  • `/animetheme`  REJECTS anime.resources and fields[resource]  → MAL ids are attached in a 2nd batched call
 *  • `/search`      accepts include[anime]=resources but not include[animetheme]=anime.resources
 *  • `/resource`    only works with include=anime and NO sparse fieldsets
 */
const BASE = rev("eom.semehtemina.ipa//:sptth");

/* ------------------------------------------------------------------ */
/* Raw API shapes (only what we use)                                   */
/* ------------------------------------------------------------------ */
interface RawImage { id?: number; facet: string; link: string }
interface RawArtist { id: number; name: string; slug: string; information?: string | null; images?: RawImage[]; songs?: RawSong[] }
interface RawSong { id: number; title: string | null; artists?: RawArtist[]; animethemes?: RawTheme[] }
interface RawAudio { id: number; link: string }
interface RawVideo { id: number; link: string; resolution: number | null; tags?: string | null; nc?: boolean; basename?: string; audio?: RawAudio | null }
interface RawEntry { id: number; version: number | null; episodes: string | null; nsfw: boolean; spoiler: boolean; videos?: RawVideo[] }
interface RawTheme { id: number; slug: string; type: ThemeType; sequence: number | null; song?: RawSong | null; anime?: RawAnime; animethemeentries?: RawEntry[] }
interface RawResource { site: string; link: string; external_id?: number | null; anime?: RawAnime[] }
interface RawAnime {
  id: number; name: string; slug: string; year: number | null; season: Season | null;
  synopsis?: string | null; media_format?: string | null;
  images?: RawImage[]; animethemes?: RawTheme[];
  studios?: { name: string; slug: string }[];
  series?: { name: string; slug: string }[];
  resources?: RawResource[];
}

/* ------------------------------------------------------------------ */
/* Query helper                                                        */
/* ------------------------------------------------------------------ */
type Params = Record<string, string | number | undefined>;
export type Period = "today" | "week" | "all";

export interface QueryOpts<T = unknown> {
  signal?: AbortSignal;
  /** bypass caches and get a brand-new response */
  refresh?: boolean;
  /** receives silently revalidated data */
  onUpdate?: (data: T) => void;
  priority?: Priority;
}
interface Policy { fresh?: number; maxAge?: number; ttl?: number; noStore?: boolean }

async function api<Raw, Out>(path: string, params: Params, map: (raw: Raw) => Out, o: QueryOpts<Out> = {}, policy: Policy = {}, post?: (out: Out, signal?: AbortSignal) => Promise<void>): Promise<Out> {
  const cacheKey = buildUrl(BASE, path, params);
  const url = o.refresh ? buildUrl(BASE, path, { ...params, _r: Date.now() }) : cacheKey;
  const onUpdate = o.onUpdate;
  const raw = await request<Raw>(url, {
    ...policy,
    cacheKey,
    refresh: o.refresh,
    priority: o.priority,
    signal: o.signal,
    onUpdate: onUpdate
      ? (r) => {
          const out = map(r);
          if (post) post(out).then(() => onUpdate(out)).catch(() => onUpdate(out));
          else onUpdate(out);
        }
      : undefined,
  });
  const out = map(raw);
  if (post) {
    try {
      await post(out, o.signal);
    } catch {
      /* enrichment is best-effort */
    }
  }
  return out;
}

/* Sparse field sets keep payloads tiny */
const F = {
  "fields[anime]": "id,name,slug,year,season,media_format",
  "fields[animetheme]": "id,slug,type,sequence,created_at",
  "fields[song]": "id,title",
  "fields[artist]": "id,name,slug",
  "fields[animethemeentry]": "id,version,episodes,nsfw,spoiler",
  "fields[video]": "id,link,resolution,tags,nc",
  "fields[audio]": "id,link",
  "fields[image]": "id,facet,link",
};
/** Only for `/anime` endpoints (resources are includable there) */
const FR = { ...F, "fields[resource]": "site,link,external_id" };

const THEME_INCLUDE = "anime.images,song.artists,animethemeentries.videos.audio";
const ANIME_THEMES_INCLUDE = "images,resources,animethemes.song.artists,animethemes.animethemeentries.videos.audio";
const ANIME_LIST_INCLUDE = "images,resources";

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */
function pickImage(images: RawImage[] | undefined, facet: "Large Cover" | "Small Cover"): string | null {
  if (!images?.length) return null;
  return images.find((i) => i.facet === facet)?.link ?? images[0]?.link ?? null;
}

const SITE_MAL = rev("tsiLeminAyM");
const SITE_AL = rev("tsiLinA");

function externalId(a: RawAnime, site: string): number | null {
  const r = a.resources?.find((x) => x.site === site);
  if (!r) return null;
  if (typeof r.external_id === "number") return r.external_id;
  const m = /\/(\d+)\/?$/.exec(r.link ?? "");
  return m ? Number(m[1]) : null;
}

const toAnimeRef = (a: RawAnime): AnimeRef => ({
  id: a.id,
  name: a.name,
  slug: a.slug,
  year: a.year ?? null,
  season: a.season ?? null,
  malId: a.resources ? externalId(a, SITE_MAL) : undefined,
  anilistId: a.resources ? externalId(a, SITE_AL) : undefined,
});

export function toAnimeSummary(a: RawAnime): AnimeSummary {
  return { ...toAnimeRef(a), cover: pickImage(a.images, "Large Cover"), coverSmall: pickImage(a.images, "Small Cover"), mediaFormat: a.media_format ?? null, synopsis: a.synopsis ?? null };
}

/** Best video for an entry: creditless first, then highest resolution. */
function bestVideo(videos: RawVideo[] | undefined): RawVideo | null {
  if (!videos?.length) return null;
  const withAudio = videos.filter((v) => v.audio?.link);
  const pool = withAudio.length ? withAudio : videos;
  return [...pool].sort((a, b) => Number(!!b.nc) - Number(!!a.nc) || (b.resolution ?? 0) - (a.resolution ?? 0))[0];
}

function themeToTracks(theme: RawTheme, anime: RawAnime, songOverride?: RawSong | null): Track[] {
  const song = songOverride ?? theme.song ?? null;
  const cover = pickImage(anime.images, "Large Cover");
  const coverSmall = pickImage(anime.images, "Small Cover");
  const ref = toAnimeRef(anime);
  const out: Track[] = [];
  for (const entry of theme.animethemeentries ?? []) {
    const video = bestVideo(entry.videos);
    if (!video) continue;
    out.push({
      id: `${theme.id}:${entry.id}:${video.id}`,
      themeId: theme.id,
      themeSlug: theme.slug,
      type: theme.type,
      sequence: theme.sequence ?? null,
      title: song?.title || theme.slug,
      artists: (song?.artists ?? []).map((ar) => ({ id: ar.id, name: ar.name, slug: ar.slug })),
      anime: { ...ref },
      cover,
      coverSmall,
      audioUrl: video.audio?.link ?? video.link,
      videoUrl: video.link,
      resolution: video.resolution ?? null,
      tags: video.tags ?? "",
      version: entry.version ?? null,
      episodes: entry.episodes ?? null,
      nsfw: !!entry.nsfw,
      spoiler: !!entry.spoiler,
      source: "primary",
      createdAt: (theme as RawTheme & { created_at?: string | null }).created_at ?? null,
    });
  }
  return out;
}

const themePrimaryTrack = (theme: RawTheme, anime: RawAnime, song?: RawSong | null): Track | null => themeToTracks(theme, anime, song)[0] ?? null;

function sortThemes(themes: RawTheme[]): RawTheme[] {
  const order: Record<string, number> = { OP: 0, ED: 1 };
  return [...themes].sort((a, b) => (order[a.type] ?? 2) - (order[b.type] ?? 2) || (a.sequence ?? 0) - (b.sequence ?? 0) || a.slug.localeCompare(b.slug));
}

export function animeToTracks(a: RawAnime, allVersions = false): Track[] {
  const out: Track[] = [];
  for (const th of sortThemes(a.animethemes ?? [])) {
    if (allVersions) out.push(...themeToTracks(th, a));
    else {
      const t = themePrimaryTrack(th, a);
      if (t) out.push(t);
    }
  }
  return out;
}

function themesToTracks(themes: RawTheme[] | undefined, limit = Infinity): Track[] {
  const out: Track[] = [];
  for (const th of themes ?? []) {
    if (!th.anime) continue;
    const t = themePrimaryTrack(th, th.anime);
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

const toArtistSummary = (ar: RawArtist): ArtistSummary => ({ id: ar.id, name: ar.name, slug: ar.slug, image: pickImage(ar.images, "Large Cover"), imageSmall: pickImage(ar.images, "Small Cover") });

/* ------------------------------------------------------------------ */
/* MAL-id enrichment (for endpoints that can't include resources)      */
/* ------------------------------------------------------------------ */
interface IdPair { malId: number | null; anilistId: number | null }
const idCache = new Map<string, IdPair>();

/** Resolve MyAnimeList / AniList ids for anime slugs in one batched call (cached). */
export async function resolveIds(slugs: string[], signal?: AbortSignal): Promise<Map<string, IdPair>> {
  const need = [...new Set(slugs)].filter((s) => s && !idCache.has(s));
  for (let i = 0; i < need.length; i += 80) {
    const chunk = need.slice(i, i + 80);
    try {
      const url = buildUrl(BASE, "/anime", { "filter[slug]": chunk.join(","), include: "resources", "fields[anime]": "id,slug", "fields[resource]": "site,link,external_id", "page[size]": 100 });
      const d = await request<{ anime: RawAnime[] }>(url, { fresh: 30 * DAY, maxAge: 90 * DAY, priority: "low", signal, retries: 1 });
      for (const a of d.anime ?? []) idCache.set(a.slug, { malId: externalId(a, SITE_MAL), anilistId: externalId(a, SITE_AL) });
      for (const s of chunk) if (!idCache.has(s)) idCache.set(s, { malId: null, anilistId: null });
    } catch {
      /* best effort — never block the actual track list */
    }
  }
  const out = new Map<string, IdPair>();
  for (const s of slugs) {
    const v = idCache.get(s);
    if (v) out.set(s, v);
  }
  return out;
}

async function attachIds(tracks: Track[], signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const missing = tracks.filter((t) => t.anime.malId === undefined).map((t) => t.anime.slug);
  if (!missing.length) return;
  const map = await resolveIds(missing, signal);
  for (const t of tracks) {
    if (t.anime.malId !== undefined) continue;
    const v = map.get(t.anime.slug);
    t.anime.malId = v?.malId ?? null;
    t.anime.anilistId = v?.anilistId ?? null;
  }
  warmMeta(tracks.map((t) => t.anime.malId));
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export function searchAll(q: string, o: QueryOpts<SearchResults> = {}): Promise<SearchResults> {
  return api<{ search: { anime?: RawAnime[]; animethemes?: RawTheme[]; artists?: RawArtist[] } }, SearchResults>(
    "/search",
    {
      q,
      "fields[search]": "anime,animethemes,artists",
      "page[limit]": 12,
      "include[anime]": ANIME_LIST_INCLUDE,
      "include[animetheme]": THEME_INCLUDE,
      "include[artist]": "images",
      ...F,
    },
    (d) => {
      const anime = (d.search.anime ?? []).map(toAnimeSummary);
      const tracks = themesToTracks(d.search.animethemes);
      // reuse ids from the anime hits where possible
      const known = new Map(anime.map((a) => [a.slug, a]));
      for (const t of tracks) {
        const a = known.get(t.anime.slug);
        if (a && a.malId !== undefined) {
          t.anime.malId = a.malId;
          t.anime.anilistId = a.anilistId;
        }
      }
      return { anime, tracks, artists: (d.search.artists ?? []).map(toArtistSummary) };
    },
    { priority: "high", ...o },
    { fresh: 30 * MIN, maxAge: DAY },
    (out, s) => attachIds(out.tracks, s),
  );
}

export function getAnime(slug: string, o: QueryOpts<AnimeDetail> = {}): Promise<AnimeDetail> {
  return api<{ anime: RawAnime }, AnimeDetail>(
    `/anime/${encodeURIComponent(slug)}`,
    {
      include: `${ANIME_THEMES_INCLUDE},studios,series`,
      ...FR,
      "fields[anime]": "id,name,slug,year,season,media_format,synopsis",
      "fields[studio]": "name,slug",
      "fields[series]": "name,slug",
    },
    ({ anime: a }) => ({ ...toAnimeSummary(a), synopsis: a.synopsis ?? null, tracks: animeToTracks(a, true), studios: a.studios ?? [], series: a.series ?? [], resources: (a.resources ?? []).map((r) => ({ site: r.site, link: r.link })) }),
    o,
    { fresh: 6 * HOUR, maxAge: 30 * DAY },
  );
}

export function getArtist(slug: string, o: QueryOpts<ArtistDetail> = {}): Promise<ArtistDetail> {
  return api<{ artist: RawArtist }, ArtistDetail>(
    `/artist/${encodeURIComponent(slug)}`,
    { include: "images,songs.artists,songs.animethemes.anime.images,songs.animethemes.animethemeentries.videos.audio", ...F, "fields[artist]": "id,name,slug,information" },
    ({ artist: ar }) => {
      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const song of ar.songs ?? []) {
        for (const th of song.animethemes ?? []) {
          if (!th.anime) continue;
          const t = themePrimaryTrack(th, th.anime, { ...song, artists: song.artists?.length ? song.artists : [ar] });
          if (t && !seen.has(t.id)) {
            seen.add(t.id);
            tracks.push(t);
          }
        }
      }
      tracks.sort((a, b) => (b.anime.year ?? 0) - (a.anime.year ?? 0));
      return { ...toArtistSummary(ar), information: ar.information ?? null, tracks };
    },
    o,
    { fresh: 6 * HOUR, maxAge: 30 * DAY },
    (out, s) => attachIds(out.tracks, s),
  );
}

/** Random themes. Last set paints instantly from disk; `refresh` pulls a new one. */
export function getRandomTracks(count = 20, type?: ThemeType, o: QueryOpts<Track[]> = {}): Promise<Track[]> {
  return api<{ animethemes: RawTheme[] }, Track[]>(
    "/animetheme",
    { sort: "random", "page[size]": Math.min(100, count), include: THEME_INCLUDE, "filter[type]": type, "filter[has]": "animethemeentries.videos", ...F },
    (d) => themesToTracks(d.animethemes, count),
    o,
    { fresh: 0, maxAge: 2 * DAY },
    attachIds,
  );
}

export function getLatestTracks(count = 20, o: QueryOpts<Track[]> = {}): Promise<Track[]> {
  return api<{ animethemes: RawTheme[] }, Track[]>(
    "/animetheme",
    { sort: "-id", "page[size]": Math.min(100, count + 6), include: THEME_INCLUDE, "filter[has]": "animethemeentries.videos", ...F },
    (d) => themesToTracks(d.animethemes, count),
    o,
    { fresh: 15 * MIN, maxAge: 3 * DAY },
    attachIds,
  );
}

/** Resolve anime by MyAnimeList ids (Russian search via Shikimori, cross-source links). */
export async function getAnimeByMalIds(ids: number[], o: QueryOpts<AnimeSummary[]> = {}): Promise<AnimeSummary[]> {
  const clean = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  if (!clean.length) return [];
  const url = buildUrl(BASE, "/resource", { "filter[site]": SITE_MAL, "filter[external_id]": clean.join(","), include: "anime", "page[size]": 50 });
  const d = await request<{ resources: RawResource[] }>(url, { fresh: 7 * DAY, maxAge: 30 * DAY, signal: o.signal, priority: o.priority });
  const slugByMal = new Map<number, string>();
  for (const r of d.resources ?? []) {
    if (typeof r.external_id !== "number" || !r.anime?.length) continue;
    if (!slugByMal.has(r.external_id)) slugByMal.set(r.external_id, r.anime[0].slug);
  }
  const slugs = clean.map((id) => slugByMal.get(id)).filter((s): s is string => !!s);
  if (!slugs.length) return [];
  const list = await getAnimeBySlugs(slugs, o);
  const bySlug = new Map(list.map((a) => [a.slug, a]));
  return clean
    .map((id) => {
      const s = slugByMal.get(id);
      const a = s ? bySlug.get(s) : undefined;
      if (a && a.malId == null) a.malId = id;
      return a;
    })
    .filter((x): x is AnimeSummary => !!x);
}

export function getAnimeBySlugs(slugs: string[], o: QueryOpts<AnimeSummary[]> = {}): Promise<AnimeSummary[]> {
  if (!slugs.length) return Promise.resolve([]);
  return api<{ anime: RawAnime[] }, AnimeSummary[]>(
    "/anime",
    { "filter[slug]": slugs.join(","), include: ANIME_LIST_INCLUDE, "page[size]": 100, ...FR },
    (d) => {
      const map = new Map(d.anime.map((a) => [a.slug, toAnimeSummary(a)]));
      return slugs.map((s) => map.get(s)).filter((x): x is AnimeSummary => !!x);
    },
    o,
    { fresh: DAY, maxAge: 30 * DAY },
  );
}

export function getArtistsBySlugs(slugs: string[], o: QueryOpts<ArtistSummary[]> = {}): Promise<ArtistSummary[]> {
  if (!slugs.length) return Promise.resolve([]);
  return api<{ artists: RawArtist[] }, ArtistSummary[]>(
    "/artist",
    { "filter[slug]": slugs.join(","), include: "images", "page[size]": 100, ...F },
    (d) => {
      const map = new Map(d.artists.map((a) => [a.slug, toArtistSummary(a)]));
      return slugs.map((s) => map.get(s)).filter((x): x is ArtistSummary => !!x);
    },
    o,
    { fresh: DAY, maxAge: 30 * DAY },
  );
}

export interface Paged<T> { items: T[]; hasMore: boolean; page: number }

export function getSeasonAnime(year: number, season: Season | null | undefined, page = 1, o: QueryOpts<Paged<AnimeSummary>> = {}): Promise<Paged<AnimeSummary>> {
  return api<{ anime: RawAnime[]; links: { next: string | null } }, Paged<AnimeSummary>>(
    "/anime",
    { "filter[year]": year, "filter[season]": season ?? undefined, "filter[has]": "animethemes", include: ANIME_LIST_INCLUDE, sort: "name", "page[size]": 30, "page[number]": page, ...FR },
    (d) => ({ items: d.anime.map(toAnimeSummary), hasMore: !!d.links?.next, page }),
    o,
    { fresh: 6 * HOUR, maxAge: 30 * DAY },
  );
}

/** All primary tracks for a full season ("play the whole season") */
/**
 * Freshly-added themes, newest first.
 * The public API supports `sort=-id` + `filter[created_at-gt]` (verified) — it does
 * NOT support nested sorts like `-animethemeentries_id`, which used to 400 the feed.
 * When a period yields nothing (quiet day on the mirrors) we fall back automatically.
 */
export function getFreshTracks(period: Period = "all", count = 28, o: QueryOpts<Track[]> = {}): Promise<Track[]> {
  const since = new Date();
  if (period === "today") since.setHours(0, 0, 0, 0);
  else if (period === "week") since.setDate(since.getDate() - 7);
  const params: Params = {
    sort: "-id",
    "page[size]": Math.min(100, count * (period === "all" ? 1 : 3)),
    include: THEME_INCLUDE,
    "filter[has]": "animethemeentries.videos",
    ...F,
  };
  if (period !== "all") params["filter[created_at-gt]"] = since.toISOString().slice(0, 19);

  const load = (p: Params) =>
    api<{ animethemes: RawTheme[] }, Track[]>(
      "/animetheme",
      p,
      (d) => themesToTracks(d.animethemes, count),
      { ...o, priority: "high" },
      { fresh: period === "today" ? 10 * MIN : HOUR, maxAge: 3 * DAY },
      attachIds,
    );

  if (period === "all") return load(params);
  return load(params).then((tracks) => (tracks.length ? tracks : getFreshTracks("all", count, o)));
}

export function getSeasonTracks(year: number, season: Season, o: QueryOpts<Track[]> = {}): Promise<Track[]> {
  return api<{ anime: RawAnime[] }, Track[]>(
    "/anime",
    { "filter[year]": year, "filter[season]": season, "filter[has]": "animethemes", include: ANIME_THEMES_INCLUDE, sort: "name", "page[size]": 60, ...FR },
    (d) => d.anime.flatMap((a) => animeToTracks(a, false)),
    o,
    { fresh: 6 * HOUR, maxAge: 30 * DAY },
  );
}

/** Tracks for several anime at once (curated mixes) */
export function getTracksForAnimeSlugs(slugs: string[], o: QueryOpts<Track[]> = {}): Promise<Track[]> {
  if (!slugs.length) return Promise.resolve([]);
  return api<{ anime: RawAnime[] }, Track[]>(
    "/anime",
    { "filter[slug]": slugs.join(","), include: ANIME_THEMES_INCLUDE, "page[size]": 100, ...FR },
    (d) => {
      const map = new Map(d.anime.map((a) => [a.slug, a]));
      return slugs.flatMap((s) => {
        const a = map.get(s);
        return a ? animeToTracks(a, false) : [];
      });
    },
    o,
    { fresh: DAY, maxAge: 30 * DAY },
  );
}

/* Prefetch helpers — warm the cache on hover / touch so navigation is instant */
const prefetched = new Set<string>();
export function prefetchAnime(slug: string) {
  if (!slug || slug.startsWith("mal-") || slug.startsWith("ann-") || prefetched.has(`a:${slug}`)) return;
  prefetched.add(`a:${slug}`);
  void getAnime(slug, { priority: "low" }).catch(() => {});
}
export function prefetchArtist(slug: string) {
  if (!slug || prefetched.has(`ar:${slug}`)) return;
  prefetched.add(`ar:${slug}`);
  void getArtist(slug, { priority: "low" }).catch(() => {});
}

export function currentSeason(): { year: number; season: Season } {
  const d = new Date();
  const m = d.getMonth();
  const season: Season = m < 3 ? "Winter" : m < 6 ? "Spring" : m < 9 ? "Summer" : "Fall";
  return { year: d.getFullYear(), season };
}

export function prevSeason(year: number, season: Season): { year: number; season: Season } {
  const order: Season[] = ["Winter", "Spring", "Summer", "Fall"];
  const i = order.indexOf(season);
  return i === 0 ? { year: year - 1, season: "Fall" } : { year, season: order[i - 1] };
}

/* Curated content (all slugs verified against the API) */
export const LEGEND_SLUGS = [
  "shingeki_no_kyojin", "kimetsu_no_yaiba", "jujutsu_kaisen", "fullmetal_alchemist_brotherhood", "death_note",
  "sousou_no_frieren", "chainsaw_man", "spy_x_family", "boku_no_hero_academia", "hunter_x_hunter_2011",
  "cowboy_bebop", "neon_genesis_evangelion", "code_geass_hangyaku_no_lelouch", "tokyo_ghoul", "one_punch_man",
  "mob_psycho_100", "naruto", "naruto_shippuuden", "bleach", "oshi_no_ko", "bocchi_the_rock", "violet_evergarden",
  "made_in_abyss", "sword_art_online", "no_game_no_life", "toradora", "clannad", "angel_beats", "k_on", "haikyuu",
  "dragon_ball_z", "yakusoku_no_neverland", "dr_stone", "vinland_saga", "cyberpunk_edgerunners", "dandadan",
  "one_piece", "tokyo_revengers", "gintama", "fairy_tail", "noragami", "psycho_pass", "samurai_champloo",
  "ore_dake_level_up_na_ken", "kaguya_sama_wa_kokurasetai_tensai_tachi_no_renai_zunousen", "nanatsu_no_taizai",
  "durarara", "soul_eater", "ao_no_exorcist", "akame_ga_kill", "kill_la_kill", "tengen_toppa_gurren_lagann",
  "monster", "berserk", "horimiya", "mushoku_tensei_isekai_ittara_honki_dasu", "tensei_shitara_slime_datta_ken",
  "kaijuu_8_gou", "kuroko_no_basket", "nichijou", "suzumiya_haruhi_no_yuuutsu", "serial_experiments_lain",
];

export const ARTIST_SLUGS = [
  "lisa", "aimer", "yoasobi", "flow", "kana_boon", "radwimps", "kenshi_yonezu", "eve", "ado", "akfg",
  "uverworld", "man_with_a_mission", "official_hige_dandism", "kessoku_band", "reona", "milet", "egoist",
  "supercell", "claris", "asca", "aimyon", "yoko_kanno", "linked_horizon", "yuki_kajiura", "kalafina", "king_gnu",
  "creepy_nuts", "vaundy", "yorushika", "zutomayo", "mrs_green_apple", "spyair", "the_oral_cigarettes",
  "ikimonogakari", "nano", "masayoshi_ooishi", "yui", "burnout_syndromes", "oresama", "fhana", "mili",
  "porno_graffitti", "orange_range", "granrodeo", "ling_tosite_sigure",
];

export const MIXES: { id: string; title: string; subtitle: string; slugs: string[] }[] = [
  { id: "shounen", title: "Сёнэн-энергия", subtitle: "Naruto · Bleach · JJK · MHA", slugs: ["naruto", "naruto_shippuuden", "bleach", "jujutsu_kaisen", "boku_no_hero_academia", "kimetsu_no_yaiba", "one_piece", "fairy_tail", "dragon_ball_z", "haikyuu"] },
  { id: "epic", title: "Эпик и драма", subtitle: "AoT · FMA · Code Geass", slugs: ["shingeki_no_kyojin", "fullmetal_alchemist_brotherhood", "code_geass_hangyaku_no_lelouch", "vinland_saga", "death_note", "psycho_pass", "tokyo_ghoul", "monster", "berserk", "tengen_toppa_gurren_lagann"] },
  { id: "chill", title: "Чилл и романтика", subtitle: "Toradora · Clannad · Frieren", slugs: ["toradora", "clannad", "horimiya", "sousou_no_frieren", "violet_evergarden", "kaguya_sama_wa_kokurasetai_tensai_tachi_no_renai_zunousen", "k_on", "angel_beats", "nichijou", "suzumiya_haruhi_no_yuuutsu"] },
  { id: "modern", title: "Новая волна", subtitle: "Chainsaw Man · Oshi no Ko", slugs: ["chainsaw_man", "oshi_no_ko", "dandadan", "bocchi_the_rock", "spy_x_family", "cyberpunk_edgerunners", "kaijuu_8_gou", "ore_dake_level_up_na_ken", "tokyo_revengers", "mushoku_tensei_isekai_ittara_honki_dasu"] },
  { id: "classic", title: "Классика", subtitle: "Bebop · Evangelion · Champloo", slugs: ["cowboy_bebop", "neon_genesis_evangelion", "samurai_champloo", "serial_experiments_lain", "hunter_x_hunter_2011", "gintama", "soul_eater", "durarara", "ao_no_censor", "no_game_no_life"].filter((s) => s !== "ao_no_censor") },
];
