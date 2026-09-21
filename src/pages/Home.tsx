import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ARTIST_SLUGS, LEGEND_SLUGS, MIXES, currentSeason, getAnimeBySlugs, getArtistsBySlugs, getFreshTracks, getLatestTracks, getRandomTracks, getSeasonAnime, getTracksForAnimeSlugs, prevSeason } from "@/api/animethemes";
import { warmMeta } from "@/api/meta";
import type { AnimeSummary, ArtistSummary, Season, Track } from "@/types";
import { useAsync, useMediaQuery } from "@/lib/hooks";
import { SEASON_RU, artistNames, dayKey, haptic, lastDays, relativeDay, shuffleArray, uniqueBy } from "@/lib/utils";
import { GENRES } from "@/core/catalog";
import { useOfflineList } from "@/lib/offline";
import { useTrackDisplay } from "@/lib/display";
import { usePlayerActions } from "@/store/player";
import { useLibrary } from "@/store/library";
import { useUIActions } from "@/store/ui";
import { setLiveSong, useLiveSong } from "@/store/general";
import { filterMature, useCatalog } from "@/core/catalog";
import { cn } from "@/utils/cn";
import { Icon, Logo } from "@/components/Icon";
import { AnimeCard, ArtistCard, MixCard, TrackCard, TrackRow } from "@/components/cards";
import { Button, CardRowSkeleton, Cover, EmptyState, ErrorState, HScroll, IconButton, LiveDot, SectionHeader, Skeleton, Spinner, TrackRowSkeleton, Segmented } from "@/components/ui";

interface SeasonBlock { year: number; season: Season; items: AnimeSummary[] }

function Hero({ track, list }: { track: Track; list: Track[] }) {
  const navigate = useNavigate();
  const player = usePlayerActions();
  const d = useTrackDisplay(track);
  return (
    <div className="relative flex items-center gap-4 rounded-[18px] bg-surface-2 p-3.5 md:p-4">
      <button type="button" onClick={() => navigate(`/anime/${track.anime.slug}`)} className="tap-scale shrink-0">
        <Cover src={d.cover} fallback={d.thumb} alt={d.title} className="h-[104px] w-[104px] md:h-[128px] md:w-[128px]" rounded="rounded-[12px]" priority />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Трек дня</p>
        <h2 className="mt-1 line-clamp-2 text-[19px] font-bold leading-tight tracking-[-0.02em] text-on-surface">{track.title}</h2>
        <p className="mt-0.5 truncate text-[13.5px] text-on-surface-variant">{artistNames(track)}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-on-surface-dim">{d.title}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptic(12);
              player.playTracks(list, 0);
              player.openNowPlaying();
            }}
            className="tap-scale flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-black"
          >
            <Icon name="play_arrow" size={16} />
            Слушать
          </button>
          <IconButton icon="shuffle" label="Перемешать" size={19} className="h-9 w-9 bg-surface-4 text-on-surface" onClick={() => player.playTracks(list, 0, { shuffle: true })} />
        </div>
      </div>
    </div>
  );
}

/** Animated "live" ticker that plays a new random cut every ~50s. */
function LiveRail({ pool }: { pool: Track[] }) {
  const player = usePlayerActions();
  const live = useLiveSong();
  const track = live ?? pool[0] ?? null;

  useEffect(() => {
    if (!pool.length || live) return;
    setLiveSong(pool[0]);
  }, [pool, live]);

  useEffect(() => {
    if (pool.length < 3) return;
    const id = window.setInterval(() => {
      setLiveSong(pool[Math.floor(Math.random() * pool.length)]);
    }, 50_000);
    return () => window.clearInterval(id);
  }, [pool]);

  const d = useTrackDisplay(track);
  if (!track) return null;

  return (
    <button
      type="button"
      onClick={() => {
        player.playTrack(track, pool);
        player.openNowPlaying();
      }}
      className="tap relative mx-auto flex w-full max-w-lg items-center gap-3 rounded-full bg-surface-3 py-2 pl-2.5 pr-4 shadow-[0_8px_30px_rgba(0,0,0,0.55)] animate-scale-in"
    >
      <div className="relative h-[42px] w-[42px] shrink-0">
        <Cover src={d.thumb ?? d.cover} alt="" className="h-full w-full" rounded="rounded-full" eager />
        <span className="absolute -right-0.5 -top-0.5">
          <LiveDot />
        </span>
      </div>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-semibold text-on-surface">{track.title}</span>
        <span className="block truncate text-[12px] text-on-surface-variant">
          {track.themeSlug} · {d.title}
        </span>
      </span>
      <Icon name="play_arrow" size={22} className="text-white" />
    </button>
  );
}

const PERIOD_ITEMS: { value: "today" | "week" | "all"; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "all", label: "Всё время" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const player = usePlayerActions();
  const { history } = useLibrary();
  const { toast, openSettings } = useUIActions();
  const { period, setPeriod, mature, setMature } = useCatalog();
  const offline = useOfflineList();
  const [busy, setBusy] = useState<string | null>(null);
  const [randomTick, setRandomTick] = useState(0);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  void busy;

  const random = useAsync((s) => getRandomTracks(16, undefined, { signal: s, refresh: randomTick > 0, priority: "high" }), [randomTick]);
  const fresh = useAsync<Track[]>((s) => getFreshTracks(period, 24, { signal: s, priority: "high" }), [period]);
  const legends = useAsync<AnimeSummary[]>((s, update) => getAnimeBySlugs(LEGEND_SLUGS, { signal: s, onUpdate: update }), []);
  const artists = useAsync<ArtistSummary[]>((s, update) => getArtistsBySlugs(ARTIST_SLUGS, { signal: s, onUpdate: update }), []);
  const latest = useAsync<Track[]>((s, update) => getLatestTracks(12, { signal: s, onUpdate: update }), []);
  const season = useAsync<SeasonBlock>(async (s, update) => {
    const cur = currentSeason();
    const r = await getSeasonAnime(cur.year, cur.season, 1, { signal: s, onUpdate: (n) => update({ ...cur, items: n.items }) });
    if (r.items.length >= 6) return { ...cur, items: r.items };
    const prev = prevSeason(cur.year, cur.season);
    const r2 = await getSeasonAnime(prev.year, prev.season, 1, { signal: s });
    return r2.items.length > r.items.length ? { ...prev, items: r2.items } : { ...cur, items: r.items };
  }, []);

  const legendPick = useMemo(() => (legends.data ? shuffleArray(legends.data).slice(0, 18) : []), [legends.data]);
  const artistPick = useMemo(() => (artists.data ? shuffleArray(artists.data).slice(0, 16) : []), [artists.data]);
  const offlineTracks = useMemo(() => uniqueBy(offline.map((m) => m.track), (t) => t.id), [offline]);
  const heroList = random.data ?? [];
  const hero = heroList[0] ?? null;
  const livePool = heroList.slice(1, 9);

  useEffect(() => {
    warmMeta([...heroList.map((t) => t.anime.malId), ...legendPick.map((a) => a.malId), ...(season.data?.items ?? []).map((a) => a.malId), ...(latest.data ?? []).map((t) => t.anime.malId), ...(fresh.data ?? []).map((t) => t.anime.malId)]);
  }, [heroList, legendPick, season.data, latest.data, fresh.data]);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    try {
      setBusy(key);
      await fn();
    } catch {
      toast("Не удалось загрузить");
    } finally {
      setBusy(null);
    }
  };
  const playMix = (id: string, slugs: string[]) =>
    withBusy(id, async () => {
      const tracks = await getTracksForAnimeSlugs(slugs, { priority: "high" });
      if (!tracks.length) return toast("Микс пуст — попробуйте ещё раз");
      player.playTracks(filterMature(tracks, mature), 0, { shuffle: true });
      player.openNowPlaying();
    });
  const playRadio = () =>
    withBusy("radio", async () => {
      const tracks = await getRandomTracks(40, undefined, { refresh: true });
      player.playTracks(tracks, 0);
      player.openNowPlaying();
    });

  /* Календарь релизов: группируем новинки по дням */
  const [day, setDay] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const days = useMemo(() => lastDays(7), []);
  const freshList = useMemo(() => filterMature(fresh.data ?? [], mature), [fresh.data, mature]);
  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of freshList) {
      const k = dayKey(t.createdAt);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [freshList]);
  const shown = useMemo(() => {
    let list = day ? freshList.filter((t) => dayKey(t.createdAt) === day) : freshList;
    return list;
  }, [freshList, day]);
  const quick = shown.slice(0, 7);

  return (
    <div className="animate-fade-in pb-8">
      <header className="sticky top-0 z-30 bar safe-top">
        <div className="mx-auto flex h-[48px] max-w-6xl items-center gap-2 px-4 md:px-6">
          <Logo size={26} className="md:hidden" />
          <div className="hidden min-w-0 flex-1 items-center md:flex" />
          <IconButton icon="search" label="Поиск" size={21} className="text-on-surface" onClick={() => navigate("/search")} />
          <IconButton icon="settings" label="Настройки" size={21} className="text-on-surface md:hidden" onClick={openSettings} />
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2.5 md:px-6">
          <Segmented value={period} onChange={setPeriod} items={PERIOD_ITEMS} />
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2.5 md:px-6">
          <LiveRail pool={livePool} />
        </div>
      </header>

      <div className="mx-auto max-w-6xl">
        <section className="px-4 pt-2 md:px-6">
          {random.loading && !hero ? <Skeleton className="h-[132px] w-full rounded-[18px] md:h-[156px]" /> : random.error && !hero ? <ErrorState message={random.error} onRetry={random.reload} /> : hero ? <Hero track={hero} list={heroList} /> : null}
        </section>

        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 md:px-6">
          {[
            { label: "Радио", icon: "radio" as const, onClick: playRadio, key: "radio" },
            { label: "Опенинги", icon: "whatshot" as const, onClick: () => navigate("/browse?type=OP"), key: "op" },
            { label: "Эндинги", icon: "schedule" as const, onClick: () => navigate("/browse?type=ED"), key: "ed" },
            { label: "Офлайн", icon: "offline_pin" as const, onClick: () => navigate("/library?tab=downloads"), key: "off" },
            { label: mature === "on" ? "18+ вкл" : "18+ выкл", icon: "filter_alt" as const, onClick: () => setMature(mature === "on" ? "off" : "on"), key: "18" },
          ].map((c) => (
            <button key={c.key} type="button" onClick={c.onClick} className="tap-scale inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13.5px] font-medium text-on-surface">
              {busy === c.key && c.key === "radio" ? <Spinner size={14} /> : <Icon name={c.icon} size={16} className="text-on-surface-variant" />}
              {c.label}
            </button>
          ))}
        </div>

        {/* Календарь релизов: дни недели + лента */}
        <section className="mt-7">
          <SectionHeader title="Календарь релизов" action="Обновить" onAction={fresh.reload} />
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:px-6">
            <button
              type="button"
              onClick={() => { setDay(null); haptic(6); }}
              className={cn(
                "flex h-[46px] shrink-0 flex-col items-center justify-center rounded-[12px] px-3.5 text-[12px] font-medium transition-colors",
                day === null ? "bg-white text-black" : "bg-surface-2 text-on-surface-variant",
              )}
            >
              <span className="text-[13px] font-semibold">Все</span>
              <span className="opacity-70">{freshList.length}</span>
            </button>
            {days.map((d) => {
              const count = dayCounts.get(d.key) ?? 0;
              const active = day === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => { setDay(active ? null : d.key); haptic(6); }}
                  className={cn(
                    "flex h-[46px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[12px] text-[11.5px] font-medium transition-colors",
                    active ? "bg-white text-black" : count ? "bg-surface-2 text-on-surface" : "bg-surface-1 text-on-surface-dim",
                  )}
                >
                  <span className="truncate text-[11px]">{d.label}</span>
                  <span className={cn("text-[12px] font-semibold", active ? "text-black/70" : count ? "text-on-surface-variant" : "text-on-surface-dim")}>{count || "—"}</span>
                </button>
              );
            })}
          </div>

          {/* Быстрые жанры */}
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 md:px-6">
            <button type="button" onClick={() => { setGenre(null); setPeriod("all"); }} className={cn("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium", !genre ? "bg-white text-black" : "bg-surface-2 text-on-surface-variant")}>
              Все жанры
            </button>
            {GENRES.slice(0, 10).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { setGenre(genre === g.id ? null : g.id); setPeriod("all"); haptic(6); }}
                className={cn("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium", genre === g.id ? "bg-white text-black" : "bg-surface-2 text-on-surface-variant")}
              >
                {g.label}
              </button>
            ))}
          </div>

          {fresh.loading && !freshList.length ? (
            <div className="mt-3"><TrackRowSkeleton count={5} /></div>
          ) : fresh.error && !freshList.length ? (
            <ErrorState message={fresh.error} onRetry={fresh.reload} />
          ) : quick.length === 0 ? (
            <EmptyState icon="calendar" title={day ? "В этот день пополнений нет" : "Здесь пока пусто"} text="Выберите другой день или включите «Всё время»." />
          ) : (
            <div className={cn("mt-3", isDesktop && "grid grid-cols-2 gap-x-6")}>
              {quick.map((t) => (
                <TrackRow key={t.id} track={t} context={shown} trailing={<span className="shrink-0 text-[11px] text-on-surface-dim">{relativeDay(t.createdAt)}</span>} />
              ))}
            </div>
          )}
          {shown.length > quick.length && (
            <div className="px-4 pt-2 md:px-6">
              <Button variant="tinted" onClick={() => navigate(`/browse?type=fresh${genre ? `&genre=${genre}` : ""}`)}>
                Все новинки · {shown.length}
              </Button>
            </div>
          )}
        </section>

        <section className="mt-8">
          <SectionHeader title="Миксы" />
          <HScroll>
            {MIXES.map((m) => (
              <MixCard key={m.id} title={m.title} subtitle={m.subtitle} color="" loading={busy === m.id} onPlay={() => playMix(m.id, m.slugs)} />
            ))}
          </HScroll>
        </section>

        <section className="mt-8">
          <SectionHeader title="Случайные" action="Обновить" onAction={() => setRandomTick((t) => t + 1)} />
          {random.loading && !heroList.length ? (
            <CardRowSkeleton aspect="aspect-square" width="w-[138px]" />
          ) : (
            <HScroll>
              {heroList.slice(1).map((t) => (
                <TrackCard key={t.id} track={t} context={heroList} />
              ))}
            </HScroll>
          )}
        </section>

        {offlineTracks.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="Офлайн" action="Все" onAction={() => navigate("/library?tab=downloads")} />
            <HScroll>
              {offlineTracks.slice(0, 12).map((t) => (
                <TrackCard key={t.id} track={t} context={offlineTracks} />
              ))}
            </HScroll>
          </section>
        )}

        <section className="mt-8">
          <SectionHeader title={season.data ? `${SEASON_RU[season.data.season]} ${season.data.year}` : "Сезон"} action="Все" onAction={() => navigate(season.data ? `/year/${season.data.year}?season=${season.data.season}` : "/browse")} />
          {season.loading && !season.data ? <CardRowSkeleton /> : (
            <HScroll>
              {season.data?.items.map((a) => (
                <AnimeCard key={a.id} anime={a} />
              ))}
            </HScroll>
          )}
        </section>

        <section className="mt-8">
          <SectionHeader title="Легенды" />
          {legends.loading && !legendPick.length ? <CardRowSkeleton /> : (
            <HScroll>
              {legendPick.map((a) => (
                <AnimeCard key={a.id} anime={a} />
              ))}
            </HScroll>
          )}
        </section>

        {history.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="Недавние" action="Все" onAction={() => navigate("/library?tab=history")} />
            <HScroll>
              {history.slice(0, 12).map((t) => (
                <TrackCard key={t.id} track={t} context={history} />
              ))}
            </HScroll>
          </section>
        )}

        <section className="mt-8">
          <SectionHeader title="Исполнители" />
          {artists.loading && !artistPick.length ? (
            <div className="flex gap-3 overflow-hidden px-4 md:px-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-[92px] shrink-0">
                  <Skeleton className="mx-auto h-[84px] w-[84px] rounded-full" />
                  <Skeleton className="mx-auto mt-2 h-3 w-14 rounded-md" />
                </div>
              ))}
            </div>
          ) : (
            <HScroll>
              {artistPick.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </HScroll>
          )}
        </section>

        <section className="mt-8">
          <SectionHeader title="Недавно добавленные" action="Слушать" onAction={() => latest.data && player.playTracks(latest.data, 0)} />
          {latest.loading && !latest.data ? <TrackRowSkeleton count={5} /> : (
            <div className="md:grid md:grid-cols-2 md:gap-x-6">
              {latest.data?.map((t) => (
                <TrackRow key={t.id} track={t} context={latest.data ?? undefined} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
