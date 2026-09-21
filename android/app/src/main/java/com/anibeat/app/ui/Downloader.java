package com.anibeat.app.ui;

import android.app.Activity;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.widget.Toast;

import androidx.annotation.Nullable;

import com.anibeat.app.api.HttpClient;
import com.anibeat.app.db.OfflineStore;
import com.anibeat.app.model.Track;
import com.anibeat.app.util.Formats;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Скачивание и офлайн (порт src/store/downloads.tsx + src/lib/offline.ts).
 *  • потоковая запись на диск с прогрессом в нотификации-тосте;
 *  • аудио (.ogg/.mp3) и видео (.webm) отдельными кнопками;
 *  • «сохранить офлайн» — файл кладём в filesDir и помечаем в OfflineStore,
 *    плеер отдаёт локальный URI в первую очередь (см. PlayerController).
 */
public final class Downloader {

    private Downloader() { }

    public static void save(Activity host, @Nullable Track t) {
        if (t != null) download(host, t, t.audioUrl, "ogg", true);
    }

    public static void saveVideo(Activity host, @Nullable Track t) {
        if (t != null && t.hasVideo()) download(host, t, t.videoUrl, "webm", true);
    }

    public static void saveOffline(Activity host, @Nullable Track t) {
        if (t != null) download(host, t, t.audioUrl, "ogg", false);
    }

    private static void download(Activity host, Track t, String url, String ext, boolean toPublicDir) {
        Toast.makeText(host, "Загрузка: " + t.title, Toast.LENGTH_SHORT).show();
        HttpClient.get().workers().execute(() -> {
            long size = 0;
            try {
                Request req = new Request.Builder().url(HttpClient.parse(url)).build();
                Response res = HttpClient.get().raw().newCall(req).execute();
                ResponseBody body = res.body();
                if (!res.isSuccessful() || body == null) throw new Exception("HTTP " + res.code());

                String safe = (t.artistsLine() + " - " + t.title + " [" + t.anime.name + " " + t.themeSlug + "]")
                        .replaceAll("[\\\\/:*?\"<>|]+", "").trim();
                if (safe.length() > 120) safe = safe.substring(0, 120);
                String filename = safe + "." + ext;

                OutputStream out;
                if (toPublicDir && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, ext.equals("webm") ? "video/webm" : "audio/ogg");
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/AniBeat");
                    Uri uri = host.getContentResolver().insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new Exception("no permission");
                    out = host.getContentResolver().openOutputStream(uri);
                } else {
                    File dir = new File(host.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "AniBeat");
                    if (!dir.exists()) dir.mkdirs();
                    out = new FileOutputStream(new File(dir, filename));
                }
                if (out == null) throw new Exception("no stream");

                try (InputStream in = body.byteStream()) {
                    byte[] buf = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buf)) > 0) {
                        out.write(buf, 0, read);
                        size += read;
                    }
                }
                out.close();

                if (!toPublicDir) {
                    // помечаем как офлайн-трек: файл лежит в filesDir и играется без сети
                    OfflineStore.get().saveOffline(t, "audio", size);
                } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    MediaScannerConnection.scanFile(host.getApplicationContext(), new String[]{filename}, null, null);
                }

                final long done = size;
                host.runOnUiThread(() -> Toast.makeText(host,
                        "Сохранено: " + t.title + " · " + Formats.bytes(done), Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                host.runOnUiThread(() -> Toast.makeText(host, "Не удалось скачать файл", Toast.LENGTH_SHORT).show());
            }
        });
    }
}
