package com.anibeat.app.api;

import com.anibeat.app.model.Track;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Дополнительный источник (порт src/api/anisongdb.ts): вставочные песни (IN),
 * редкие OP/ED, которых нет в основном каталоге. Отдаёт MP3/WEBM.
 * Основной источник НЕ заменяет — только дополняет.
 */
public final class AnisongDbApi {

    public interface Cb { void ok(List<Track> tracks); void fail(String msg); }

    private static final String BASE = HttpClient.HOST_EXTRA_API;

    private static String filters() {
        return "\"ignore_duplicate\":false,\"opening_filter\":true,\"ending_filter\":true,\"insert_filter\":true";
    }

    public static void search(String query, Cb cb) {
        String body = "{\"anime_search_filter\":{\"search\":\"" + esc(query) + "\",\"partial_match\":true},"
                + "\"song_name_search_filter\":{\"search\":\"" + esc(query) + "\",\"partial_match\":true},"
                + "\"artist_search_filter\":{\"search\":\"" + esc(query) + "\",\"partial_match\":true,\"group_granularity\":0,\"max_other_artist\":99},"
                + "\"and_logic\":false," + filters() + "}";
        HttpClient.get().post(BASE + "search_request", body, mapper(cb));
    }

    /** Все песни аниме: сначала по MAL-id, затем фолбэк по точному названию. */
    public static void forAnime(Integer malId, List<String> names, Cb cb) {
        if (malId != null) {
            String body = "{\"malIds\":[" + malId + "]," + filters() + "}";
            HttpClient.get().post(BASE + "malIDs_request", body, mapper(new Cb() {
                @Override public void ok(List<Track> tracks) {
                    if (!tracks.isEmpty()) cb.ok(tracks);
                    else byName(names, cb);
                }
                @Override public void fail(String m) { byName(names, cb); }
            }));
        } else byName(names, cb);
    }

    private static void byName(List<String> names, Cb cb) {
        List<String> list = new ArrayList<>(names);
        if (list.isEmpty()) { cb.ok(new ArrayList<>()); return; }
        String name = list.get(0);
        String body = "{\"anime_search_filter\":{\"search\":\"" + esc(name) + "\",\"partial_match\":false},\"and_logic\":false," + filters() + "}";
        HttpClient.get().post(BASE + "search_request", body, mapper(cb));
    }

    public static void random(Cb cb) {
        HttpClient.get().post(BASE + "get_50_random_songs", "{}", mapper(cb));
    }

    private static HttpClient.Json mapper(final Cb cb) {
        return new HttpClient.Json() {
            @Override public void ok(String body) {
                List<Track> out = new ArrayList<>();
                Set<Long> seen = new LinkedHashSet<>();
                JsonElement root = com.google.gson.JsonParser.parseString(body);
                if (!root.isJsonArray()) { cb.ok(out); return; }
                for (JsonElement e : root.getAsJsonArray()) {
                    JsonObject s = e.getAsJsonObject();
                    Track t = toTrack(s);
                    if (t == null) continue;
                    if (seen.add(t.anime.id)) {} // annId уникален по аниме, треки различаем по annSongId
                    long key = Math.abs(t.themeId);
                    if (seen.contains(key)) continue;
                    seen.add(key);
                    out.add(t);
                    if (out.size() >= 80) break;
                }
                cb.ok(out);
            }
            @Override public void fail(String m) { cb.fail(m); }
        };
    }

    private static Track toTrack(JsonObject s) {
        String audio = Api.str(s, "audio");
        String hq = Api.str(s, "HQ");
        String mq = Api.str(s, "MQ");
        String video = hq != null ? hq : mq;
        if (audio == null && video == null) return null;

        long annSongId = Api.num(s, "annSongId");
        String songType = Api.str(s, "songType") == null ? "" : Api.str(s, "songType");
        String lower = songType.toLowerCase(Locale.US);
        String type = lower.startsWith("opening") ? "OP" : lower.startsWith("ending") ? "ED" : "IN";
        String numPart = lower.replaceAll("[^0-9]", "");
        String slug = type + (numPart.isEmpty() ? "" : numPart);

        Track t = new Track();
        t.id = "extra:" + annSongId;
        t.themeId = -annSongId;
        t.themeSlug = slug;
        t.type = type;
        t.sequence = numPart.isEmpty() ? null : Integer.parseInt(numPart);
        t.title = Api.str(s, "songName");
        t.audioUrl = audio != null ? HttpClient.HOST_EXTRA_MEDIA + audio : HttpClient.HOST_EXTRA_MEDIA + video;
        t.videoUrl = video != null ? HttpClient.HOST_EXTRA_MEDIA + video : t.audioUrl;
        t.resolution = hq != null ? 720 : 480;
        t.source = "extra";

        t.anime.id = -Api.num(s, "annId");
        t.anime.name = Api.str(s, "animeJPName") != null ? Api.str(s, "animeJPName") : Api.str(s, "animeENName");
        Integer mal = firstId(s, HttpClient.rev("tsileminaym"));
        Integer al = firstId(s, HttpClient.rev("tsilina"));
        t.anime.malId = mal;
        t.anime.anilistId = al;
        t.anime.slug = mal != null ? ("mal-" + mal) : ("ann-" + Math.abs(t.anime.id));
        String vintage = Api.str(s, "animeVintage");
        if (vintage != null && vintage.contains(" ")) {
            String[] parts = vintage.split(" ");
            try { t.anime.year = Integer.parseInt(parts[parts.length - 1]); } catch (Exception ignored) { }
            t.anime.season = parts[0];
        }
        String artist = Api.str(s, "songArtist");
        if (artist != null) t.artists.add(new Track.Artist(0, artist, ""));
        return t;
    }

    private static Integer firstId(JsonObject s, String key) {
        try {
            JsonObject linked = s.getAsJsonObject("linked_ids");
            if (linked == null || !linked.has(key)) return null;
            JsonElement v = linked.get(key);
            if (v.isJsonArray() && v.getAsJsonArray().size() > 0) return v.getAsJsonArray().get(0).getAsInt();
            if (v.isJsonPrimitive()) return v.getAsInt();
        } catch (Exception ignored) { }
        return null;
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
