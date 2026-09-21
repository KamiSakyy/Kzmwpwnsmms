package com.anibeat.app.player;

import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;

import com.anibeat.app.model.Track;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Состояние плеера для UI (порт src/store/player.tsx).
 *
 * Ключевые правила (совпадают с веб-версией):
 *  1. Очередь и текущий индекс живут здесь; UI только слушает.
 *  2. join(track): если трек уже в очереди — просто переходим к нему.
 *  3. Видео включается только по запросу: applySource() подставляет videoUrl
 *     ТОЛЬКО если videoMode == true, и пересобирает MediaItem с
 *     resetPosition=false → позиция (секунды) сохраняется, синхронизация не рвётся.
 *  4. При сворачивании плеера videoMode сбрасывается и поток видео прекращается.
 */
public final class PlayerController {

    public interface Listener {
        void onQueueChanged();
        void onIndexChanged(int index);
        void onVideoModeChanged(boolean videoMode);
    }

    private static final PlayerController INSTANCE = new PlayerController();

    private final List<Track> queue = new ArrayList<>();
    private final List<Track> original = new ArrayList<>();
    private int index = -1;
    private boolean shuffle = false;
    private boolean videoMode = false;
    private ExoPlayerHolder holder;
    private final List<Listener> listeners = new ArrayList<>();

    private PlayerController() { }

    public static PlayerController get() { return INSTANCE; }

    /* ---------------- привязка ExoPlayer ---------------- */
    interface ExoPlayerHolder { Player player(); }

    void attach(Player p) {
        holder = () -> p;
        p.addListener(new Player.Listener() {
            @Override public void onMediaItemTransition(@Nullable MediaItem item, int reason) {
                int i = p.getCurrentMediaItemIndex();
                if (i != index) { index = i; for (Listener l : listeners) l.onIndexChanged(index); }
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    if (p.getRepeatMode() == Player.REPEAT_MODE_ONE) { p.seekTo(0); p.play(); }
                    else next(true);
                }
            }
            @Override public void onShuffleModeEnabledChanged(boolean enabled) { }
        });
    }

    void detach() { holder = null; }

    @Nullable public Player player() { return holder == null ? null : holder.player(); }

    /* ---------------- очередь ---------------- */
    public void addListener(Listener l) { listeners.add(l); }
    public void removeListener(Listener l) { listeners.remove(l); }

    public List<Track> queue() { return Collections.unmodifiableList(queue); }
    public int index() { return index; }
    public boolean shuffle() { return shuffle; }
    public boolean videoMode() { return videoMode; }

    @Nullable public Track current() {
        return index >= 0 && index < queue.size() ? queue.get(index) : null;
    }

    public boolean isCurrent(String trackId) {
        Track c = current();
        return c != null && c.id.equals(trackId);
    }

    /** Запустить набор треков (плейлист/микс/сезон). */
    public void playTracks(List<Track> tracks, int startIndex, boolean doShuffle) {
        queue.clear();
        queue.addAll(tracks);
        original.clear();
        original.addAll(tracks);
        this.shuffle = doShuffle;
        if (doShuffle) Collections.shuffle(queue, new Random());
        index = Math.max(0, Math.min(startIndex, queue.size() - 1));
        videoMode = false;
        rebuild(true);
    }

    /** Тап по треку: если он уже в очереди — прыгаем к нему. */
    public void playTrack(Track track, @Nullable List<Track> context) {
        if (context != null && !context.isEmpty()) {
            int i = 0;
            for (int k = 0; k < context.size(); k++) if (context.get(k).id.equals(track.id)) { i = k; break; }
            playTracks(context, i, false);
            return;
        }
        int existing = indexOf(track.id);
        if (existing >= 0) { index = existing; rebuild(false); return; }
        queue.add(track);
        if (original.isEmpty()) original.add(track); else original.add(track);
        index = queue.size() - 1;
        rebuild(true);
    }

    public void playNext(Track track) {
        int at = Math.max(0, index) + 1;
        queue.remove(track);
        queue.add(at, track);
        notifyQueue();
    }

    public void addToQueue(List<Track> tracks) {
        for (Track t : tracks) if (indexOf(t.id) < 0 && !queue.contains(t)) queue.add(t);
        notifyQueue();
    }

    public void removeAt(int i) {
        if (i < 0 || i >= queue.size()) return;
        Track removed = queue.remove(i);
        original.remove(removed);
        if (i < index) index--;
        else if (i == index) index = Math.max(0, Math.min(index, queue.size() - 1));
        notifyQueue();
        rebuild(false);
    }

    public void move(int from, int to) {
        if (from < 0 || from >= queue.size() || to < 0 || to >= queue.size()) return;
        String currentId = current() == null ? null : current().id;
        Track t = queue.remove(from);
        queue.add(to, t);
        index = currentId == null ? 0 : Math.max(0, indexOf(currentId));
        notifyQueue();
    }

    public void clearQueue() {
        Track c = current();
        queue.clear();
        if (c != null) queue.add(c);
        original.clear();
        original.addAll(queue);
        index = 0;
        notifyQueue();
    }

    public int indexOf(String id) {
        for (int i = 0; i < queue.size(); i++) if (queue.get(i).id.equals(id)) return i;
        return -1;
    }

    /* ---------------- транспорт ---------------- */
    public void next(boolean auto) {
        Player p = player();
        if (p == null || queue.isEmpty()) return;
        if (index < queue.size() - 1) { index++; rebuild(true); }
        else if (p.getRepeatMode() == Player.REPEAT_MODE_ALL) { index = 0; rebuild(true); }
        else if (!auto) { index = 0; rebuild(true); }
        else p.setPlayWhenReady(false);
    }

    public void prev() {
        Player p = player();
        if (p == null) return;
        if (p.getCurrentPosition() > 4000) { p.seekTo(0); return; }
        if (index > 0) { index--; rebuild(true); }
        else if (p.getRepeatMode() == Player.REPEAT_MODE_ALL && !queue.isEmpty()) { index = queue.size() - 1; rebuild(true); }
        else p.seekTo(0);
    }

    public void togglePlay() {
        Player p = player();
        if (p == null) return;
        if (p.isPlaying()) p.pause(); else p.play();
    }

    public void seekTo(long ms) { Player p = player(); if (p != null) p.seekTo(Math.max(0, ms)); }
    public void seekBy(long deltaMs) {
        Player p = player();
        if (p == null) return;
        p.seekTo(Math.max(0, p.getCurrentPosition() + deltaMs));
    }

    public void setVolume(float v) {
        Player p = player();
        if (p != null) p.setVolume(v);
    }

    public void toggleShuffle() {
        shuffle = !shuffle;
        Player p = player();
        if (p != null) p.setShuffleModeEnabled(shuffle);
        notifyQueue();
    }

    /** off → all → one → off */
    public void cycleRepeat() {
        Player p = player();
        if (p == null) return;
        int mode = p.getRepeatMode();
        int next = mode == Player.REPEAT_MODE_OFF ? Player.REPEAT_MODE_ALL : mode == Player.REPEAT_MODE_ALL ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF;
        p.setRepeatMode(next);
    }

    /* ---------------- видео по запросу ---------------- */
    public void toggleVideoMode() {
        videoMode = !videoMode;
        rebuild(false);
        for (Listener l : listeners) l.onVideoModeChanged(videoMode);
    }

    /** Вызывать при сворачивании плеера: видео-поток прекращается. */
    public void exitVideoMode() {
        if (!videoMode) return;
        videoMode = false;
        rebuild(false);
        for (Listener l : listeners) l.onVideoModeChanged(false);
    }

    /* ---------------- построение MediaItem ---------------- */
    private void rebuild(boolean resetPosition) {
        Player p = player();
        Track t = current();
        if (p == null || t == null) return;
        String url = t.playbackUrl(videoMode);
        MediaMetadata meta = new MediaMetadata.Builder()
                .setTitle(t.title)
                .setArtist(t.artistsLine())
                .setAlbumTitle(t.anime.name + " · " + t.themeSlug)
                .setArtworkUri(t.cover == null ? null : android.net.Uri.parse(t.cover))
                .build();
        MediaItem item = new MediaItem.Builder()
                .setMediaId(t.id)
                .setUri(url)
                .setMediaMetadata(meta)
                .setMimeType(mimeOf(url))
                .build();
        // resetPosition=false → позиция сохраняется при переключении звук↔видео
        p.setMediaItem(item, /* resetPosition = */ resetPosition);
        p.prepare();
        p.play();
    }

    @Nullable
    private String mimeOf(String url) {
        if (url == null) return null;
        if (url.endsWith(".ogg")) return "audio/ogg";
        if (url.endsWith(".mp3")) return "audio/mpeg";
        if (url.endsWith(".webm")) return videoMode ? "video/webm" : "audio/webm";
        if (url.endsWith(".mp4")) return "video/mp4";
        return null;
    }

    private void notifyQueue() {
        for (Listener l : listeners) l.onQueueChanged();
    }
}
