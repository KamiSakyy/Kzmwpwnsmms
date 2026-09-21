import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getAnimeByMalIds, searchAll } from "@/api/animethemes";
import { searchAnisongDB } from "@/api/anisongdb";
import { searchShikimori, warmMeta } from "@/api/meta";
import type { AnimeSummary, SearchResults, Track } from "@/types";
import { useAsync, useDebounce } from "@/lib/hooks";
import { uniqueBy } from "@/lib/utils";
import { useLibrary } from "@/store/library";
import { usePlayerActions } from "@/store/player";
import { useSettings } from "@/store/settings";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { AnimeCard, ArtistCard, TrackRow } from "@/components/cards";
import { CardRowSkeleton, Chip, EmptyState, ErrorState, HScroll, SectionHeader, Segmented, TrackRowSkeleton } from "@/components/ui";

const SUGGESTIONS = ["Атака титанов", "Gurenge", "Наруто", "Unravel", "Тетрадь смерти", "Idol", "Магическая битва", "Blue Bird", "Kaikai Kitan", "Ван-Пис", "Tank!", "Sparkle"];
const hasCyrillic = (s: string) => /[а-яё]/i.test(s);
type Tab = "all" | "tracks" | "anime" | "artists";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [focused, setFocused] = useState(false);
  const debounced = useDebounce(q.trim(), 380);
  const inputRef = useRef<HTMLInputElement>(null);
  const player = usePlayerActions();
  const { settings } = useSettings();
  const { recentSearches, addRecentSearch, clearRecentSearches } = useLibrary();

  useEffect(() => {
    if (!initial) inputRef.current?.focus();
  }, [initial]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const enabled = debounced.length >= 2;
  const primary = useAsync<SearchResults>((s) => searchAll(debounced, { signal: s }), [debounced], enabled);
  const byTitle = useAsync<AnimeSummary[]>(
    async (s) => {
      const hits = await searchShikimori(debounced, s);
      if (!hits.length) return [];
      return getAnimeByMalIds(hits.map((h) => h.malId), { signal: s });
    },
    [debounced],
    enabled && (hasCyrillic(debounced) || settings.ruTitles),
  );
  const extra = useAsync<Track[]>((s) => searchAnisongDB(debounced, s), [debounced], enabled && settings.extraSources);

  useEffect(() => {
    if (primary.data && enabled) addRecentSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.data]);

  const anime = useMemo(() => uniqueBy([...(byTitle.data ?? []), ...(primary.data?.anime ?? [])], (a) => a.slug), [byTitle.data, primary.data]);
  const tracks = primary.data?.tracks ?? [];
  const artists = primary.data?.artists ?? [];
  const extraTracks = useMemo(() => {
    if (!extra.data) return [];
    const known = new Set(tracks.map((t) => `${t.anime.malId ?? ""}|${t.type}${t.sequence ?? ""}`));
    return extra.data.filter((t) => !t.anime.malId || !known.has(`${t.anime.malId}|${t.type}${t.sequence ?? ""}`));
  }, [extra.data, tracks]);

  useEffect(() => {
    warmMeta([...anime.map((a) => a.malId), ...tracks.map((t) => t.anime.malId), ...extraTracks.map((t) => t.anime.malId)]);
  }, [anime, tracks, extraTracks]);

  const loading = primary.loading || (byTitle.loading && !primary.data);
  const total = anime.length + tracks.length + artists.length + extraTracks.length;
  const ready = enabled && !loading && (primary.data || primary.error);
  const allTracks = useMemo(() => [...tracks, ...extraTracks], [tracks, extraTracks]);

  return (
    <div className="animate-fade-in pb-6">
      <header className="sticky top-0 z-30 bar safe-top">
        <div className="mx-auto max-w-6xl px-4 pb-2 pt-2 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center gap-1.5 rounded-[10px] bg-surface-3 px-2.5">
              <Icon name="search" size={17} className="shrink-0 text-on-surface-dim" />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder="Аниме, песня, исполнитель"
                enterKeyHint="search"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-on-surface placeholder:text-on-surface-dim focus:outline-none"
              />
              {q && (
                <button type="button" aria-label="Очистить" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); inputRef.current?.focus(); }} className="tap flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-5 text-black">
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
            {(focused || q) && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); inputRef.current?.blur(); }} className="tap shrink-0 text-[17px] text-primary">
                Отмена
              </button>
            )}
          </div>
          {enabled && (
            <div className="pt-2">
              <Segmented value={tab} onChange={setTab} items={[{ value: "all", label: "Всё" }, { value: "tracks", label: "Треки" }, { value: "anime", label: "Аниме" }, { value: "artists", label: "Артисты" }]} />
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl">
        {!enabled && (
          <div className="px-4 pt-3 md:px-6">
            {recentSearches.length > 0 && (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-on-surface">Недавние</h2>
                  <button type="button" onClick={clearRecentSearches} className="tap text-[14px] text-primary">
                    Очистить
                  </button>
                </div>
                <div className="mb-6 ios-group">
                  {recentSearches.map((s, i) => (
                    <button key={s} type="button" onClick={() => setQ(s)} className="row-tap flex w-full items-center gap-3 pl-4 pr-3.5 text-left">
                      <Icon name="history" size={17} className="shrink-0 text-on-surface-dim" />
                      <span className={cn("flex min-w-0 flex-1 items-center py-3 text-[16px] text-on-surface", i && "border-t border-white/[0.07]")}>
                        <span className="truncate">{s}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <h2 className="mb-2 text-[15px] font-semibold text-on-surface">Попробуйте</h2>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} onClick={() => setQ(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {enabled && loading && !primary.data && (
          <div className="pt-4">
            <TrackRowSkeleton count={5} />
            <div className="mt-4">
              <CardRowSkeleton />
            </div>
          </div>
        )}
        {enabled && primary.error && !anime.length && !extraTracks.length && <ErrorState message={primary.error} onRetry={primary.reload} />}
        {ready && total === 0 && !extra.loading && <EmptyState icon="search" title="Ничего не найдено" text="Попробуйте другое написание — по-русски или латиницей." />}

        {enabled && total > 0 && (
          <div className="space-y-7 pt-4">
            {(tab === "all" || tab === "anime") && anime.length > 0 && (
              <section>
                <SectionHeader title="Аниме" />
                {tab === "anime" ? (
                  <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 md:grid-cols-6 md:px-6">
                    {anime.map((a) => (
                      <AnimeCard key={a.id} anime={a} wide />
                    ))}
                  </div>
                ) : (
                  <HScroll>
                    {anime.map((a) => (
                      <AnimeCard key={a.id} anime={a} />
                    ))}
                  </HScroll>
                )}
              </section>
            )}
            {(tab === "all" || tab === "tracks") && tracks.length > 0 && (
              <section>
                <SectionHeader title="Треки" action="Слушать" onAction={() => player.playTracks(allTracks, 0)} />
                <div className="md:grid md:grid-cols-2 md:gap-x-6">
                  {(tab === "all" ? tracks.slice(0, 8) : tracks).map((t) => (
                    <TrackRow key={t.id} track={t} context={allTracks} />
                  ))}
                </div>
              </section>
            )}
            {(tab === "all" || tab === "tracks") && (extraTracks.length > 0 || (extra.loading && settings.extraSources)) && (
              <section>
                <SectionHeader title="Ещё треки" />
                {extra.loading && !extraTracks.length ? (
                  <TrackRowSkeleton count={3} />
                ) : (
                  <div className="md:grid md:grid-cols-2 md:gap-x-6">
                    {(tab === "all" ? extraTracks.slice(0, 6) : extraTracks).map((t) => (
                      <TrackRow key={t.id} track={t} context={allTracks} />
                    ))}
                  </div>
                )}
              </section>
            )}
            {(tab === "all" || tab === "artists") && artists.length > 0 && (
              <section>
                <SectionHeader title="Исполнители" />
                <HScroll>
                  {artists.map((a) => (
                    <ArtistCard key={a.id} artist={a} />
                  ))}
                </HScroll>
              </section>
            )}
            {tab !== "all" && ((tab === "tracks" && !allTracks.length) || (tab === "anime" && !anime.length) || (tab === "artists" && !artists.length)) && <EmptyState icon="search" title="Пусто" text="Посмотрите другие вкладки." />}
          </div>
        )}
      </div>
    </div>
  );
}
