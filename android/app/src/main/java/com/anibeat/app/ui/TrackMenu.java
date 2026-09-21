package com.anibeat.app.ui;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.widget.Toast;

import com.anibeat.app.R;
import com.anibeat.app.db.OfflineStore;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.anibeat.app.util.Formats;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/** Контекстное меню трека (порт TrackMenuSheet): очередь, избранное, офлайн, скачивание, шеринг. */
public final class TrackMenu {

    private TrackMenu() { }

    public static void show(Activity host, Track t) {
        if (t == null) return;
        BottomSheetDialog sheet = new BottomSheetDialog(host, R.style.Theme_AniBeat_BottomSheet);
        sheet.setContentView(R.layout.sheet_track_menu);

        ((android.widget.TextView) sheet.findViewById(R.id.menu_title)).setText(t.title);
        ((android.widget.TextView) sheet.findViewById(R.id.menu_artist)).setText(t.artistsLine() + " · " + t.anime.name);

        sheet.findViewById(R.id.menu_play_next).setOnClickListener(v -> {
            PlayerController.get().playNext(t);
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_queue).setOnClickListener(v -> {
            PlayerController.get().addToQueue(java.util.Collections.singletonList(t));
            toast(host, "Добавлено в очередь");
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_fav).setOnClickListener(v -> {
            toggleFavorite(host, t);
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_download_audio).setOnClickListener(v -> {
            Downloader.save(host, t);
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_download_video).setOnClickListener(v -> {
            Downloader.saveVideo(host, t);
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_offline).setOnClickListener(v -> {
            Downloader.saveOffline(host, t);
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_share).setOnClickListener(v -> {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, t.title + " — " + t.artistsLine() + "\n" + t.anime.name + " · " + t.themeSlug + "\nСлушаю в AniBeat");
            host.startActivity(Intent.createChooser(i, "Поделиться"));
            sheet.dismiss();
        });
        sheet.findViewById(R.id.menu_anime).setOnClickListener(v -> {
            Intent i = new Intent(host, AnimeDetailActivity.class);
            i.putExtra(AnimeDetailActivity.EXTRA_SLUG, t.anime.slug);
            host.startActivity(i);
            sheet.dismiss();
        });
        sheet.show();
    }

    public static void toggleFavorite(Activity host, Track t) {
        if (t == null) return;
        OfflineStore store = OfflineStore.get();
        store.toggleFavorite(t.id, Formats.toJson(t));
        toast(host, store.isFavorite(t.id) ? "В избранном" : "Удалено из избранного");
    }

    private static void toast(Activity host, String msg) {
        Toast.makeText(host, msg, Toast.LENGTH_SHORT).show();
    }
}
