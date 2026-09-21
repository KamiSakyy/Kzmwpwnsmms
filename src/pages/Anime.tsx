import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAnime, getAnimeByMalIds, getArtist } from "@/api/animethemes";
import { getAnisongsForAnime } from "@/api/anisongdb";
import { KIND_RU, cleanShikiText, fixShikiHost, getShikiDetails, useAnimeMeta, type ShikiDetails } from "@/api/meta";
import type { AnimeDetail, ArtistDetail, Track } from "@/types";
import { useAsync } from "@/lib/hooks";
import { pluralRu, seasonLabel } from "@/lib/utils";
import { usePlayerActions } from "@/store/player";
import { useUIActions } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { useDownloads } from "@/store/downloads";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/Nav";
import { TrackRow } from "@/components/cards";
import { Chip, Cover, EmptyState, ErrorState, IconButton, Skeleton, TrackRowSkeleton } from "@/components/ui";

function Backdrop({ image }: { image: string | null }) {
  if (!image) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[340px] overflow-hidden">
      <div className="absolute -inset-16 bg-cover bg-center opacity-35 blur-3xl saturate-150" style={{ backgroundImage: `url(${image})` }} />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-black/90" />
      <div className="absolute inset-0 bg-black/45" />
    </div>
  );
}

function ActionRow({ onPlay, onShuffle, onSave, disabled }: { onPlay: () => void; onShuffle: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button type="button" disabled={disabled} onClick={onPlay} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-primary disabled:opacity-40">
        <Icon name="play_arrow" size={18} />
        Слушать
      </button>
      <button type="button" disabled={disabled} onClick={onShuffle} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-primary disabled:opacity-40">
        <Icon name="shuffle" size={18} />
        Вперемешку
      </button>
      <IconButton icon="cloud_download" label="Сохранить офлайн" size={19} className="h-10 w-10 bg-surface-2 text-primary" disabled={disabled} onClick={onSave} />
    </div>
  );
}

export default function AnimePage() {
  const { slug = "" } = useParams();
  const isMal = slug.startsWith("mal-");
  const malFromSlug = isMal ? Number(slug.slice(4)) : null;

  const resolved = useAsync<string | null>(
    async (s) => {
      if (!malFromSlug) return slug;
      const r = await getAnimeByMalIds([malFromSlug], { signal: s });
      return r[0]?.slug ?? null;
    },
    [slug],
  );
  const realSlug = resolved.data ?? (isMal ? null : slug);

  const { data, loading, error, reload } = useAsync<AnimeDetail>((s, update) => getAnime(realSlug as string, { signal: s, onUpdate: update, priority: "high" }), [realSlug], !!realSlug);
  const malId = data?.malId ?? malFromSlug ?? null;
  const meta = useAnimeMeta(malId);
  const { settings } = useSettings();
  const shiki = useAsync<ShikiDetails | null>((s) => getShikiDetails(malId as number, s), [malId], !!malId);
  const extras = useAsync<Track[]>((s) => getAnisongsForAnime(malId, [data?.name ?? "", meta?.name ?? ""], s), [malId, data?.name], settings.extraSources && (!!malId || !!data));

  const player = usePlayerActions();
  const { toast } = useUIActions();
  const { download } = useDownloads();
  const [filter, setFilter] = useState<"all" | "OP" | "ED" | "IN">("all");
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const primary = useMemo(() => {
    if (!data) return [];
    const seen = new Set<number>();
    return data.tracks.filter((t) => (seen.has(t.themeId) ? false : (seen.add(t.themeId), true)));
  }, [data]);

  const extraTracks = useMemo(() => {
    if (!extras.data) return [];
    const known = new Set(primary.map((t) => `${t.type}${t.sequence ?? ""}`));
    return extras.data
      .filter((t) => t.type === "IN" || !known.has(`${t.type}${t.sequence ?? ""}`))
      .map((t) => ({ ...t, cover: data?.cover ?? t.cover, coverSmall: data?.coverSmall ?? t.coverSmall, anime: { ...t.anime, slug: data?.slug ?? t.anime.slug, name: data?.name ?? t.anime.name, malId } }));
  }, [extras.data, primary, data, malId]);

  const all = useMemo(() => [...(showAllVersions ? data?.tracks ?? [] : primary), ...extraTracks], [data, primary, extraTracks, showAllVersions]);
  const visible = useMemo(() => (filter === "all" ? all : all.filter((t) => t.type === filter)), [all, filter]);
  const counts = useMemo(() => ({ OP: all.filter((t) => t.type === "OP").length, ED: all.filter((t) => t.type === "ED").length, IN: all.filter((t) => t.type === "IN").length }), [all]);
  const hasVersions = data ? data.tracks.length > primary.length : false;

  useEffect(() => setExpanded(false), [slug]);

  const ru = settings.ruTitles ? shiki.data?.ru ?? meta?.ru ?? null : null;
  const name = data?.name ?? shiki.data?.name ?? meta?.name ?? "";
  const title = ru || name;
  const poster = settings.dataSaver ? data?.coverSmall ?? data?.cover ?? fixShikiHost(meta?.poster) : fixShikiHost(meta?.poster ?? shiki.data?.poster) ?? data?.cover ?? data?.coverSmall ?? null;
  const description = (settings.ruTitles && shiki.data?.description ? shiki.data.description : data?.synopsis ? cleanShikiText(data.synopsis.replace(/\[Written by MAL Rewrite\]/gi, "")) : shiki.data?.description) ?? null;
  const score = shiki.data?.score ?? meta?.score ?? null;
  const notFound = !loading && !data && !resolved.loading && (isMal ? !resolved.data && !shiki.loading && !shiki.data : !!error);
  const pageLoading = (loading && !data) || (resolved.loading && !data);

  return (
    <div className="relative isolate animate-fade-in pb-6">
      <Backdrop image={meta?.banner ?? poster ?? null} />
      <TopBar back transparent />

      <div className="mx-auto max-w-6xl px-4 md:px-6">
        {pageLoading ? (
          <div className="flex flex-col items-center pt-1">
            <Skeleton className="h-[190px] w-[132px] rounded-[12px]" />
            <Skeleton className="mt-4 h-6 w-52 rounded-lg" />
            <Skeleton className="mt-2 h-4 w-32 rounded-md" />
          </div>
        ) : notFound ? (
          <ErrorState message={error ?? "Не найдено"} onRetry={reload} />
        ) : (
          <>
            <div className="flex flex-col items-center text-center md:flex-row md:items-end md:gap-7 md:text-left">
              <Cover src={poster} fallback={data?.cover ?? data?.coverSmall} alt={title} className="h-[190px] w-[132px] shrink-0 shadow-[0_16px_46px_rgba(0,0,0,0.6)] md:h-[260px] md:w-[180px]" rounded="rounded-[12px]" iconSize={44} priority />
              <div className="mt-3.5 min-w-0 flex-1 md:mt-0">
                <h1 className="text-balance text-[26px] font-bold leading-tight tracking-[-0.03em] text-on-surface md:text-[36px]">{title}</h1>
                {ru && ru !== name && name && <p className="mt-0.5 truncate text-[14px] text-on-surface-variant">{name}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-on-surface-variant md:justify-start">
                  {score != null && score > 0 && (
                    <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
                      <Icon name="star_rate" size={13} className="text-[#ff9f0a]" />
                      {score.toFixed(2)}
                    </span>
                  )}
                  {(shiki.data?.kind || data?.mediaFormat) && <span>{shiki.data?.kind ? KIND_RU[shiki.data.kind] ?? shiki.data.kind.toUpperCase() : data?.mediaFormat}</span>}
                  {(data?.season || data?.year) && <span>{seasonLabel(data?.season, data?.year)}</span>}
                  {shiki.data?.episodes ? <span>{pluralRu(shiki.data.episodes, "эпизод", "эпизода", "эпизодов")}</span> : null}
                </div>
                {shiki.data?.genres.length ? <p className="mt-1.5 line-clamp-1 text-[12.5px] text-on-surface-dim">{shiki.data.genres.join(" · ")}</p> : null}
                <ActionRow
                  disabled={!all.length}
                  onPlay={() => { player.playTracks(all, 0); player.openNowPlaying(); }}
                  onShuffle={() => player.playTracks(all, 0, { shuffle: true })}
                  onSave={() => { all.forEach((t) => download(t, { kind: "audio", saveToDevice: false })); toast(`Сохраняем ${pluralRu(all.length, "трек", "трека", "треков")}`); }}
                />
              </div>
            </div>

            {description && (
              <div className="mt-5">
                <p className={cn("whitespace-pre-line text-[15px] leading-[1.45] text-on-surface-variant", !expanded && "line-clamp-3")}>{description}</p>
                <button type="button" onClick={() => setExpanded((v) => !v)} className="tap mt-1 text-[14px] font-medium text-primary">
                  {expanded ? "Свернуть" : "Ещё"}
                </button>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                  Все
                </Chip>
                {counts.OP > 0 && (
                  <Chip active={filter === "OP"} onClick={() => setFilter("OP")}>
                    OP · {counts.OP}
                  </Chip>
                )}
                {counts.ED > 0 && (
                  <Chip active={filter === "ED"} onClick={() => setFilter("ED")}>
                    ED · {counts.ED}
                  </Chip>
                )}
                {counts.IN > 0 && (
                  <Chip active={filter === "IN"} onClick={() => setFilter("IN")}>
                    Вставки · {counts.IN}
                  </Chip>
                )}
              </div>
              {hasVersions && (
                <button type="button" onClick={() => setShowAllVersions((v) => !v)} className="tap shrink-0 text-[14px] font-medium text-primary">
                  {showAllVersions ? "Скрыть" : "Версии"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mx-auto mt-2 max-w-6xl">
        {pageLoading ? (
          <TrackRowSkeleton count={6} />
        ) : !notFound && visible.length === 0 && !extras.loading ? (
          <EmptyState icon="music_note" title="Треков пока нет" text="Для этого аниме ещё нет записей." />
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-x-6">
            {visible.map((t) => (
              <TrackRow key={t.id} track={t} context={visible} showAnime={false} showVersion />
            ))}
          </div>
        )}
        {extras.loading && settings.extraSources && !pageLoading && <TrackRowSkeleton count={2} />}
      </div>

      {data && (data.studios.length > 0 || data.series.length > 0) && (
        <div className="mx-auto mt-5 max-w-6xl px-4 text-[12.5px] text-on-surface-dim md:px-6">
          {data.studios.length > 0 && <p>{data.studios.map((s) => s.name).join(", ")}</p>}
          {data.series.length > 0 && <p className="mt-0.5">{data.series.map((s) => s.name).join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Artist ---------------- */
export function ArtistPage() {
  const { slug = "" } = useParams();
  const { data, loading, error, reload } = useAsync<ArtistDetail>((s, update) => getArtist(slug, { signal: s, onUpdate: update, priority: "high" }), [slug]);
  const player = usePlayerActions();
  const navigate = useNavigate();
  const [sort, setSort] = useState<"new" | "old" | "anime">("new");

  const tracks: Track[] = useMemo(() => {
    if (!data) return [];
    const list = [...data.tracks];
    if (sort === "old") list.reverse();
    if (sort === "anime") list.sort((a, b) => a.anime.name.localeCompare(b.anime.name));
    return list;
  }, [data, sort]);
  const animeCount = useMemo(() => new Set(tracks.map((t) => t.anime.id)).size, [tracks]);

  return (
    <div className="relative isolate animate-fade-in pb-6">
      <Backdrop image={data?.image ?? null} />
      <TopBar back transparent />
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        {loading && !data ? (
          <div className="flex flex-col items-center pt-1">
            <Skeleton className="h-36 w-36 rounded-full" />
            <Skeleton className="mt-4 h-6 w-44 rounded-lg" />
          </div>
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data ? (
          <div className="flex flex-col items-center text-center md:flex-row md:items-end md:gap-7 md:text-left">
            <div className="h-36 w-36 shrink-0 overflow-hidden rounded-full shadow-[0_16px_46px_rgba(0,0,0,0.6)] md:h-48 md:w-48">
              {data.image || data.imageSmall ? (
                <Cover src={data.image ?? data.imageSmall} fallback={data.imageSmall} alt={data.name} className="h-full w-full" rounded="rounded-full" iconSize={44} priority />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-2 text-on-surface-dim">
                  <Icon name="mic" size={48} />
                </div>
              )}
            </div>
            <div className="mt-3.5 min-w-0 flex-1 md:mt-0">
              <h1 className="text-balance text-[28px] font-bold tracking-[-0.03em] text-on-surface md:text-[40px]">{data.name}</h1>
              <p className="mt-1 text-[13.5px] text-on-surface-variant">
                {pluralRu(data.tracks.length, "трек", "трека", "треков")} · {animeCount} аниме
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" disabled={!tracks.length} onClick={() => { player.playTracks(tracks, 0); player.openNowPlaying(); }} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-primary disabled:opacity-40">
                  <Icon name="play_arrow" size={18} />
                  Слушать
                </button>
                <button type="button" disabled={tracks.length < 2} onClick={() => player.playTracks(tracks, 0, { shuffle: true })} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-primary disabled:opacity-40">
                  <Icon name="shuffle" size={18} />
                  Вперемешку
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {data && tracks.length > 1 && (
          <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
            <Chip active={sort === "new"} onClick={() => setSort("new")}>
              Новые
            </Chip>
            <Chip active={sort === "old"} onClick={() => setSort("old")}>
              Старые
            </Chip>
            <Chip active={sort === "anime"} onClick={() => setSort("anime")}>
              По аниме
            </Chip>
          </div>
        )}
      </div>

      <div className="mx-auto mt-2 max-w-6xl">
        {loading && !data ? (
          <TrackRowSkeleton count={8} />
        ) : data && tracks.length === 0 ? (
          <EmptyState icon="mic" title="Треков пока нет" action="Искать" onAction={() => navigate(`/search?q=${encodeURIComponent(data.name)}`)} />
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-x-6">
            {tracks.map((t) => (
              <TrackRow key={t.id} track={t} context={tracks} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
