/**
 * HTTP layer — browser-side equivalent of an OkHttp client:
 *  • HTTP/2 multiplexed fetch with preconnected origins
 *  • two-tier cache: memory (hot) + IndexedDB (disk) with stale-while-revalidate
 *  • request de-duplication (identical inflight calls share one connection)
 *  • retry with exponential backoff + Retry-After on 429 / 5xx / network errors
 *  • per-request timeouts and fetch priority hints
 */
import { STORES, idbClear, idbGet, idbPrune, idbSet } from "@/lib/idb";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Endpoint strings are stored reversed so they don't appear in plain text. */
export const rev = (s: string) => s.split("").reverse().join("");

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type Priority = "high" | "low" | "auto";

interface Entry<T = unknown> {
  ts: number;
  data: T;
}

export interface RequestOptions<T> {
  signal?: AbortSignal;
  /** memory hot-cache TTL (default 5 min) */
  ttl?: number;
  /** disk: serve without revalidation if younger than this (default 1 h) */
  fresh?: number;
  /** disk: serve stale + revalidate in background if younger than this (default 7 d) */
  maxAge?: number;
  /** never write to disk */
  noStore?: boolean;
  /** bypass all caches */
  refresh?: boolean;
  priority?: Priority;
  timeout?: number;
  /** override cache key (e.g. stable key for randomised endpoints) */
  cacheKey?: string;
  /** called when a background revalidation produced new data */
  onUpdate?: (data: T) => void;
  /** POST body (JSON string). Cache key automatically includes it. */
  body?: string;
  headers?: Record<string, string>;
  /** retry attempts on network / 5xx / 429 (default 3) */
  retries?: number;
}

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const RETRY_DELAYS = [600, 1500, 3200];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function buildUrl(base: string, path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base + path);
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

interface FetchExtra { body?: string; headers?: Record<string, string>; retries?: number }

async function fetchJSON<T>(url: string, priority: Priority = "auto", timeout = 15_000, extra: FetchExtra = {}): Promise<T> {
  let attempt = 0;
  const maxRetries = Math.min(extra.retries ?? RETRY_DELAYS.length, RETRY_DELAYS.length);
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const init: RequestInit & { priority?: Priority } = {
        signal: ctrl.signal,
        method: extra.body ? "POST" : "GET",
        headers: { Accept: "application/json", ...(extra.body ? { "Content-Type": "application/json" } : {}), ...(extra.headers ?? {}) },
        body: extra.body,
        mode: "cors",
        credentials: "omit",
        cache: extra.body ? "default" : "no-cache",
        priority,
      };
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const retryAfter = Number(res.headers.get("retry-after")) * 1000;
          await sleep(retryAfter > 0 ? Math.min(retryAfter, 8000) : RETRY_DELAYS[attempt]);
          attempt++;
          continue;
        }
        throw new ApiError(res.status === 429 ? "Слишком много запросов — попробуйте чуть позже" : `Сервер временно недоступен (${res.status})`, res.status);
      }
      if (!res.ok) throw new ApiError(res.status === 404 ? "Не найдено" : `Ошибка API (${res.status})`, res.status);
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const aborted = e instanceof DOMException && e.name === "AbortError" && !ctrl.signal.aborted;
      if (aborted) throw new ApiError("Запрос отменён", 0);
      if (!offline && attempt < maxRetries) {
        await sleep(RETRY_DELAYS[attempt]);
        attempt++;
        continue;
      }
      throw new ApiError(offline ? "Нет подключения к интернету" : "Сервер не отвечает. Проверьте соединение", 0);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function request<T>(url: string, opts: RequestOptions<T> = {}): Promise<T> {
  const key = opts.cacheKey ?? (opts.body ? `${url}#${opts.body}` : url);
  const extra: FetchExtra = { body: opts.body, headers: opts.headers, retries: opts.retries };
  const ttl = opts.ttl ?? 5 * MIN;
  const fresh = opts.fresh ?? HOUR;
  const maxAge = opts.maxAge ?? 7 * DAY;
  const now = Date.now();

  if (!opts.refresh) {
    const hot = mem.get(key);
    if (hot && now - hot.ts < ttl) return hot.data as T;
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
  }

  const job = (async (): Promise<T> => {
    if (!opts.refresh && !opts.noStore) {
      const disk = await idbGet<Entry<T>>(STORES.http, key);
      if (disk && typeof disk.ts === "number" && disk.data !== undefined) {
        const age = now - disk.ts;
        if (age < maxAge) {
          mem.set(key, disk);
          if (age >= fresh) {
            // stale-while-revalidate: paint instantly, refresh quietly
            fetchJSON<T>(url, "low", opts.timeout, extra)
              .then((data) => {
                const entry: Entry<T> = { ts: Date.now(), data };
                mem.set(key, entry);
                void idbSet(STORES.http, key, entry);
                opts.onUpdate?.(data);
              })
              .catch(() => {});
          }
          return disk.data;
        }
      }
    }
    const data = await fetchJSON<T>(url, opts.priority, opts.timeout, extra);
    const entry: Entry<T> = { ts: Date.now(), data };
    mem.set(key, entry);
    if (!opts.noStore) void idbSet(STORES.http, key, entry);
    return data;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}

/** Warm the cache without caring about the result. */
export function prefetch<T>(url: string, opts: RequestOptions<T> = {}): void {
  void request<T>(url, { ...opts, priority: "low" }).catch(() => {});
}

export async function clearHttpCache(): Promise<void> {
  mem.clear();
  await idbClear(STORES.http);
}

/* Housekeeping: drop expired disk entries once per session, off the critical path */
if (typeof window !== "undefined") {
  setTimeout(() => {
    void idbPrune(STORES.http, (v) => {
      const e = v as Entry | undefined;
      return !e || typeof e.ts !== "number" || Date.now() - e.ts > 7 * DAY;
    });
  }, 8000);
}
