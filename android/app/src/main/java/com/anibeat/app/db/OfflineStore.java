package com.anibeat.app.db;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.anibeat.app.model.Track;

import java.util.ArrayList;
import java.util.List;

/**
 * Офлайн-хранилище и избранное (порт src/lib/offline.ts + library store).
 *  • offline — метаданные треков, доступных без интернета
 *  • favorites / history / playlists — пользовательская библиотека
 */
public final class OfflineStore extends SQLiteOpenHelper {

    private static final String DB = "anibeat.db";
    private static final int VERSION = 1;
    private static OfflineStore INSTANCE;

    public static void init(Context ctx) {
        if (INSTANCE == null) INSTANCE = new OfflineStore(ctx.getApplicationContext());
    }

    public static OfflineStore get() { return INSTANCE; }

    private OfflineStore(Context context) {
        super(context, DB, null, VERSION);
    }

    @Override public void onCreate(@NonNull SQLiteDatabase db) {
        db.execSQL("CREATE TABLE offline (id TEXT PRIMARY KEY, kind TEXT, title TEXT, artist TEXT, anime TEXT, " +
                "slug TEXT, theme TEXT, audio TEXT, video TEXT, cover TEXT, size INTEGER, saved_at INTEGER)");
        db.execSQL("CREATE TABLE favorites (id TEXT PRIMARY KEY, json TEXT, added_at INTEGER)");
        db.execSQL("CREATE TABLE history (id TEXT PRIMARY KEY, json TEXT, played_at INTEGER)");
        db.execSQL("CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER)");
        db.execSQL("CREATE TABLE playlist_tracks (playlist_id TEXT, track_id TEXT, json TEXT, pos INTEGER)");
    }

    @Override public void onUpgrade(@NonNull SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS offline");
        db.execSQL("DROP TABLE IF EXISTS favorites");
        db.execSQL("DROP TABLE IF EXISTS history");
        db.execSQL("DROP TABLE IF EXISTS playlists");
        db.execSQL("DROP TABLE IF EXISTS playlist_tracks");
        onCreate(db);
    }

    /* ---------------- офлайн ---------------- */

    public void saveOffline(Track t, String kind, long size) {
        ContentValues v = new ContentValues();
        v.put("id", t.id);
        v.put("kind", kind);
        v.put("title", t.title);
        v.put("artist", t.artistsLine());
        v.put("anime", t.anime.name);
        v.put("slug", t.anime.slug);
        v.put("theme", t.themeSlug);
        v.put("audio", t.audioUrl);
        v.put("video", t.videoUrl);
        v.put("cover", t.coverSmall != null ? t.coverSmall : t.cover);
        v.put("size", size);
        v.put("saved_at", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("offline", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public boolean isOffline(String id) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM offline WHERE id = ? LIMIT 1", new String[]{id})) {
            return c.moveToFirst();
        }
    }

    public void removeOffline(String id) {
        getWritableDatabase().delete("offline", "id = ?", new String[]{id});
    }

    public List<String[]> offlineRows() {
        List<String[]> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT id, title, artist, anime, theme, cover, size, kind FROM offline ORDER BY saved_at DESC", null)) {
            while (c.moveToNext()) {
                out.add(new String[]{c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), c.getString(5), String.valueOf(c.getLong(6)), c.getString(7)});
            }
        }
        return out;
    }

    public long offlineBytes() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT SUM(size) FROM offline", null)) {
            return c.moveToFirst() ? c.getLong(0) : 0L;
        }
    }

    /* ---------------- избранное / история ---------------- */

    public void toggleFavorite(String id, String json) {
        SQLiteDatabase db = getWritableDatabase();
        if (isFavorite(id)) db.delete("favorites", "id = ?", new String[]{id});
        else {
            ContentValues v = new ContentValues();
            v.put("id", id);
            v.put("json", json);
            v.put("added_at", System.currentTimeMillis());
            db.insertWithOnConflict("favorites", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    public boolean isFavorite(String id) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM favorites WHERE id = ? LIMIT 1", new String[]{id})) {
            return c.moveToFirst();
        }
    }

    public List<String> favoritesJson() {
        List<String> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM favorites ORDER BY added_at DESC", null)) {
            while (c.moveToNext()) out.add(c.getString(0));
        }
        return out;
    }

    public void pushHistory(String id, String json) {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("history", "id = ?", new String[]{id});
        ContentValues v = new ContentValues();
        v.put("id", id);
        v.put("json", json);
        v.put("played_at", System.currentTimeMillis());
        db.insert("history", null, v);
    }

    public List<String> historyJson() {
        List<String> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM history ORDER BY played_at DESC LIMIT 80", null)) {
            while (c.moveToNext()) out.add(c.getString(0));
        }
        return out;
    }

    /* ---------------- плейлисты ---------------- */

    public void createPlaylist(String id, String name) {
        ContentValues v = new ContentValues();
        v.put("id", id);
        v.put("name", name);
        v.put("created_at", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("playlists", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public void renamePlaylist(String id, String name) {
        ContentValues v = new ContentValues();
        v.put("name", name);
        getWritableDatabase().update("playlists", v, "id = ?", new String[]{id});
    }

    public void deletePlaylist(String id) {
        getWritableDatabase().delete("playlists", "id = ?", new String[]{id});
        getWritableDatabase().delete("playlist_tracks", "playlist_id = ?", new String[]{id});
    }

    public void addToPlaylist(String playlistId, String trackId, String json) {
        ContentValues v = new ContentValues();
        v.put("playlist_id", playlistId);
        v.put("track_id", trackId);
        v.put("json", json);
        v.put("pos", System.currentTimeMillis());
        getWritableDatabase().insert("playlist_tracks", null, v);
    }

    public List<String[]> playlists() {
        List<String[]> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT p.id, p.name, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = p.id) FROM playlists p ORDER BY created_at DESC", null)) {
            while (c.moveToNext()) out.add(new String[]{c.getString(0), c.getString(1), String.valueOf(c.getInt(2))});
        }
        return out;
    }

    @Nullable public String playlistName(String id) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT name FROM playlists WHERE id = ?", new String[]{id})) {
            return c.moveToFirst() ? c.getString(0) : null;
        }
    }
}
