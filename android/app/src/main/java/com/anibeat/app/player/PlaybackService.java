package com.anibeat.app.player;

import android.app.PendingIntent;
import android.content.Intent;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import com.anibeat.app.api.HttpClient;
import com.anibeat.app.ui.PlayerActivity;

import java.io.File;

/**
 * Фоновое воспроизведение: ExoPlayer + MediaSession (управление с экрана
 * блокировки / шторки), дисковый кэш медиа 300 МБ и OkHttp-датасорс.
 *
 * Правило трафика: плеер ВСЕГДА получает аудио-URL. Видео-URL подставляется
 * только когда пользователь нажал «Видео» в плеере — то есть трафик тратится
 * ровно тогда, когда он нужен.
 */
public class PlaybackService extends MediaSessionService {

    private static SimpleCache mediaCache;
    private ExoPlayer player;
    private MediaSession session;

    @Override public void onCreate() {
        super.onCreate();
        OkHttpDataSource.Factory http = new OkHttpDataSource.Factory(HttpClient.get().raw());
        File dir = new File(getCacheDir(), "media");
        if (mediaCache == null) mediaCache = new SimpleCache(dir, new LeastRecentlyUsedCacheEvictor(300L * 1024 * 1024));
        CacheDataSource.Factory cache = new CacheDataSource.Factory()
                .setCache(mediaCache)
                .setUpstreamDataSourceFactory(new DefaultDataSource.Factory(this, http))
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(cache))
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                        .setUsage(C.USAGE_MEDIA)
                        .build(), /* handleAudioFocus = */ true)
                .setHandleAudioBecomingNoisy(true)
                .build();

        Intent open = new Intent(this, PlayerActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player)
                .setSessionActivity(pi)
                .setCallback(new MediaSession.Callback() { })
                .build();
        PlayerController.get().attach(player);
    }

    @Nullable @Override public MediaSession onGetSession(@Nullable MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override public void onTaskRemoved(@Nullable Intent rootIntent) {
        Player p = session == null ? null : session.getPlayer();
        if (p == null || p.getPlaybackState() == Player.STATE_IDLE || !p.getPlayWhenReady()) stopSelf();
    }

    @Override public void onDestroy() {
        PlayerController.get().detach();
        if (session != null) { session.release(); session = null; }
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
