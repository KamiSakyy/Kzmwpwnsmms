import type { Season, Track } from "@/types";

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const SEASON_RU: Record<Season, string> = {
  Winter: "Зима",
  Spring: "Весна",
  Summer: "Лето",
  Fall: "Осень",
};

export const SEASONS: Season[] = ["Winter", "Spring", "Summer", "Fall"];

export function seasonLabel(season: Season | null | undefined, year?: number | null): string {
  const parts: string[] = [];
  if (season) parts.push(SEASON_RU[season] ?? season);
  if (year) parts.push(String(year));
  return parts.join(" ");
}

export function typeLabel(type: "OP" | "ED" | "IN"): string {
  return type === "OP" ? "Опенинг" : type === "ED" ? "Эндинг" : "Вставка";
}

export function artistNames(t: Track): string {
  return t.artists.length ? t.artists.map((a) => a.name).join(", ") : "Неизвестный исполнитель";
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or private mode */
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

/**
 * Extract a dominant, vibrant color from an image (Material You style).
 * Falls back to null when CORS blocks canvas access.
 */
const colorCache = new Map<string, string | null>();
export function extractColor(url: string | null): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url)!);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (c: string | null) => {
      colorCache.set(url, c);
      resolve(c);
    };
    img.onload = () => {
      try {
        const size = 28;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
          if (A < 128) continue;
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (max + min) / 2 / 255;
          const weight = 0.15 + sat * 2 + (lum > 0.15 && lum < 0.85 ? 0.6 : 0);
          r += R * weight; g += G * weight; b += B * weight; w += weight;
        }
        if (!w) return done(null);
        r = Math.round(r / w); g = Math.round(g / w); b = Math.round(b / w);
        done(`rgb(${r}, ${g}, ${b})`);
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

export async function shareTrack(t: Track): Promise<"shared" | "copied" | "failed"> {
  const text = `${t.title} — ${artistNames(t)}\n${t.anime.name} · ${t.themeSlug}\nСлушаю в AniBeat`;
  try {
    if (navigator.share) {
      await navigator.share({ title: t.title, text });
      return "shared";
    }
  } catch {
    /* user cancelled */
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

/** Короткий тактильный отклик (Android / Chrome). Молча ничего не делает, если недоступно. */
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

/** Календарь релизов: ключ дня (YYYY-MM-DD) и короткая подпись «пн 12». */
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lastDays(count = 7): { key: string; label: string; today: boolean }[] {
  const out: { key: string; label: string; today: boolean }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      label: i === 0 ? "Сегодня" : i === 1 ? "Вчера" : `${WEEKDAYS[d.getDay()]} ${d.getDate()}`,
      today: i === 0,
    });
  }
  return out;
}

export function relativeDay(iso: string | null | undefined): string {
  const k = dayKey(iso);
  if (!k) return "";
  const today = lastDays(1)[0].key;
  if (k === today) return "сегодня";
  const yesterday = lastDays(2)[1].key;
  if (k === yesterday) return "вчера";
  const d = new Date(iso as string);
  return `${d.getDate()} ${["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][d.getMonth()]}`;
}
