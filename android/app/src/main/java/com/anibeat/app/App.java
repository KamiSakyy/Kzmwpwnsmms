package com.anibeat.app;

import android.app.Application;
import android.content.ComponentName;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.anibeat.app.api.HttpClient;
import com.anibeat.app.db.OfflineStore;
import com.anibeat.app.player.PlaybackService;
import com.anibeat.app.player.PlayerController;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;

/** Инициализация процессов: HTTP-клиент, офлайн-база, подключение к MediaSession. */
public class App extends Application {

    private ListenableFuture<MediaController> controllerFuture;

    @Override public void onCreate() {
        super.onCreate();
        HttpClient.init(this);
        OfflineStore.init(this);
        connectPlayer();
    }

    private void connectPlayer() {
        SessionToken token = new SessionToken(this, new ComponentName(this, PlaybackService.class));
        controllerFuture = new MediaController.Builder(this, token).buildAsync();
        controllerFuture.addListener(() -> {
            try {
                MediaController c = controllerFuture.get();
                PlayerController.get().attach(c);
            } catch (Exception ignored) { }
        }, MoreExecutors.directExecutor());
    }

    /** Показать приложение в системном «медиа-выходе» (как в веб-версии MediaSession). */
    public static void registerAudioOutput(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) am.setMode(AudioManager.MODE_NORMAL);
        }
    }

    @NonNull public ListenableFuture<MediaController> controller() {
        return controllerFuture;
    }
}
