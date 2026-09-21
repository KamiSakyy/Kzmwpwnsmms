package com.anibeat.app.ui;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.Player;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.anibeat.app.R;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.anibeat.app.util.Formats;
import com.bumptech.glide.Glide;

/**
 * Полноэкранный плеер.
 *  • по умолчанию — обложка + транспорт (аудио-поток);
 *  • кнопка «Видео» ставит videoUrl и НЕ сбрасывает позицию (continue);
 *  • кнопка ⛶ — настоящий fullscreen: hide system bars + landscape lock;
 *  • при сворачивании activity → exitVideoMode() (трафик прекращается).
 */
public class PlayerActivity extends AppCompatActivity {

    public static boolean isVisible = false;

    private PlayerView videoView;
    private ImageView cover;
    private View videoControls;
    private SeekBar seek;
    private TextView time, title, artist, sub;
    private PlayerController ctrl;
    private android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean fullscreen = false;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            updateProgress();
            handler.postDelayed(this, 500);
        }
    };

    @Override protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);
        ctrl = PlayerController.get();

        videoView = findViewById(R.id.video);
        cover = findViewById(R.id.cover);
        videoControls = findViewById(R.id.video_controls);
        seek = findViewById(R.id.seek);
        time = findViewById(R.id.time);
        title = findViewById(R.id.title);
        artist = findViewById(R.id.artist);
        sub = findViewById(R.id.sub);

        Player p = ctrl.player();
        if (p != null) videoView.setPlayer(p);

        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) { }
            @Override public void onStartTrackingTouch(SeekBar bar) { }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                Player pl = ctrl.player();
                if (pl != null && pl.getDuration() > 0) ctrl.seekTo((long) (pl.getDuration() * (bar.getProgress() / 1000.0)));
            }
        });

        findViewById(R.id.btn_close).setOnClickListener(x -> finish());
        findViewById(R.id.btn_play).setOnClickListener(x -> ctrl.togglePlay());
        findViewById(R.id.btn_next).setOnClickListener(x -> ctrl.next(false));
        findViewById(R.id.btn_prev).setOnClickListener(x -> ctrl.prev());
        findViewById(R.id.btn_shuffle).setOnClickListener(x -> ctrl.toggleShuffle());
        findViewById(R.id.btn_repeat).setOnClickListener(x -> ctrl.cycleRepeat());
        findViewById(R.id.btn_video).setOnClickListener(x -> {
            ctrl.toggleVideoMode();
            render();
        });
        findViewById(R.id.btn_fullscreen).setOnClickListener(x -> toggleFullscreen());
        findViewById(R.id.btn_queue).setOnClickListener(x -> QueueSheet.show(this));
        findViewById(R.id.btn_fav).setOnClickListener(x -> TrackMenu.toggleFavorite(this, ctrl.current()));
        findViewById(R.id.btn_download).setOnClickListener(x -> Downloader.save(this, ctrl.current()));

        render();
    }

    private void render() {
        Track t = ctrl.current();
        if (t == null) { finish(); return; }
        title.setText(t.title);
        artist.setText(t.artistsLine());
        sub.setText(t.themeSlug + " · " + t.anime.name);

        boolean video = ctrl.videoMode();
        cover.setVisibility(video ? View.GONE : View.VISIBLE);
        videoView.setVisibility(video ? View.VISIBLE : View.GONE);
        videoControls.setVisibility(video ? View.VISIBLE : View.GONE);
        if (!video) Glide.with(this).load(t.cover).into(cover);
        findViewById(R.id.btn_fullscreen).setEnabled(true);
    }

    private void updateProgress() {
        Player p = ctrl.player();
        if (p == null) return;
        long dur = p.getDuration();
        long pos = p.getCurrentPosition();
        if (dur > 0) {
            seek.setProgress((int) (pos * 1000 / dur));
            time.setText(Formats.time(pos) + " / " + Formats.time(dur));
        }
        ((ImageView) findViewById(R.id.btn_play)).setImageResource(p.isPlaying() ? R.drawable.ic_pause : R.drawable.ic_play);
    }

    /** Полный экран: системные бары скрыты + горизонтальная ориентация. */
    private void toggleFullscreen() {
        fullscreen = !fullscreen;
        if (fullscreen) {
            if (!ctrl.videoMode()) { ctrl.toggleVideoMode(); render(); }
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            videoView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override protected void onStart() {
        super.onStart();
        isVisible = true;
        handler.post(tick);
    }

    @Override protected void onStop() {
        super.onStop();
        isVisible = false;
        handler.removeCallbacks(tick);
        // Свёрнуто → видео-поток не должен тянуть трафик: переключаемся на аудио с той же секунды
        ctrl.exitVideoMode();
        if (fullscreen) toggleFullscreen();
    }

    @Override protected void onResume() {
        super.onResume();
        render();
    }

    @NonNull @Override public android.view.View onCreatePanelView(int featureId) {
        return super.onCreatePanelView(featureId);
    }
}
