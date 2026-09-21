package com.anibeat.app.ui;

import android.app.Activity;
import android.view.View;
import android.widget.ImageView;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.media3.common.Player;

import com.anibeat.app.R;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.bumptech.glide.Glide;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.materialswitch.MaterialSwitch;

/**
 * Мини-плеер над таб-баром и привязка настроек (bottom-sheet).
 * Эти классы — package-private, чтобы не плодить файлы.
 */
class MiniPlayerBinder implements PlayerController.Listener {

    private final View root;
    private final Activity host;
    private final TextView title, artist;
    private final TextView time;
    private final ImageView cover, playPause;
    private final SeekBar seek;
    private boolean dragging = false;

    MiniPlayerBinder(View root, Activity host) {
        this.root = root;
        this.host = host;
        title = root.findViewById(R.id.mini_title);
        artist = root.findViewById(R.id.mini_artist);
        time = root.findViewById(R.id.mini_time);
        cover = root.findViewById(R.id.mini_cover);
        playPause = root.findViewById(R.id.mini_play);
        seek = root.findViewById(R.id.mini_seek);
    }

    void bind() {
        PlayerController.get().addListener(this);
        playPause.setOnClickListener(v -> PlayerController.get().togglePlay());
        root.findViewById(R.id.mini_next).setOnClickListener(v -> PlayerController.get().next(false));
        root.findViewById(R.id.mini_root).setOnClickListener(v -> ((MainActivity) host).openPlayer());
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) { }
            @Override public void onStartTrackingTouch(SeekBar bar) { dragging = true; }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                Player p = PlayerController.get().player();
                if (p != null && p.getDuration() > 0) PlayerController.get().seekTo((long) (p.getDuration() * (bar.getProgress() / 1000.0)));
                dragging = false;
            }
        });
        refresh();
    }

    void refresh() {
        Track t = PlayerController.get().current();
        if (t == null) { root.setVisibility(View.GONE); return; }
        root.setVisibility(View.VISIBLE);
        title.setText(t.title);
        artist.setText(t.artistsLine());
        Glide.with(host).load(t.coverSmall != null ? t.coverSmall : t.cover).into(cover);
        Player p = PlayerController.get().player();
        boolean playing = p != null && p.isPlaying();
        playPause.setImageResource(playing ? R.drawable.ic_pause : R.drawable.ic_play);
        if (p != null && !dragging && p.getDuration() > 0) {
            seek.setProgress((int) (p.getCurrentPosition() * 1000 / p.getDuration()));
            time.setText(com.anibeat.app.util.Formats.time(p.getCurrentPosition()));
        }
        host.getWindow().getDecorView().postDelayed(this::refresh, 1000);
    }

    @Override public void onQueueChanged() { refresh(); }
    @Override public void onIndexChanged(int index) { refresh(); }
    @Override public void onVideoModeChanged(boolean videoMode) { refresh(); }
}

class SettingsBinder {

    static void bind(BottomSheetDialog sheet, Activity host) {
        com.anibeat.app.db.OfflineStore store = com.anibeat.app.db.OfflineStore.get();
        MaterialSwitch traffic = sheet.findViewById(R.id.sw_traffic);
        MaterialSwitch preload = sheet.findViewById(R.id.sw_preload);
        MaterialSwitch ru = sheet.findViewById(R.id.sw_ru);
        MaterialSwitch extra = sheet.findViewById(R.id.sw_extra);
        TextView storage = sheet.findViewById(R.id.tv_storage);

        android.content.SharedPreferences sp = host.getSharedPreferences("settings", 0);
        ru.setChecked(sp.getBoolean("ruTitles", true));
        extra.setChecked(sp.getBoolean("extraSources", true));
        traffic.setChecked(sp.getBoolean("dataSaver", false));
        preload.setChecked(sp.getBoolean("preloadNext", true));
        storage.setText("Офлайн: " + com.anibeat.app.util.Formats.bytes(store.offlineBytes()));

        ru.setOnCheckedChangeListener((v, c) -> sp.edit().putBoolean("ruTitles", c).apply());
        extra.setOnCheckedChangeListener((v, c) -> sp.edit().putBoolean("extraSources", c).apply());
        traffic.setOnCheckedChangeListener((v, c) -> sp.edit().putBoolean("dataSaver", c).apply());
        preload.setOnCheckedChangeListener((v, c) -> sp.edit().putBoolean("preloadNext", c).apply());

        sheet.findViewById(R.id.clear_cache).setOnClickListener(v -> {
            try { com.anibeat.app.api.HttpClient.get().raw().cache().evictAll(); } catch (Exception ignored) {}
            sheet.dismiss();
        });
        sheet.findViewById(R.id.clear_offline).setOnClickListener(v -> {
            store.getWritableDatabase().delete("offline", null, null);
            sheet.dismiss();
        });
    }
}
