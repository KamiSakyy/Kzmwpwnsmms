import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLibrary } from "@/store/library";
import { usePlayerActions } from "@/store/player";
import { useUIActions } from "@/store/ui";
import { useDownloads, type DownloadJob } from "@/store/downloads";
import { formatBytes, useOfflineList } from "@/lib/offline";
import { pluralRu, uniqueBy } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/Nav";
import { TrackRow } from "@/components/cards";
import { BottomSheet, Button, Cover, EmptyState, IconButton, MenuItem, ProgressBar, Segmented } from "@/components/ui";

type Tab = "favorites" | "downloads" | "playlists" | "history";

function jobStatus(j: DownloadJob): string {
  switch (j.status) {
    case "queued":
      return "В очереди";
    case "downloading":
      return j.total ? `${Math.round((j.received / j.total) * 100)}% · ${formatBytes(j.total)}` : formatBytes(j.received);
    case "done":
      return `Готово · ${formatBytes(j.received)}`;
    case "error":
    case "external":
      return j.error ?? "Ошибка";
    case "cancelled":
      return "Отменено";
  }
}

function PlayBar({ onPlay, onShuffle, count, right }: { onPlay: () => void; onShuffle?: () => void; count: number; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 pt-3 md:px-6">
      <button type="button" onClick={onPlay} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-primary">
        <Icon name="play_arrow" size={18} />
        Слушать
      </button>
      {onShuffle && (
        <button type="button" onClick={onShuffle} disabled={count < 2} className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-surface-2 text-[15px] font-semibold text-primary disabled:opacity-40">
          <Icon name="shuffle" size={18} />
          Вперемешку
        </button>
      )}
      {right}
    </div>
  );
}

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "favorites";
  const navigate = useNavigate();
  const player = usePlayerActions();
  const { toast } = useUIActions();
  const { favorites, history, clearHistory, playlists, createPlaylist } = useLibrary();
  const { jobs, cancel, dismiss, clearFinished, remove } = useDownloads();
  const offline = useOfflineList();
  const offlineTracks = useMemo(() => uniqueBy(offline.map((m) => m.track), (t) => t.id), [offline]);
  const offlineBytes = offline.reduce((n, m) => n + m.size, 0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const setTab = (t: Tab) => {
    const n = new URLSearchParams(params);
    n.set("tab", t);
    setParams(n, { replace: true });
  };

  return (
    <div className="animate-fade-in pb-6">
      <TopBar
        large
        title="Медиатека"
        actions={
          tab === "history" && history.length > 0 ? (
            <IconButton icon="delete" label="Очистить" size={20} onClick={() => { clearHistory(); toast("История очищена"); }} />
          ) : tab === "playlists" ? (
            <IconButton icon="add" label="Новый плейлист" size={22} onClick={() => setCreating(true)} />
          ) : null
        }
      />
      <div className="mx-auto max-w-6xl">
        <div className="px-4 pb-1 pt-2 md:px-6">
          <Segmented
            value={tab}
            onChange={setTab}
            items={[
              { value: "favorites", label: "Избранное" },
              { value: "downloads", label: "Скачано" },
              { value: "playlists", label: "Плейлисты" },
              { value: "history", label: "История" },
            ]}
          />
        </div>

        {tab === "favorites" &&
          (favorites.length === 0 ? (
            <EmptyState icon="favorite_border" title="Пока пусто" text="Нажмите сердечко у трека — он появится здесь." action="Найти музыку" onAction={() => navigate("/search")} />
          ) : (
            <>
              <PlayBar count={favorites.length} onPlay={() => { player.playTracks(favorites, 0); player.openNowPlaying(); }} onShuffle={() => player.playTracks(favorites, 0, { shuffle: true })} />
              <div className="mt-2 md:grid md:grid-cols-2 md:gap-x-6">
                {favorites.map((t) => (
                  <TrackRow key={t.id} track={t} context={favorites} />
                ))}
              </div>
            </>
          ))}

        {tab === "downloads" && (
          <div>
            {jobs.length > 0 && (
              <section className="px-4 pt-4 md:px-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-on-surface">Загрузки</h2>
                  <button type="button" onClick={clearFinished} className="tap text-[14px] text-primary">
                    Очистить
                  </button>
                </div>
                <div className="ios-group">
                  {jobs.map((j, i) => {
                    const live = j.status === "queued" || j.status === "downloading";
                    return (
                      <div key={j.key} className={i ? "border-t border-white/[0.07]" : ""}>
                        <div className="flex items-center gap-3 p-3">
                          <Cover src={j.track.coverSmall ?? j.track.cover} className="h-10 w-10" rounded="rounded-[8px]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] text-on-surface">{j.track.title}</p>
                            <p className="flex items-center gap-1 truncate text-[12.5px] text-on-surface-variant">
                              {j.status === "done" && <Icon name="check_circle" size={13} className="text-[#30d158]" />}
                              {(j.status === "error" || j.status === "external") && <Icon name="error_outline" size={13} className="text-error" />}
                              {jobStatus(j)}
                            </p>
                          </div>
                          <IconButton icon={live ? "stop" : "close"} label={live ? "Отменить" : "Убрать"} size={live ? 14 : 16} className="h-8 w-8 text-on-surface-dim" onClick={() => (live ? cancel(j.key) : dismiss(j.key))} />
                        </div>
                        {live && <ProgressBar className="mx-3 mb-3" value={j.total ? (j.received / j.total) * 100 : 0} indeterminate={!j.total && j.status === "downloading"} />}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {offlineTracks.length === 0 ? (
              <EmptyState icon="cloud_download" title="Нет загрузок" text="В меню трека выберите «Сохранить офлайн» — он будет играть без интернета." action="Найти музыку" onAction={() => navigate("/search")} />
            ) : (
              <>
                <PlayBar count={offlineTracks.length} onPlay={() => { player.playTracks(offlineTracks, 0); player.openNowPlaying(); }} onShuffle={() => player.playTracks(offlineTracks, 0, { shuffle: true })} />
                <p className="px-5 pt-1.5 text-[12.5px] text-on-surface-variant md:px-7">
                  {pluralRu(offline.length, "файл", "файла", "файлов")} · {formatBytes(offlineBytes)}
                </p>
                <div className="mt-1 md:grid md:grid-cols-2 md:gap-x-6">
                  {offline.map((m) => (
                    <TrackRow key={m.key} track={m.track} context={offlineTracks} onRemove={() => void remove(m.trackId, m.kind)} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "history" &&
          (history.length === 0 ? (
            <EmptyState icon="history" title="История пуста" text="Здесь появятся треки, которые вы слушали." />
          ) : (
            <>
              <PlayBar count={history.length} onPlay={() => player.playTracks(history, 0)} />
              <div className="mt-2 md:grid md:grid-cols-2 md:gap-x-6">
                {history.map((t) => (
                  <TrackRow key={t.id} track={t} context={history} />
                ))}
              </div>
            </>
          ))}

        {tab === "playlists" &&
          (playlists.length === 0 ? (
            <EmptyState icon="queue_music" title="Нет плейлистов" text="Создайте плейлист и соберите в нём любимые темы." action="Создать" onAction={() => setCreating(true)} />
          ) : (
            <div className="px-4 pt-4 md:px-6">
              <div className="ios-group">
                {playlists.map((pl, i) => (
                  <button key={pl.id} type="button" onClick={() => navigate(`/playlist/${pl.id}`)} className="row-tap flex w-full items-center gap-3 pl-3 pr-3.5 text-left">
                    <div className="grid h-12 w-12 shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[9px] bg-surface-3">
                      {pl.tracks.length ? (
                        pl.tracks.slice(0, 4).map((t) => <Cover key={t.id} src={t.coverSmall ?? t.cover} className="h-full w-full" rounded="rounded-none" iconSize={11} />)
                      ) : (
                        <div className="col-span-2 flex items-center justify-center text-on-surface-dim">
                          <Icon name="queue_music" size={20} />
                        </div>
                      )}
                    </div>
                    <span className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 ${i ? "border-t border-white/[0.07]" : ""}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] text-on-surface">{pl.name}</span>
                        <span className="block text-[13px] text-on-surface-variant">{pluralRu(pl.tracks.length, "трек", "трека", "треков")}</span>
                      </span>
                      <Icon name="chevron_right" size={15} className="shrink-0 text-on-surface-dim" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      <BottomSheet open={creating} onClose={() => { setCreating(false); setName(""); }} tag="create-playlist" title="Новый плейлист">
        <form
          className="flex items-center gap-2 px-5 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            const pl = createPlaylist(name);
            setCreating(false);
            setName("");
            toast(`Создан «${pl.name}»`);
            setTab("playlists");
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" maxLength={40} className="h-11 flex-1 rounded-[10px] bg-surface-3 px-3.5 text-[16px] text-on-surface outline-none placeholder:text-on-surface-dim" />
          <Button type="submit">Создать</Button>
        </form>
      </BottomSheet>
    </div>
  );
}

/* ---------------- Playlist ---------------- */
export function PlaylistPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const player = usePlayerActions();
  const { toast } = useUIActions();
  const { download } = useDownloads();
  const { playlists, renamePlaylist, deletePlaylist, removeFromPlaylist } = useLibrary();
  const pl = playlists.find((p) => p.id === id);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(pl?.name ?? "");

  if (!pl) {
    return (
      <div>
        <TopBar back title="Плейлист" />
        <EmptyState icon="queue_music" title="Плейлист не найден" action="В медиатеку" onAction={() => navigate("/library?tab=playlists")} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-6">
      <TopBar back title={pl.name} actions={<IconButton icon="more_horiz" label="Меню" size={21} onClick={() => setMenu(true)} />} />
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center px-4 pt-3 text-center md:px-6">
          <div className="grid h-[150px] w-[150px] grid-cols-2 gap-px overflow-hidden rounded-[14px] bg-surface-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
            {pl.tracks.length ? (
              pl.tracks.slice(0, 4).map((t) => <Cover key={t.id} src={t.cover ?? t.coverSmall} className="h-full w-full" rounded="rounded-none" iconSize={16} />)
            ) : (
              <div className="col-span-2 flex items-center justify-center text-on-surface-dim">
                <Icon name="queue_music" size={40} />
              </div>
            )}
          </div>
          <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em] text-on-surface">{pl.name}</h1>
          <p className="text-[13.5px] text-on-surface-variant">{pluralRu(pl.tracks.length, "трек", "трека", "треков")}</p>
        </div>
        {pl.tracks.length > 0 && <PlayBar count={pl.tracks.length} onPlay={() => { player.playTracks(pl.tracks, 0); player.openNowPlaying(); }} onShuffle={() => player.playTracks(pl.tracks, 0, { shuffle: true })} />}
        {pl.tracks.length === 0 ? (
          <EmptyState icon="playlist_add" title="Плейлист пуст" text="Меню трека → «В плейлист»." action="Найти музыку" onAction={() => navigate("/search")} />
        ) : (
          <div className="mt-2 md:grid md:grid-cols-2 md:gap-x-6">
            {pl.tracks.map((t) => (
              <TrackRow key={t.id} track={t} context={pl.tracks} onRemove={() => removeFromPlaylist(pl.id, t.id)} />
            ))}
          </div>
        )}
      </div>

      <BottomSheet open={menu} onClose={() => setMenu(false)} tag="playlist-menu" title={pl.name}>
        <div className="pb-3">
          <MenuItem icon="edit" label="Переименовать" onClick={() => { setMenu(false); setName(pl.name); setTimeout(() => setRenaming(true), 200); }} />
          <MenuItem icon="queue_music" label="В очередь" onClick={() => { player.addToQueue(pl.tracks); setMenu(false); toast("Добавлено в очередь"); }} />
          <MenuItem icon="cloud_download" label="Сохранить офлайн" sub={pluralRu(pl.tracks.length, "трек", "трека", "треков")} onClick={() => { pl.tracks.forEach((t) => download(t, { kind: "audio", saveToDevice: false })); setMenu(false); }} />
          <MenuItem icon="delete" label="Удалить плейлист" danger onClick={() => { deletePlaylist(pl.id); setMenu(false); toast("Удалено"); navigate("/library?tab=playlists", { replace: true }); }} />
        </div>
      </BottomSheet>
      <BottomSheet open={renaming} onClose={() => setRenaming(false)} tag="playlist-rename" title="Переименовать">
        <form className="flex items-center gap-2 px-5 pb-6" onSubmit={(e) => { e.preventDefault(); renamePlaylist(pl.id, name); setRenaming(false); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-11 flex-1 rounded-[10px] bg-surface-3 px-3.5 text-[16px] text-on-surface outline-none" />
          <Button type="submit">Готово</Button>
        </form>
      </BottomSheet>
    </div>
  );
}
