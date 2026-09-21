/**
 * Anime metadata enrichment keyed by MyAnimeList id (== Shikimori id):
 *  • Shikimori  — Russian titles, score, kind, Russian description & genres
 *  • AniList    — full-resolution posters (extraLarge), wide banners, accent color
 *
 * Shikimori keeps changing domains (RKN blocks): shikimori.one/.io were blocked in
 * January 2026, the project moved to shikimori.tv. We race all known mirrors once,
 * remember the winner, and transparently fall back if it stops answering.
 * Everything here is best-effort: failures never block the core (AnimeThemes) UI.
 */
import { useSyncExternalStore } from "react";
import { STORES, idbGet, idbSet } from "@/lib/idb";
import { DAY, HOUR, request, rev } from "./http";

const ANILIST = rev("oc.tsilina.lqhparg//:sptth");

/* ------------------------------------------------------------------ */
/* Metadata mirror discovery                                           */
/* ------------------------------------------------------------------ */
const M = rev("iromikihs");
export const SHIKI_HOSTS = [`https://${M}.tv`, `https://${M}.one`, `https://${M}.io`, `https://${M}.me`];
const HOST_KEY = "anibeat:mhost";
const HOST_TTL = 12 * HOUR;
const SHIKI_RE = new RegExp(`^https?://([a-z0-9-]+\\.)?${M}\\.(one|io|me|org|tv|cc)`, "i");

let shikiHost: string | null = null;
let probe: Promise<string | null> | null = null;
let shikiDead = false;

function readSavedHost(): string | null {
  try {
    const raw = localStorage.getItem(HOST_KEY);
    if (!raw) return null;
    const { host, ts } = JSON.parse(raw) as { host: string; ts: number };
    return SHIKI_HOSTS.includes(host) && Date.now() - ts < HOST_TTL ? host : null;
  } catch {
    return null;
  }
}

function saveHost(host: string) {
  try {
    localStorage.setItem(HOST_KEY, JSON.stringify({ host, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

function ping(host: string, timeout = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    fetch(`${host}/api/animes?limit=1`, { mode: "cors", credentials: "omit", signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => (Array.isArray(j) ? resolve(host) : reject(new Error("bad body"))))
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

/** Promise.any without the ES2021 lib requirement */
function firstResolved<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failed = 0;
    promises.forEach((p) =>
      p.then(resolve).catch(() => {
        if (++failed === promises.length) reject(new Error("all failed"));
      }),
    );
  });
}

/** First mirror that answers wins. Result is memoised per session and saved for 12h. */
export function resolveShikiHost(force = false): Promise<string | null> {
  if (!force) {
    if (shikiHost) return Promise.resolve(shikiHost);
    if (shikiDead) return Promise.resolve(null);
    const saved = readSavedHost();
    if (saved) {
      shikiHost = saved;
      return Promise.resolve(saved);
    }
    if (probe) return probe;
  }
  probe = (async () => {
    try {
      const winner = await firstResolved(SHIKI_HOSTS.map((h) => ping(h)));
      shikiHost = winner;
      shikiDead = false;
      saveHost(winner);
      emit(); // re-render so relative image urls pick up the host
      return winner;
    } catch {
      shikiHost = null;
      shikiDead = true;
      return null;
    } finally {
      probe = null;
    }
  })();
  return probe;
}

/** Rewrite any shikimori.* url to the currently reachable mirror. */
export function fixShikiHost(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = shikiHost ?? readSavedHost();
  if (!host) return url;
  const m = SHIKI_RE.exec(url);
  if (!m) return url;
  const tld = host.replace(new RegExp(`^https://${M}\\.`), "");
  return url.replace(SHIKI_RE, `https://${m[1] ?? ""}${M}.${tld}`);
}

async function shikiRequest<T>(path: string, o: { signal?: AbortSignal; fresh: number; maxAge: number; priority?: "high" | "low" | "auto" }): Promise<T> {
  const host = await resolveShikiHost();
  if (!host) throw new Error("Shikimori недоступен");
  try {
    return await request<T>(`${host}${path}`, { cacheKey: `shiki:${path}`, fresh: o.fresh, maxAge: o.maxAge, priority: o.priority ?? "low", signal: o.signal, timeout: 9000, retries: 0 });
  } catch (e) {
    // network failure → maybe the mirror got blocked; re-probe once and retry
    const status = (e as { status?: number }).status;
    if (status === 0) {
      const next = await resolveShikiHost(true);
      if (next && next !== host) return request<T>(`${next}${path}`, { cacheKey: `shiki:${path}`, fresh: o.fresh, maxAge: o.maxAge, priority: "low", signal: o.signal, timeout: 9000, retries: 0 });
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export interface AnimeMeta {
  malId: number;
  ru: string | null;
  name: string | null;
  poster: string | null;
  posterShiki: string | null;
  banner: string | null;
  color: string | null;
  score: number | null;
  kind: string | null;
  episodes: number | null;
  status: string | null;
  genres: string[];
  shikiUrl: string | null;
  anilistId: number | null;
  ts: number;
}

interface ShikiAnime {
  id: number;
  name: string;
  russian: string | null;
  image?: { original?: string; preview?: string };
  url?: string;
  kind?: string | null;
  score?: string | null;
  status?: string | null;
  episodes?: number | null;
}

interface AniListMedia {
  id: number;
  idMal: number | null;
  coverImage?: { extraLarge?: string | null; large?: string | null; color?: string | null };
  bannerImage?: string | null;
  averageScore?: number | null;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */
const store = new Map<number, AnimeMeta | null>();
const listeners = new Set<() => void>();
const pending = new Set<number>();
const requested = new Set<number>();
let flushTimer: number | null = null;
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

const missing = (url: string | undefined | null) => !url || url.includes("missing_");
const shikiImg = (path: string | undefined) => {
  if (!path || missing(path)) return null;
  if (path.startsWith("http")) return path;
  const host = shikiHost ?? readSavedHost() ?? SHIKI_HOSTS[0];
  return host + path;
};

function fromShiki(a: ShikiAnime, prev?: AnimeMeta | null): AnimeMeta {
  const posterShiki = shikiImg(a.image?.original);
  const host = shikiHost ?? readSavedHost() ?? SHIKI_HOSTS[0];
  const lite = a as ShikiAnalyticsLite;
  return {
    malId: a.id,
    ru: a.russian || prev?.ru || null,
    name: a.name || prev?.name || null,
    poster: prev?.poster ?? posterShiki,
    posterShiki,
    banner: prev?.banner ?? null,
    color: prev?.color ?? null,
    genres: lite.genres ? genresOf(lite) : prev?.genres ?? [],
    score: a.score ? Number(a.score) || null : prev?.score ?? null,
    kind: a.kind ?? prev?.kind ?? null,
    episodes: a.episodes ?? prev?.episodes ?? null,
    status: a.status ?? prev?.status ?? null,
    shikiUrl: a.url ? host + a.url : `${host}/animes/${a.id}`,
    anilistId: prev?.anilistId ?? null,
    ts: Date.now(),
  };
}

function mergeAniList(m: AnimeMeta | null, media: AniListMediaFull, malId: number): AnimeMeta {
  const xl = media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;
  const base: AnimeMeta = m ?? { malId, ru: null, name: null, poster: null, posterShiki: null, banner: null, color: null, score: null, kind: null, episodes: null, status: null, genres: [], shikiUrl: null, anilistId: null, ts: Date.now() };
  return {
    ...base,
    poster: xl ?? base.poster,
    banner: media.bannerImage ?? base.banner,
    color: media.coverImage?.color ?? base.color,
    score: base.score ?? (media.averageScore ? media.averageScore / 10 : null),
    anilistId: media.id ?? base.anilistId,
    ts: Date.now(),
  };
}

interface ShikiGenre { russian?: string; name?: string }
interface ShikiFullLite extends ShikiAnime { genres?: ShikiGenre[] }

async function fetchShiki(ids: number[]): Promise<Map<number, ShikiAnime>> {
  const out = new Map<number, ShikiAnime>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const list = await shikiRequest<ShikiAnalyticsLite[]>(`/api/animes?ids=${chunk.join(",")}&limit=50`, { fresh: 7 * DAY, maxAge: 60 * DAY });
      for (const a of list ?? []) out.set(a.id, a);
    } catch {
      break; // mirror unreachable — don't hammer it
    }
  }
  return out;
}
type ShikiAnalyticsLite = ShikiFullLite;

function genresOf(a: ShikiFullLite): string[] {
  return (a.genres ?? []).map((g) => (g.russian || g.name || "").trim()).filter(Boolean);
}

const ANILIST_QUERY = `query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){id idMal coverImage{extraLarge large color} bannerImage averageScore genres}}}`;

interface AniListMediaFull extends AniListMedia { genres?: string[] }

async function fetchAniList(ids: number[]): Promise<Map<number, AniListMediaFull>> {
  const out = new Map<number, AniListMediaFull>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50).sort((a, b) => a - b);
    try {
      const res = await request<{ data?: { Page?: { media?: AniListMediaFull[] } } }>(ANILIST, {
        body: JSON.stringify({ query: ANILIST_QUERY, variables: { ids: chunk } }),
        fresh: 7 * DAY,
        maxAge: 60 * DAY,
        priority: "low",
        timeout: 12_000,
        retries: 1,
      });
      for (const m of res?.data?.Page?.media ?? []) if (m.idMal) out.set(m.idMal, m);
    } catch {
      break;
    }
  }
  return out;
}

async function flush() {
  flushTimer = null;
  const ids = [...pending];
  pending.clear();
  if (!ids.length) return;

  const stale: number[] = [];
  let anyFresh = false;
  await Promise.all(
    ids.map(async (id) => {
      const cached = await idbGet<AnimeMeta | { malId: number; none: true; ts: number }>(STORES.anime, String(id));
      if (cached && typeof cached.ts === "number" && Date.now() - cached.ts < 14 * DAY) {
        store.set(id, "none" in cached ? null : cached);
        anyFresh = true;
      } else stale.push(id);
    }),
  );
  if (anyFresh) emit();
  if (!stale.length) return;

  const [shiki, anilist] = await Promise.all([fetchShiki(stale), fetchAniList(stale)]);
  for (const id of stale) {
    let m: AnimeMeta | null = store.get(id) ?? null;
    const s = shiki.get(id);
    if (s) m = fromShiki(s, m);
    const a = anilist.get(id);
    if (a) m = mergeAniList(m, a, id);
    store.set(id, m);
    if (m) void idbSet(STORES.anime, String(id), m);
    else if (shiki.size || anilist.size) void idbSet(STORES.anime, String(id), { malId: id, none: true, ts: Date.now() });
    else requested.delete(id); // both providers failed → allow a retry later
  }
  emit();
}

function schedule(id: number) {
  if (requested.has(id)) return;
  requested.add(id);
  pending.add(id);
  if (flushTimer == null) flushTimer = window.setTimeout(() => void flush(), 40);
}

/** Request metadata for many ids at once (e.g. right after a list loads). */
export function warmMeta(ids: (number | null | undefined)[]) {
  for (const id of ids) if (id && !requested.has(id)) schedule(id);
}

export function getMeta(malId: number | null | undefined): AnimeMeta | null {
  if (!malId) return null;
  const m = store.get(malId);
  if (m === undefined) {
    schedule(malId);
    return null;
  }
  return m;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useAnimeMeta(malId: number | null | undefined): AnimeMeta | null {
  return useSyncExternalStore(
    subscribe,
    () => getMeta(malId),
    () => null,
  );
}

export function useMetaVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/* ------------------------------------------------------------------ */
/* Shikimori: search & details                                         */
/* ------------------------------------------------------------------ */
export interface ShikiSearchHit { malId: number; ru: string | null; name: string; poster: string | null; kind: string | null; score: number | null }

export async function searchShikimori(q: string, signal?: AbortSignal): Promise<ShikiSearchHit[]> {
  const list = await shikiRequest<ShikiAnime[]>(`/api/animes?search=${encodeURIComponent(q)}&limit=10`, { fresh: HOUR, maxAge: 7 * DAY, priority: "high", signal });
  return (list ?? []).map((a) => {
    if (!store.has(a.id)) {
      store.set(a.id, fromShiki(a));
      requested.add(a.id);
    }
    return { malId: a.id, ru: a.russian || null, name: a.name, poster: shikiImg(a.image?.original), kind: a.kind ?? null, score: a.score ? Number(a.score) || null : null };
  });
}

export interface ShikiDetails {
  malId: number;
  ru: string | null;
  name: string;
  description: string | null;
  genres: string[];
  studios: string[];
  score: number | null;
  rating: string | null;
  duration: number | null;
  episodes: number | null;
  kind: string | null;
  status: string | null;
  airedOn: string | null;
  url: string;
  poster: string | null;
}

interface ShikiFull extends ShikiAnime {
  description?: string | null;
  genres?: { russian?: string; name?: string }[];
  studios?: { name: string }[];
  rating?: string | null;
  duration?: number | null;
  aired_on?: string | null;
}

/** Strip Shikimori bb-code ([character=1]Name[/character], [[wiki]], [spoiler]…) */
export function cleanShikiText(s: string | null | undefined): string | null {
  if (!s) return null;
  return (
    s
      .replace(/\[spoiler[^\]]*\]([\s\S]*?)\[\/spoiler\]/gi, "")
      .replace(/\[(character|person|anime|manga|ranobe|url|entry|comment|topic|user|image|poster|div|span|color|size)[^\]]*\]([\s\S]*?)\[\/\1\]/gi, "$2")
      .replace(/\[\/?(b|i|u|s|br|hr|center|right|quote|list|\*)\]/gi, "")
      .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1")
      .replace(/\[[^\]]{1,40}\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  );
}

export async function getShikiDetails(malId: number, signal?: AbortSignal): Promise<ShikiDetails | null> {
  try {
    const a = await shikiRequest<ShikiFull>(`/api/animes/${malId}`, { fresh: 7 * DAY, maxAge: 60 * DAY, signal, priority: "auto" });
    if (!a?.id) return null;
    const prev = store.get(a.id) ?? null;
    store.set(a.id, fromShiki(a, prev));
    requested.add(a.id);
    emit();
    const host = shikiHost ?? SHIKI_HOSTS[0];
    return {
      malId: a.id,
      ru: a.russian || null,
      name: a.name,
      description: cleanShikiText(a.description),
      genres: (a.genres ?? []).map((g) => g.russian || g.name || "").filter(Boolean),
      studios: (a.studios ?? []).map((s) => s.name),
      score: a.score ? Number(a.score) || null : null,
      rating: a.rating ?? null,
      duration: a.duration ?? null,
      episodes: a.episodes ?? null,
      kind: a.kind ?? null,
      status: a.status ?? null,
      airedOn: a.aired_on ?? null,
      url: a.url ? host + a.url : `${host}/animes/${a.id}`,
      poster: shikiImg(a.image?.original),
    };
  } catch {
    return null;
  }
}

export const KIND_RU: Record<string, string> = { tv: "TV-сериал", movie: "Фильм", ova: "OVA", ona: "ONA", special: "Спешл", music: "Клип", tv_special: "TV-спешл", pv: "PV", cm: "Реклама" };
export const STATUS_RU: Record<string, string> = { anons: "Анонс", ongoing: "Онгоинг", released: "Вышло" };
export const RATING_RU: Record<string, string> = { g: "0+", pg: "6+", pg_13: "13+", r: "17+", r_plus: "17+", rx: "18+" };

/* Kick off host discovery early (idle) so the first metadata batch is fast */
if (typeof window !== "undefined") {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  const start = () => void resolveShikiHost().catch(() => {});
  if (idle) idle(start);
  else setTimeout(start, 1500);
}
