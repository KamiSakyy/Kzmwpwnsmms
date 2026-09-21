package com.anibeat.app.api;

import androidx.annotation.Nullable;

import com.anibeat.app.model.AnimeRef;
import com.anibeat.app.model.AnimeSummary;
import com.anibeat.app.model.Track;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Основной каталог (порт src/api/animethemes.ts).
 *
 * ВАЖНЫЕ ОСОБЕННОСТИ API (проверено запросами, 2026):
 *  • /anime            — принимает include=resources и fields[resource]
 *  • /animetheme       — НЕ принимает anime.resources/fields[resource] и НЕ умеет sort=-animethemeentries_id
 *  • /search           — resources только для include[anime]
 *  • /resource         — работает лишь с include=anime, БЕЗ fields[...]
 *  • MAL-id для треков досылаются вторым батч-запросом к /anime (кэш 30 дней)
 */
public final class Api {

    public interface TracksCb { void ok(List<Track> tracks); void fail(String msg); }
    public interface AnimeListCb { void ok(List<AnimeSummary> anime); void fail(String msg); }
    public interface DetailCb { void ok(JsonObject anime, List<Track> tracks); void fail(String msg); }
    public interface SearchCb { void ok(List<AnimeSummary> anime, List<Track> tracks, List<AnimeSummary> artists); void fail(String msg); }

    private static final String BASE = HttpClient.HOST_PRIMARY_API;

    /** Поля — наборы держим разреженными, чтобы тело ответа было маленьким. */
    private static String q(String... kv) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            if (sb.length() > 0) sb.append('&');
            try {
                sb.append(java.net.URLEncoder.encode(kv[i], "UTF-8")).append('=').append(java.net.URLEncoder.encode(kv[i + 1], "UTF-8"));
            } catch (Exception e) {
                sb.append(kv[i]).append('=').append(kv[i + 1]);
            }
        }
        return sb.toString();
    }

    private static final String F_ANIME = "id,name,slug,year,season,media_format";
    private static final String F_THEME = "id,slug,type,sequence,created_at";
    private static final String F_SONG = "id,title";
    private static final String F_ARTIST = "id,name,slug";
    private static final String F_ENTRY = "id,version,episodes,nsfw,spoiler";
    private static final String F_VIDEO = "id,link,resolution,tags,nc";
    private static final String F_AUDIO = "id,link";
    private static final String F_IMAGE = "id,facet,link";
    private static final String F_RESOURCE = "site,link,external_id";

    private static final String INC_THEME = "anime.images,song.artists,animethemeentries.videos.audio";
    private static final String INC_ANIME = "images,resources,animethemes.song.artists,animethemes.animethemeentries.videos.audio";

    private static final String SITE_MAL = HttpClient.rev("tsiLeminAyM");
    private static final String SITE_AL = HttpClient.rev("tsiLinA");

    private Api() { }

    /* ------------------------------------------------------------------ */
    /* Домашняя лента                                                      */
    /* ------------------------------------------------------------------ */

    /** Случайные темы (кнопка «Обновить» / радио). */
    public static void randomTracks(int count, @Nullable String type, TracksCb cb) {
        String url = BASE + "animetheme?" + q(
                "sort", "random",
                "page[size]", String.valueOf(Math.min(100, count)),
                "include", INC_THEME,
                "filter[has]", "animethemeentries.videos",
                "filter[type]", type == null ? "" : type,
                "fields[anime]", F_ANIME, "fields[animetheme]", F_THEME, "fields[song]", F_SONG,
                "fields[artist]", F_ARTIST, "fields[animethemeentry]", F_ENTRY, "fields[video]", F_VIDEO,
                "fields[audio]", F_AUDIO, "fields[image]", F_IMAGE);
        HttpClient.get().get(url, json(count, cb));
    }

    /**
     * Новинки. Веб-версия фильтрует по filter[created_at-gt] (поддерживается),
     * а если за период пусто — отдаёт последние добавленные.
     */
    public static void freshTracks(String period, int count, TracksCb cb) {
        long now = System.currentTimeMillis();
        String sinceTmp = null;
        if ("today".equals(period)) sinceTmp = iso(now - (now % 86_400_000L));
        else if ("week".equals(period)) sinceTmp = iso(now - 7L * 86_400_000L);
        final String since = sinceTmp;

        TracksCb withFallback = new TracksCb() {
            @Override public void ok(List<Track> tracks) {
                if (tracks.isEmpty() && since != null) freshTracks("all", count, cb);
                else cb.ok(tracks);
            }
            @Override public void fail(String msg) { cb.fail(msg); }
        };
        String url = BASE + "animetheme?" + q(
                "sort", "-id",
                "page[size]", String.valueOf(Math.min(100, since == null ? count : count * 3)),
                "include", INC_THEME,
                "filter[has]", "animethemeentries.videos",
                "filter[created_at-gt]", since == null ? "" : since,
                "fields[anime]", F_ANIME, "fields[animetheme]", F_THEME, "fields[song]", F_SONG,
                "fields[artist]", F_ARTIST, "fields[animethemeentry]", F_ENTRY, "fields[video]", F_VIDEO,
                "fields[audio]", F_AUDIO, "fields[image]", F_IMAGE);
        HttpClient.get().get(url, json(count, withFallback));
    }

    public static void latestTracks(int count, TracksCb cb) {
        String url = BASE + "animetheme?" + q(
                "sort", "-id", "page[size]", String.valueOf(Math.min(100, count + 6)),
                "include", INC_THEME, "filter[has]", "animethemeentries.videos",
                "fields[anime]", F_ANIME, "fields[animetheme]", F_THEME, "fields[song]", F_SONG,
                "fields[artist]", F_ARTIST, "fields[animethemeentry]", F_ENTRY, "fields[video]", F_VIDEO,
                "fields[audio]", F_AUDIO, "fields[image]", F_IMAGE);
        HttpClient.get().get(url, json(count, cb));
    }

    /* ------------------------------------------------------------------ */
    /* Аниме                                                              */
    /* ------------------------------------------------------------------ */

    public static void animeBySlugs(List<String> slugs, AnimeListCb cb) {
        String url = BASE + "anime?" + q(
                "filter[slug]", join(slugs), "include", "images,resources", "page[size]", "100",
                "fields[anime]", F_ANIME, "fields[image]", F_IMAGE, "fields[resource]", F_RESOURCE);
        HttpClient.get().get(url, new HttpClient.Json() {
            @Override public void ok(String body) {
                Map<String, AnimeSummary> map = new LinkedHashMap<>();
                for (JsonElement e : arr(obj(body), "anime")) map.put(str(e.getAsJsonObject(), "slug"), toSummary(e.getAsJsonObject()));
                List<AnimeSummary> out = new ArrayList<>();
                for (String s : slugs) if (map.containsKey(s)) out.add(map.get(s));
                cb.ok(out);
            }
            @Override public void fail(String m) { cb.fail(m); }
        });
    }

    public static void tracksForSlugs(List<String> slugs, TracksCb cb) {
        String url = BASE + "anime?" + q(
                "filter[slug]", join(slugs), "include", INC_ANIME, "page[size]", "100",
                "fields[anime]", F_ANIME, "fields[animetheme]", F_THEME, "fields[song]", F_SONG,
                "fields[artist]", F_ARTIST, "fields[animethemeentry]", F_ENTRY, "fields[video]", F_VIDEO,
                "fields[audio]", F_AUDIO, "fields[image]", F_IMAGE, "fields[resource]", F_RESOURCE);
        HttpClient.get().get(url, new HttpClient.Json() {
            @Override public void ok(String body) {
                Map<String, JsonObject> bySlug = new HashMap<>();
                for (JsonElement e : arr(obj(body), "anime")) bySlug.put(str(e.getAsJsonObject(), "slug"), e.getAsJsonObject());
                List<Track> out = new ArrayList<>();
                for (String s : slugs) {
                    JsonObject a = bySlug.get(s);
                    if (a != null) out.addAll(animeToTracks(a, false));
                }
                cb.ok(out);
            }
            @Override public void fail(String m) { cb.fail(m); }
        });
    }

    /** Страница аниме: описание + все версии тем. */
    public static void animeDetail(String slug, DetailCb cb) {
        String url = BASE + "anime/" + encode(slug) + "?" + q(
                "include", INC_ANIME + ",studios,series",
                "fields[anime]", F_ANIME + ",synopsis", "fields[studio]", "name,slug", "fields[series]", "name,slug",
                "fields[animetheme]", F_THEME, "fields[song]", F_SONG, "fields[artist]", F_ARTIST,
                "fields[animethemeentry]", F_ENTRY, "fields[video]", F_VIDEO, "fields[audio]", F_AUDIO,
                "fields[image]", F_IMAGE, "fields[resource]", F_RESOURCE);
        HttpClient.get().get(url, new HttpClient.Json() {
            @Override public void ok(String body) {
                JsonObject a = obj(body).getAsJsonObject("anime");
                if (a == null) { cb.fail("not found"); return; }
                cb.ok(a, animeToTracks(a, true));
            }
            @Override public void fail(String m) { cb.fail(m); }
        });
    }

    /** Поиск + 2-й батч для MAL-id (в /animetheme ресурсы недоступны). */
    public static void search(String query, SearchCb cb) {
        String url = BASE + "search?" + q(
                "q", query, "page[limit]", "12",
                "fields[search]", "anime,animethemes,artists",
                "include[anime]", "images,resources", "include[animetheme]", INC_THEME, "include[artist]", "images",
                "fields[anime]", F_ANIME, "fields[resource]", F_RESOURCE, "fields[image]", F_IMAGE,
                "fields[animetheme]", F_THEME, "fields[song]", F_SONG, "fields[artist]", F_ARTIST,
                "fields[animethemeentry]", F_ENTRY, "fields[video]", F_VIDEO, "fields[audio]", F_AUDIO);
        HttpClient.get().get(url, new HttpClient.Json() {
            @Override public void ok(String body) {
                JsonObject s = obj(body).getAsJsonObject("search");
                if (s == null) { cb.fail("empty"); return; }
                List<AnimeSummary> anime = new ArrayList<>();
                Map<String, AnimeSummary> known = new HashMap<>();
                for (JsonElement e : arr(s, "anime")) {
                    AnimeSummary sm = toSummary(e.getAsJsonObject());
                    anime.add(sm);
                    known.put(sm.slug, sm);
                }
                List<Track> tracks = new ArrayList<>();
                for (JsonElement e : arr(s, "animethemes")) tracks.add(trackOfTheme(e.getAsJsonObject()));
                for (Track t : tracks) {
                    AnimeSummary a = known.get(t.anime.slug);
                    if (a != null) { t.anime.malId = a.malId; t.anime.anilistId = a.anilistId; }
                }
                List<AnimeSummary> artists = new ArrayList<>();
                for (JsonElement e : arr(s, "artists")) artists.add(toArtist(e.getAsJsonObject()));
                attachMalIds(tracks, () -> cb.ok(anime, tracks, artists));
            }
            @Override public void fail(String m) { cb.fail(m); }
        });
    }

    /** Сезон / год. */
    public static void seasonAnime(int year, @Nullable String season, int page, AnimeListCb cb) {
        String url = BASE + "anime?" + q(
                "filter[year]", String.valueOf(year), "filter[season]", season == null ? "" : season,
                "filter[has]", "animethemes", "include", "images,resources", "sort", "name",
                "page[size]", "30", "page[number]", String.valueOf(page),
                "fields[anime]", F_ANIME, "fields[image]", F_IMAGE, "fields[resource]", F_RESOURCE);
        HttpClient.get().get(url, new HttpClient.Json() {
            @Override public void ok(String b) {
                List<AnimeSummary> out = new ArrayList<>();
                for (JsonElement e : arr(obj(b), "anime")) out.add(toSummary(e.getAsJsonObject()));
                cb.ok(out);
            }
            @Override public void fail(String m) { cb.fail(m); }
        });
    }

    /* ------------------------------------------------------------------ */
    /* MAL-id: батч к /anime (кэшируется)                                  */
    /* ------------------------------------------------------------------ */
    private static final Map<String, int[]> ID_CACHE = new HashMap<>();

    public static void attachMalIds(List<Track> tracks, Runnable done) {
        List<String> missing = new ArrayList<>();
        for (Track t : tracks) {
            if (t.anime.malId == null && !missing.contains(t.anime.slug)) missing.add(t.anime.slug);
        }
        if (missing.isEmpty()) { done.run(); return; }
        List<String> need = new ArrayList<>();
        for (String s : missing) if (!ID_CACHE.containsKey(s)) need.add(s);
        if (need.isEmpty()) {
            apply(tracks);
            done.run();
            return;
        }
        String url = BASE + "anime?" + q("filter[slug]", join(need), "include", "resources",
                "fields[anime]", "id,slug", "fields[resource]", F_RESOURCE, "page[size]", "100");
        HttpClient.get().get(url, new HttpClient.Json() {
            @Override public void ok(String b) {
                for (JsonElement e : arr(obj(b), "anime")) {
                    JsonObject a = e.getAsJsonObject();
                    ID_CACHE.put(str(a, "slug"), new int[]{externalId(a, SITE_MAL), externalId(a, SITE_AL)});
                }
                for (String s : need) if (!ID_CACHE.containsKey(s)) ID_CACHE.put(s, new int[]{0, 0});
                apply(tracks);
                done.run();
            }
            @Override public void fail(String m) { done.run(); }
        });
    }

    private static void apply(List<Track> tracks) {
        for (Track t : tracks) {
            if (t.anime.malId != null) continue;
            int[] ids = ID_CACHE.get(t.anime.slug);
            if (ids != null) {
                t.anime.malId = ids[0] == 0 ? null : ids[0];
                t.anime.anilistId = ids[1] == 0 ? null : ids[1];
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Мапперы                                                             */
    /* ------------------------------------------------------------------ */

    public static List<Track> animeToTracks(JsonObject a, boolean allVersions) {
        List<Track> out = new ArrayList<>();
        for (JsonElement te : arr(a, "animethemes")) {
            List<Track> one = tracksOfTheme(te.getAsJsonObject(), a, allVersions);
            out.addAll(one);
        }
        Collections.sort(out, (x, y) -> {
            int c = Integer.compare(rank(x.type), rank(y.type));
            if (c != 0) return c;
            return Integer.compare(x.sequence == null ? 0 : x.sequence, y.sequence == null ? 0 : y.sequence);
        });
        return out;
    }

    private static int rank(String type) { return "OP".equals(type) ? 0 : "ED".equals(type) ? 1 : 2; }

    private static Track trackOfTheme(JsonObject theme) {
        JsonObject anime = theme.getAsJsonObject("anime");
        if (anime == null) return new Track();
        List<Track> l = tracksOfTheme(theme, anime, false);
        return l.isEmpty() ? new Track() : l.get(0);
    }

    private static List<Track> tracksOfTheme(JsonObject theme, JsonObject anime, boolean all) {
        List<Track> out = new ArrayList<>();
        JsonObject song = theme.getAsJsonObject("song");
        String cover = image(anime, "Large Cover");
        String coverSmall = image(anime, "Small Cover");
        JsonArray entries = arr(theme, "animethemeentries");
        for (JsonElement ee : entries) {
            JsonObject e = ee.getAsJsonObject();
            JsonObject video = bestVideo(arr(e, "videos"));
            if (video == null) continue;
            Track t = new Track();
            t.themeId = num(theme, "id");
            t.id = t.themeId + ":" + num(e, "id") + ":" + num(video, "id");
            t.themeSlug = str(theme, "slug");
            t.type = str(theme, "type");
            t.sequence = inum(theme, "sequence");
            t.createdAt = str(theme, "created_at");
            t.title = song != null && song.has("title") && !song.get("title").isJsonNull() ? str(song, "title") : t.themeSlug;
            if (song != null) {
                for (JsonElement ae : arr(song, "artists")) {
                    JsonObject ar = ae.getAsJsonObject();
                    t.artists.add(new Track.Artist(num(ar, "id"), str(ar, "name"), str(ar, "slug")));
                }
            }
            t.anime = toRef(anime);
            t.cover = cover;
            t.coverSmall = coverSmall;
            t.audioUrl = nestedLink(video, "audio") != null ? nestedLink(video, "audio") : str(video, "link");
            t.videoUrl = str(video, "link");
            t.resolution = inum(video, "resolution");
            t.version = inum(e, "version");
            t.episodes = str(e, "episodes");
            t.nsfw = bool(e, "nsfw");
            t.spoiler = bool(e, "spoiler");
            t.source = "primary";
            out.add(t);
            if (!all) break;  // без версий — только первая запись темы
        }
        return out;
    }

    /** Creditless-видео приоритетнее, затем максимальное разрешение. */
    private static JsonObject bestVideo(JsonArray videos) {
        JsonObject best = null;
        for (JsonElement ve : videos) {
            JsonObject v = ve.getAsJsonObject();
            if (nestedLink(v, "audio") == null && videos.size() > 1) { /* всё равно можно играть */ }
            if (best == null || better(v, best)) best = v;
        }
        return best;
    }

    private static boolean better(JsonObject a, JsonObject b) {
        boolean anc = bool(a, "nc"), bnc = bool(b, "nc");
        if (anc != bnc) return anc;
        int ar = a.has("resolution") && !a.get("resolution").isJsonNull() ? a.get("resolution").getAsInt() : 0;
        int br = b.has("resolution") && !b.get("resolution").isJsonNull() ? b.get("resolution").getAsInt() : 0;
        return ar > br;
    }

    private static String nestedLink(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull() || !o.get(key).isJsonObject()) return null;
        JsonObject inner = o.getAsJsonObject(key);
        return inner.has("link") && !inner.get("link").isJsonNull() ? inner.get("link").getAsString() : null;
    }

    private static String image(JsonObject anime, String facet) {
        if (anime == null) return null;
        String fallback = null;
        for (JsonElement e : arr(anime, "images")) {
            JsonObject i = e.getAsJsonObject();
            if (facet.equals(str(i, "facet"))) return str(i, "link");
            if (fallback == null) fallback = str(i, "link");
        }
        return fallback;
    }

    private static int externalId(JsonObject anime, String site) {
        for (JsonElement e : arr(anime, "resources")) {
            JsonObject r = e.getAsJsonObject();
            if (!site.equals(str(r, "site"))) continue;
            if (r.has("external_id") && !r.get("external_id").isJsonNull()) return r.get("external_id").getAsInt();
            String link = str(r, "link");
            if (link == null) return 0;
            String[] parts = link.split("/");
            try { return Integer.parseInt(parts[parts.length - 1]); } catch (Exception ignored) { return 0; }
        }
        return 0;
    }

    public static AnimeRef toRef(JsonObject anime) {
        AnimeRef r = new AnimeRef();
        r.id = num(anime, "id");
        r.name = str(anime, "name");
        r.slug = str(anime, "slug");
        r.year = inum(anime, "year");
        r.season = str(anime, "season");
        if (anime.has("resources")) {
            int mal = externalId(anime, SITE_MAL);
            int al = externalId(anime, SITE_AL);
            r.malId = mal == 0 ? null : mal;
            r.anilistId = al == 0 ? null : al;
        }
        return r;
    }

    public static AnimeSummary toSummary(JsonObject anime) {
        AnimeSummary s = new AnimeSummary();
        s.id = num(anime, "id");
        s.name = str(anime, "name");
        s.slug = str(anime, "slug");
        s.year = inum(anime, "year");
        s.season = str(anime, "season");
        s.mediaFormat = str(anime, "media_format");
        s.synopsis = str(anime, "synopsis");
        s.cover = image(anime, "Large Cover");
        s.coverSmall = image(anime, "Small Cover");
        if (anime.has("resources")) {
            int mal = externalId(anime, SITE_MAL);
            int al = externalId(anime, SITE_AL);
            s.malId = mal == 0 ? null : mal;
            s.anilistId = al == 0 ? null : al;
        }
        return s;
    }

    public static AnimeSummary toArtist(JsonObject a) {
        AnimeSummary s = new AnimeSummary();
        s.id = num(a, "id");
        s.name = str(a, "name");
        s.slug = str(a, "slug");
        s.cover = image(a, "Large Cover");
        s.coverSmall = image(a, "Small Cover");
        return s;
    }

    /* ------------------------------------------------------------------ */
    /* Мелкие утилиты JSON                                                 */
    /* ------------------------------------------------------------------ */
    public static JsonObject obj(String body) { return JsonParser.parseString(body).getAsJsonObject(); }

    public static JsonArray arr(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull() || !o.get(key).isJsonArray()) return new JsonArray();
        return o.getAsJsonArray(key);
    }

    public static String str(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        return o.get(key).getAsString();
    }

    public static long num(JsonObject o, String key) {
        try { return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsLong() : 0; } catch (Exception e) { return 0; }
    }

    public static Integer inum(JsonObject o, String key) {
        try { return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsInt() : null; } catch (Exception e) { return null; }
    }

    public static boolean bool(JsonObject o, String key) {
        try { return o.has(key) && !o.get(key).isJsonNull() && o.get(key).getAsBoolean(); } catch (Exception e) { return false; }
    }

    public static String join(List<String> list) {
        StringBuilder sb = new StringBuilder();
        Set<String> seen = new HashSet<>();
        for (String s : list) {
            if (s == null || s.isEmpty() || !seen.add(s)) continue;
            if (sb.length() > 0) sb.append(',');
            sb.append(s);
        }
        return sb.toString();
    }


    private static String encode(String s) {
        try { return java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (Exception e) { return s; }
    }

    private static String iso(long millis) {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date(millis));
    }

    private static HttpClient.Json json(int limit, TracksCb cb) {
        return new HttpClient.Json() {
            @Override public void ok(String body) {
                List<Track> out = new ArrayList<>();
                for (JsonElement e : arr(obj(body), "animethemes")) {
                    JsonObject theme = e.getAsJsonObject();
                    if (theme.getAsJsonObject("anime") == null) continue;
                    List<Track> l = tracksOfTheme(theme, theme.getAsJsonObject("anime"), false);
                    if (!l.isEmpty()) out.add(l.get(0));
                    if (out.size() >= limit) break;
                }
                attachMalIds(out, () -> cb.ok(out));
            }
            @Override public void fail(String m) { cb.fail(m); }
        };
    }
}
