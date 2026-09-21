import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getFreshTracks, getRandomTracks, getSeasonAnime, getSeasonTracks } from "@/api/animethemes";
import { warmMeta } from "@/api/meta";
import { GENRES, filterMature, useGenreFilter } from "@/core/catalog";
import { useGeneralStore } from "@/store/general";
import type { AnimeSummary, Season, Track } from "@/types";
import { useAsync } from "@/lib/hooks";
import { SEASONS, SEASON_RU, uniqueBy } from "@/lib/utils";
import { usePlayerActions } from "@/store/player";
import { useUIActions } from "@/store/ui";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/Nav";
import { AnimeCard, TrackRow } from "@/components/cards";
import { Button, Chip, EmptyState, ErrorState, IconButton, Segmented, Skeleton, TrackRowSkeleton } from "@/components/ui";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1963 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);
type Feed = "years" | "fresh" | "OP" | "ED";

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get("type") as Feed | null) ?? "years";
  const navigate = useNavigate();

  const decades = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const y of YEARS) {
      const d = `${Math.floor(y / 10) * 10}`;
      map.set(d, [...(map.get(d) ?? []), y]);
    }
    return [...map.entries()];
  }, []);

  const setType = (v: Feed) => {
    const next = new URLSearchParams(params);
    if (v === "years") next.delete("type");
    else next.set("type", v);
    setParams(next, { replace: true });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="animate-fade-in pb-6">
      <TopBar large title="Обзор" />
      <div className="mx-auto max-w-6xl">
        <div className="px-4 pb-1 pt-2 md:px-6">
          <Segmented value={type} onChange={setType} items={[{ value: "years", label: "Годы" }, { value: "fresh", label: "Новое" }, { value: "OP", label: "OP" }, { value: "ED", label: "ED" }]} />
        </div>
        {type === "years" ? (
          <div className="space-y-6 px-4 pt-5 md:px-6">
            {decades.map(([decade, years]) => (
              <section key={decade}>
                <h2 className="mb-2 px-1 text-[15px] font-semibold text-on-surface-variant">{decade}-е</h2>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
                  {years.map((y) => (
                    <button key={y} type="button" onClick={() => navigate(`/year/${y}`)} className="tap-scale flex h-[52px] items-center justify-center rounded-[11px] bg-surface-2 text-[15px] font-semibold text-on-surface">
                      {y}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : type === "fresh" ? (
          <FreshFeed />
        ) : (
          <TypeFeed type={type} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- */
function useMatureFilter(tracks: Track[]): Track[] {
  const { mature } = useGeneralStore();
  return useMemo(() => filterMature(tracks, mature), [tracks, mature]);
}

function FreshFeed() {
  const player = usePlayerActions();
  const [tick, setTick] = useState(0);
  const { period, setPeriod } = useGeneralStore();
  const r = useAsync<Track[]>((s) => getFreshTracks(period, 40, { signal: s, refresh: tick > 0, priority: "high" }), [tick, period]);
  const tracks = useMatureFilter(r.data ?? []);
  const [genre, setGenre] = useState<string | null>(null);
  const filtered = useGenreFilter(tracks, genre);

  useEffect(() => warmMeta(tracks.map((t) => t.anime.malId)), [tracks]);

  return (
    <div className="pt-3">
      <div className="px-4 pb-2 md:px-6">
        <Segmented value={period} onChange={setPeriod} items={[{ value: "today", label: "Сегодня" }, { value: "week", label: "Неделя" }, { value: "all", label: "Всё время" }]} />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:px-6">
        <Chip active={!genre} onClick={() => setGenre(null)}>
          Все
        </Chip>
        {GENRES.map((g) => (
          <Chip key={g.id} active={genre === g.id} onClick={() => setGenre(genre === g.id ? null : g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 md:px-6">
        <button type="button" onClick={() => player.playTracks(filtered, 0)} disabled={!filtered.length} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-on-surface disabled:opacity-40">
          <Icon name="play_arrow" size={18} />
          Слушать{filtered.length ? ` · ${filtered.length}` : ""}
        </button>
        <IconButton icon="refresh" label="Обновить" size={20} className="h-10 w-10 bg-surface-2 text-on-surface" onClick={() => setTick((x) => x + 1)} disabled={r.loading} />
      </div>
      {r.loading && !tracks.length ? (
        <TrackRowSkeleton count={8} />
      ) : r.error && !tracks.length ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="filter_alt" title="Пусто с этим фильтром" text="Попробуйте другой жанр или отключите фильтр." />
      ) : (
        <div className="mt-1 md:grid md:grid-cols-2 md:gap-x-6">
          {filtered.map((t) => (
            <TrackRow key={t.id} track={t} context={filtered} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- */
function TypeFeed({ type }: { type: "OP" | "ED" }) {
  const player = usePlayerActions();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mature } = useGeneralStore();
  const [genre, setGenre] = useState<string | null>(null);

  const load = async (reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const more = await getRandomTracks(24, type, { refresh: true });
      setTracks((prev) => uniqueBy(reset ? more : [...prev, ...more], (t) => t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTracks([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  useEffect(() => warmMeta(tracks.map((t) => t.anime.malId)), [tracks]);

  const base = useMemo(() => filterMature(tracks, mature), [tracks, mature]);
  const filtered = useGenreFilter(base, genre);

  return (
    <div className="pt-3">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:px-6">
        <Chip active={!genre} onClick={() => setGenre(null)}>
          Все
        </Chip>
        {GENRES.map((g) => (
          <Chip key={g.id} active={genre === g.id} onClick={() => setGenre(genre === g.id ? null : g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 md:px-6">
        <button type="button" onClick={() => player.playTracks(filtered, 0)} disabled={!filtered.length} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-on-surface disabled:opacity-40">
          <Icon name="play_arrow" size={18} />
          Слушать всё
        </button>
        <IconButton icon="refresh" label="Обновить" size={20} className="h-10 w-10 bg-surface-2 text-on-surface" onClick={() => load(true)} disabled={loading} />
      </div>
      {error && !tracks.length ? (
        <ErrorState message={error} onRetry={() => load(true)} />
      ) : filtered.length === 0 && !loading ? (
        <EmptyState icon="filter_alt" title="Пусто" text="Попробуйте «Все» жанры или обновите." />
      ) : (
        <div className="mt-1 md:grid md:grid-cols-2 md:gap-x-6">
          {filtered.map((t) => (
            <TrackRow key={t.id} track={t} context={filtered} />
          ))}
        </div>
      )}
      {loading && <TrackRowSkeleton count={tracks.length ? 3 : 8} />}
      {!loading && filtered.length > 0 && (
        <div className="flex justify-center px-4 pt-5">
          <Button variant="tinted" onClick={() => load(false)}>
            Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Year ---------------- */
export function YearPage() {
  const { year: yearStr } = useParams();
  const year = Number(yearStr) || CURRENT_YEAR;
  const [params, setParams] = useSearchParams();
  const season = (params.get("season") as Season | null) ?? null;
  const navigate = useNavigate();
  const player = usePlayerActions();
  const { toast } = useUIActions();
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const first = useAsync((s) => getSeasonAnime(year, season, 1, { signal: s, priority: "high" }), [year, season]);
  useEffect(() => {
    if (first.data) {
      setItems(first.data.items);
      setHasMore(first.data.hasMore);
      setPage(1);
    }
  }, [first.data]);
  useEffect(() => warmMeta(items.map((a) => a.malId)), [items]);

  const loadMore = async () => {
    const next = page + 1;
    const r = await getSeasonAnime(year, season, next);
    setItems((prev) => uniqueBy([...prev, ...r.items], (a) => String(a.id)));
    setHasMore(r.hasMore);
    setPage(next);
  };

  const setSeason = (s: Season | null) => {
    const n = new URLSearchParams(params);
    if (s) n.set("season", s);
    else n.delete("season");
    setParams(n, { replace: true });
  };

  const playSeason = async () => {
    if (!season) return;
    try {
      setBusy(true);
      const tracks = await getSeasonTracks(year, season);
      if (!tracks.length) return toast("Нет треков");
      player.playTracks(tracks, 0, { shuffle: true });
      player.openNowPlaying();
    } catch {
      toast("Не удалось загрузить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in pb-6">
      <TopBar
        back
        title={String(year)}
        actions={
          <div className="flex items-center">
            <IconButton icon="expand_more" label="Предыдущий" size={20} className="h-9 w-9 rotate-90 text-on-surface" onClick={() => navigate(`/year/${year - 1}${season ? `?season=${season}` : ""}`, { replace: true })} disabled={year <= 1963} />
            <IconButton icon="expand_more" label="Следующий" size={20} className="h-9 w-9 -rotate-90 text-on-surface" onClick={() => navigate(`/year/${year + 1}${season ? `?season=${season}` : ""}`, { replace: true })} disabled={year > CURRENT_YEAR} />
          </div>
        }
      />
      <div className="mx-auto max-w-6xl">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-2 md:px-6">
          <Chip active={!season} onClick={() => setSeason(null)}>
            Весь год
          </Chip>
          {SEASONS.map((s) => (
            <Chip key={s} active={season === s} onClick={() => setSeason(s)}>
              {SEASON_RU[s]}
            </Chip>
          ))}
        </div>

        {season && items.length > 0 && (
          <div className="px-4 pt-3 md:px-6">
            <button type="button" onClick={playSeason} disabled={busy} className="tap-scale flex h-10 w-full items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-on-surface">
              <Icon name="shuffle" size={18} />
              {busy ? "Загрузка…" : "Слушать сезон"}
            </button>
          </div>
        )}

        {first.loading && !items.length ? (
          <div className="grid grid-cols-3 gap-3 px-4 pt-4 sm:grid-cols-4 md:grid-cols-6 md:px-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] w-full rounded-xl" />
                <Skeleton className="mt-2 h-3 w-3/4 rounded-md" />
              </div>
            ))}
          </div>
        ) : first.error && !items.length ? (
          <ErrorState message={first.error} onRetry={first.reload} />
        ) : items.length === 0 ? (
          <EmptyState icon="calendar" title="Ничего не найдено" text="Для этого периода пока нет записей." />
        ) : (
          <>
            <div className={cn("grid grid-cols-3 gap-3 px-4 pt-4 sm:grid-cols-4 md:grid-cols-6 md:px-6")}>
              {items.map((a) => (
                <AnimeCard key={a.id} anime={a} wide />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-6">
                <Button variant="tinted" onClick={loadMore}>
                  Показать ещё
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
