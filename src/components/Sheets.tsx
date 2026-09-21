import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer, usePlayerState } from "@/store/player";
import { useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { useDownloads } from "@/store/downloads";
import { useGeneralStore, type Mature } from "@/store/general";
import { clearOffline, formatBytes, storageEstimate, useIsOffline, useOfflineList } from "@/lib/offline";
import { useTrackDisplay } from "@/lib/display";
import { clearHttpCache } from "@/api/http";
import { artistNames, pluralRu, shareTrack } from "@/lib/utils";
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";
import { TrackRow } from "./cards";
import { BottomSheet, Button, Cover as Img, IconButton, ListGroup, ListRow, MenuItem, ProgressBar, Segmented, Switch, Tag } from "./ui";

/* ---------------- Queue ---------------- */
export function QueueSheet() {
  const p = usePlayer();
  const { toast } = useUI();
  return (
    <BottomSheet
      open={p.queueOpen}
      onClose={() => p.setQueueOpen(false)}
      tag="queue"
      title={
        <div className="flex items-center justify-between">
          <span>
            Очередь <span className="text-[15px] font-normal text-on-surface-variant">{p.queue.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <IconButton icon="shuffle" label="Перемешать" size={19} className={cn("h-9 w-9", p.shuffle ? "text-on-surface" : "text-on-surface-dim")} onClick={p.toggleShuffle} />
            <IconButton icon="delete" label="Очистить" size={19} className="h-9 w-9 text-on-surface-dim" disabled={p.queue.length < 2} onClick={() => { p.clearQueue(); toast("Очередь очищена"); }} />
          </div>
        </div>
      }
    >
      <div className="pb-4">
        {p.queue.map((t, i) => (
          <TrackRow
            key={t.id + i}
            track={t}
            dense
            onRemove={p.queue.length > 1 ? () => p.removeFromQueue(i) : undefined}
            trailing={
              <div className="flex shrink-0 flex-col text-on-surface-dim">
                <button type="button" aria-label="Выше" disabled={i === 0} onClick={(e) => { e.stopPropagation(); p.moveInQueue(i, i - 1); }} className="tap disabled:opacity-20">
                  <Icon name="expand_less" size={16} />
                </button>
                <button type="button" aria-label="Ниже" disabled={i === p.queue.length - 1} onClick={(e) => { e.stopPropagation(); p.moveInQueue(i, i + 1); }} className="tap disabled:opacity-20">
                  <Icon name="expand_more" size={16} />
                </button>
              </div>
            }
          />
        ))}
      </div>
    </BottomSheet>
  );
}

/* ---------------- Track menu ---------------- */
export function TrackMenuSheet() {
  const { menuTrack: t, closeTrackMenu, openPlaylistPicker, toast } = useUI();
  const p = usePlayer();
  const { isFavorite, toggleFavorite } = useLibrary();
  const { download, remove } = useDownloads();
  const navigate = useNavigate();
  const d = useTrackDisplay(t);
  const fav = t ? isFavorite(t.id) : false;
  const offline = useIsOffline(t?.id ?? "__none__", "audio");

  const go = (path: string) => {
    closeTrackMenu();
    p.closeNowPlaying();
    navigate(path);
  };

  return (
    <BottomSheet open={!!t} onClose={closeTrackMenu} tag="track-menu">
      {t && (
        <div className="pb-3">
          <div className="flex items-center gap-3.5 px-5 pb-3">
            <Img src={d.thumb ?? d.cover} fallback={d.cover} className="h-14 w-14" rounded="rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold text-on-surface">{t.title}</p>
              <p className="truncate text-[14px] text-on-surface-variant">{artistNames(t)}</p>
              <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-on-surface-dim">
                <Tag tone={t.type}>{t.themeSlug}</Tag>
                {offline && <Tag tone="neutral">офлайн</Tag>}
                <span className="truncate">{d.title}</span>
              </p>
            </div>
          </div>
          <div className="mx-4 mb-1 h-px bg-white/[0.08]" />
          <MenuItem icon="playlist_play" label="Играть следующим" onClick={() => { p.playNext(t); closeTrackMenu(); toast("Будет следующим"); }} />
          <MenuItem icon="queue_music" label="В очередь" onClick={() => { p.addToQueue(t); closeTrackMenu(); toast("Добавлено в очередь"); }} />
          <MenuItem icon={fav ? "favorite" : "favorite_border"} label={fav ? "Убрать из избранного" : "В избранное"} onClick={() => { const added = toggleFavorite(t); closeTrackMenu(); toast(added ? "Добавлено" : "Удалено"); }} />
          <MenuItem icon="playlist_add" label="В плейлист" onClick={() => { closeTrackMenu(); setTimeout(() => openPlaylistPicker(t), 200); }} />
          <div className="mx-4 my-1 h-px bg-white/[0.08]" />
          <MenuItem icon="download" label="Скачать аудио" onClick={() => { download(t, { kind: "audio", saveToDevice: true }); closeTrackMenu(); }} />
          {t.videoUrl !== t.audioUrl && <MenuItem icon="videocam" label="Скачать видео" sub={t.resolution ? `${t.resolution}p` : undefined} onClick={() => { download(t, { kind: "video", saveToDevice: true }); closeTrackMenu(); }} />}
          {offline ? (
            <MenuItem icon="offline_pin" label="Удалить из офлайн" onClick={() => { void remove(t.id, "audio"); closeTrackMenu(); }} />
          ) : (
            <MenuItem icon="cloud_download" label="Сохранить офлайн" onClick={() => { download(t, { kind: "audio", saveToDevice: false }); closeTrackMenu(); }} />
          )}
          <div className="mx-4 my-1 h-px bg-white/[0.08]" />
          <MenuItem icon="tv" label="К аниме" sub={d.title} onClick={() => go(`/anime/${t.anime.slug}`)} />
          {t.artists.filter((a) => a.slug).map((a) => (
            <MenuItem key={a.id} icon="mic" label="К исполнителю" sub={a.name} onClick={() => go(`/artist/${a.slug}`)} />
          ))}
          <MenuItem icon="share" label="Поделиться" onClick={async () => { const r = await shareTrack(t); closeTrackMenu(); if (r === "copied") toast("Скопировано"); else if (r === "failed") toast("Не удалось"); }} />
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------------- Playlist picker ---------------- */
export function PlaylistPickerSheet() {
  const { pickerTrack: t, closePlaylistPicker, toast } = useUI();
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const close = () => {
    closePlaylistPicker();
    setCreating(false);
    setName("");
  };

  return (
    <BottomSheet open={!!t} onClose={close} tag="playlist-picker" title="В плейлист">
      {t && (
        <div className="pb-3">
          {creating ? (
            <form className="flex items-center gap-2 px-5 pb-3" onSubmit={(e) => { e.preventDefault(); const pl = createPlaylist(name, [t]); toast(`Создан «${pl.name}»`); close(); }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" maxLength={40} className="h-11 flex-1 rounded-[10px] bg-surface-3 px-3.5 text-[16px] text-on-surface outline-none placeholder:text-on-surface-dim" />
              <Button type="submit">Создать</Button>
            </form>
          ) : (
            <MenuItem icon="add" label="Новый плейлист" onClick={() => setCreating(true)} />
          )}
          {playlists.map((pl) => {
            const has = pl.tracks.some((x) => x.id === t.id);
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  if (has) return toast("Уже в плейлисте");
                  addToPlaylist(pl.id, t);
                  toast(`Добавлено в «${pl.name}»`);
                  close();
                }}
                className="row-tap flex w-full items-center gap-3.5 px-5 py-2.5 text-left"
              >
                <div className="grid h-11 w-11 shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[9px] bg-surface-3">
                  {pl.tracks.slice(0, 4).map((x) => (
                    <Img key={x.id} src={x.coverSmall ?? x.cover} className="h-full w-full" rounded="rounded-none" iconSize={11} />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] text-on-surface">{pl.name}</p>
                  <p className="text-[13px] text-on-surface-variant">{pluralRu(pl.tracks.length, "трек", "трека", "треков")}</p>
                </div>
                {has && <Icon name="check" size={18} className="text-on-surface" />}
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------------- Settings ---------------- */
export function SettingsSheet() {
  const { settingsOpen, closeSettings, toast } = useUI();
  const { settings, set } = useSettings();
  const { mature, setMature, period, setPeriod } = useGeneralStore();
  const offline = useOfflineList();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    if (settingsOpen) storageEstimate().then(setEstimate);
  }, [settingsOpen, offline.length]);
  const offlineBytes = offline.reduce((n, m) => n + m.size, 0);

  return (
    <BottomSheet open={settingsOpen} onClose={closeSettings} tag="settings" title="Настройки">
      <div className="space-y-5 py-2 pb-8">
        <div className="px-4 md:px-6">
          <p className="px-3 pb-1.5 text-[13px] font-medium uppercase tracking-[0.04em] text-on-surface-variant">Период каталога</p>
          <Segmented value={period} onChange={setPeriod} items={[{ value: "today", label: "Сегодня" }, { value: "week", label: "Неделя" }, { value: "all", label: "Всё" }]} />
          <p className="px-3 pb-1.5 pt-4 text-[13px] font-medium uppercase tracking-[0.04em] text-on-surface-variant">Контент</p>
          <Segmented value={mature} onChange={(v: Mature) => setMature(v)} items={[{ value: "off", label: "Без 18+" }, { value: "on", label: "Разрешить 18+" }]} />
        </div>

        <ListGroup header="Контент и язык">
          <Switch first icon="translate" label="Русские названия" checked={settings.ruTitles} onChange={(v) => set("ruTitles", v)} />
          <Switch icon="layers" label="Расширенная база" sub="Больше песен: вставки и редкие темы" checked={settings.extraSources} onChange={(v) => set("extraSources", v)} />
        </ListGroup>

        <ListGroup header="Трафик" footer="Видео никогда не загружается само — только когда вы нажмёте «Видео». При сворачивании плеера поток видео останавливается.">
          <Switch first icon="data_saver" label="Экономия трафика" sub="Лёгкие обложки, без предзагрузки" checked={settings.dataSaver} onChange={(v) => set("dataSaver", v)} />
          <Switch icon="bolt" label="Готовить следующий трек" sub="Переключение без паузы" checked={settings.preloadNext && !settings.dataSaver} onChange={(v) => set("preloadNext", v)} />
        </ListGroup>

        <div className="px-4 md:px-6">
          <p className="px-3 pb-1.5 text-[13px] font-medium uppercase tracking-[0.04em] text-on-surface-variant">Формат скачивания</p>
          <Segmented value={settings.downloadKind} onChange={(v) => set("downloadKind", v)} items={[{ value: "audio", label: "Аудио" }, { value: "video", label: "Видео" }]} />
        </div>

        <ListGroup header="Хранилище">
          <ListRow first icon="storage" iconColor="bg-[#5e5ce6]" label="Офлайн-треки" value={`${offline.length} · ${formatBytes(offlineBytes)}`} />
          {estimate && estimate.quota > 0 && (
            <div className="border-t border-white/[0.07] px-4 py-3">
              <ProgressBar value={(estimate.usage / estimate.quota) * 100} color="bg-white/80" />
              <p className="mt-1.5 text-[12.5px] text-on-surface-variant">
                {formatBytes(estimate.usage)} из {formatBytes(estimate.quota)}
              </p>
            </div>
          )}
          <ListRow icon="cached" iconColor="bg-surface-5" label="Очистить кэш" onClick={async () => { await clearHttpCache(); toast("Кэш очищен"); }} />
          <ListRow icon="delete" label="Удалить офлайн-треки" danger onClick={async () => { await clearOffline(); toast("Удалено"); }} />
        </ListGroup>

        <p className="px-7 text-center text-[12px] leading-relaxed text-on-surface-dim">AniBeat · Space — пауза, ←/→ — перемотка, Shift+←/→ — треки</p>
      </div>
    </BottomSheet>
  );
}

/* ---------------- Toasts ---------------- */
export function Toasts() {
  const { toasts, dismissToast } = useUI();
  const { current, nowPlayingOpen } = usePlayerState();
  const { activeCount, progress } = useDownloads();
  const navigate = useNavigate();
  if (!toasts.length && !activeCount) return null;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 transition-all md:left-[240px]",
        current ? "bottom-[calc(49px_+_env(safe-area-inset-bottom,0px)_+_76px)] md:bottom-24" : "bottom-[calc(49px_+_env(safe-area-inset-bottom,0px)_+_14px)] md:bottom-6",
        nowPlayingOpen && "bottom-8 md:bottom-8",
      )}
    >
      {activeCount > 0 && (
        <button type="button" onClick={() => navigate("/library?tab=downloads")} className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[14px] bg-surface-2 px-4 py-2.5 text-[14px] text-on-surface shadow-[0_6px_24px_rgba(0,0,0,0.6)] animate-slide-up">
          <Icon name="download" size={18} className="text-on-surface" />
          <span className="flex-1 text-left">
            Загрузка{activeCount > 1 ? ` · ${activeCount}` : ""}
            {progress != null && <span className="text-on-surface-variant"> · {Math.round(progress)}%</span>}
          </span>
          <span className="w-16">
            <ProgressBar value={progress ?? 0} indeterminate={progress == null} />
          </span>
        </button>
      )}
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[14px] bg-surface-3 px-4 py-3 text-[14px] font-medium text-white shadow-[0_6px_24px_rgba(0,0,0,0.6)] animate-slide-up">
          <span className="flex-1">{t.message}</span>
          {t.actionLabel && (
            <button type="button" className="tap font-semibold text-on-surface" onClick={() => { t.onAction?.(); dismissToast(t.id); }}>
              {t.actionLabel}
            </button>
          )}
          <button type="button" aria-label="Закрыть" onClick={() => dismissToast(t.id)} className="tap text-white/45">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
