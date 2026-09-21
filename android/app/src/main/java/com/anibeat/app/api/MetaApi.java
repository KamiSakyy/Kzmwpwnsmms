package com.anibeat.app.api;

import androidx.annotation.Nullable;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

/**
 * Метаданные по MyAnimeList id (== Shikimori id): RU-названия, HD-постер, рейтинг, жанры.
 *
 *  • RU-источник: зеркала переехали (one/io заблокированы, с февраля 2026 актуально .tv).
 *    На старте гоняем HEAD/GET по всем зеркалам, побеждает первое ответившее → кэш 12 ч.
 *  • HD-постеры и баннеры: GraphQL-эндпоинт AniList (extraLarge).
 *  • Оба провайдера опциональны: любая ошибка НИКОГДА не ломает основной каталог.
 */
public final class MetaApi {

    public static class Meta {
        public int malId;
        public String ru;
        public String name;
        public String poster;       // extraLarge
        public String banner;
        public String genres;       // "action|romance"
        public Double score;
        public String kind;
        public Integer episodes;
    }

    public interface BatchCb { void ok(Map<Integer, Meta> byMal); }

    private static final Map<Integer, Meta> CACHE = new HashMap<>();
    private static volatile String mirror = null;
    private static long mirrorTs = 0L;
    private static final long MIRROR_TTL = 12L * 3600_000L;

    /** Активное зеркало метаданных (или null, если ни одно не ответило). */
    @Nullable public static String mirror() {
        if (mirror != null && System.currentTimeMillis() - mirrorTs < MIRROR_TTL) return mirror;
        final CountDownLatch latch = new CountDownLatch(1);
        for (final String host : HttpClient.HOST_META_MIRRORS) {
            HttpClient.get().workers().execute(() -> {
                if (mirror != null && System.currentTimeMillis() - mirrorTs < MIRROR_TTL) { latch.countDown(); return; }
                HttpClient.get().get(host + "/api/animes?limit=1", new HttpClient.Json() {
                    @Override public void ok(String body) {
                        if (mirror == null) { mirror = host; mirrorTs = System.currentTimeMillis(); }
                        latch.countDown();
                    }
                    @Override public void fail(String m) { latch.countDown(); }
                });
            });
        }
        try { latch.await(); } catch (InterruptedException ignored) { }
        return mirror;
    }

    /** Батч: RU-название + жанры (зеркало) и HD-постер (GraphQL). */
    public static void load(List<Integer> malIds, BatchCb cb) {
        final List<Integer> ids = new ArrayList<>();
        for (Integer id : malIds) if (id != null && id > 0 && !ids.contains(id)) ids.add(id);
        if (ids.isEmpty()) { cb.ok(Collections.emptyMap()); return; }

        final Map<Integer, Meta> out = new LinkedHashMap<>();
        for (Integer id : ids) if (CACHE.containsKey(id)) out.put(id, CACHE.get(id));
        final List<Integer> stale = new ArrayList<>();
        for (Integer id : ids) if (!CACHE.containsKey(id)) stale.add(id);
        if (stale.isEmpty()) { cb.ok(out); return; }

        final CountDownLatch latch = new CountDownLatch(2);
        String host = mirror();
        if (host != null) {
            StringBuilder chunk = new StringBuilder();
            for (int i = 0; i < stale.size(); i += 50) {
                if (i > 0) chunk.append(',');
                chunk.append(stale.get(i));
            }
            HttpClient.get().get(host + "/api/animes?ids=" + chunk + "&limit=50", new HttpClient.Json() {
                @Override public void ok(String body) {
                    JsonArray arr = Api.arr(Api.obj(body), "id"); // fallback ниже
                    JsonElement root = com.google.gson.JsonParser.parseString(body);
                    if (root.isJsonArray()) {
                        for (JsonElement e : root.getAsJsonArray()) {
                            JsonObject a = e.getAsJsonObject();
                            Meta m = new Meta();
                            m.malId = (int) Api.num(a, "id");
                            m.ru = Api.str(a, "russian");
                            m.name = Api.str(a, "name");
                            m.poster = imageUrl(host, a, "original");
                            m.score = score(a);
                            m.kind = Api.str(a, "kind");
                            m.episodes = Api.inum(a, "episodes");
                            m.genres = genres(a);
                            CACHE.put(m.malId, m);
                            out.put(m.malId, m);
                        }
                    }
                    latch.countDown();
                }
                @Override public void fail(String msg) { latch.countDown(); }
            });
        } else {
            latch.countDown();
        }

        // AniList: HD-постер + баннер + средний балл
        final StringBuilder varIds = new StringBuilder();
        for (int i = 0; i < stale.size() && i < 50; i++) {
            if (i > 0) varIds.append(',');
            varIds.append(stale.get(i));
        }
        String query = "{\"query\":\"query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){id idMal coverImage{extraLarge color} bannerImage averageScore genres}}}\",\"variables\":{\"ids\":[" + varIds + "]}}";
        HttpClient.get().post(HttpClient.HOST_META_GRAPHQL + "graphql", query, new HttpClient.Json() {
            @Override public void ok(String body) {
                try {
                    JsonObject data = Api.obj(body).getAsJsonObject("data").getAsJsonObject("Page");
                    for (JsonElement e : Api.arr(data, "media")) {
                        JsonObject md = e.getAsJsonObject();
                        Integer mal = Api.inum(md, "idMal");
                        if (mal == null) continue;
                        Meta m = out.get(mal);
                        if (m == null) { m = new Meta(); m.malId = mal; }
                        JsonObject ci = md.getAsJsonObject("coverImage");
                        if (ci != null && ci.has("extraLarge") && !ci.get("extraLarge").isJsonNull()) m.poster = ci.get("extraLarge").getAsString();
                        if (md.has("bannerImage") && !md.get("bannerImage").isJsonNull()) m.banner = md.get("bannerImage").getAsString();
                        if (m.score == null && md.has("averageScore") && !md.get("averageScore").isJsonNull()) m.score = md.get("averageScore").getAsDouble() / 10.0;
                        if (m.genres == null) m.genres = genres(md);
                        CACHE.put(mal, m);
                        out.put(mal, m);
                    }
                } catch (Exception ignored) { }
                latch.countDown();
            }
            @Override public void fail(String msg) { latch.countDown(); }
        });

        HttpClient.get().workers().execute(() -> {
            try { latch.await(); } catch (InterruptedException ignored) { }
            cb.ok(out);
        });
    }

    @Nullable public static Meta cached(Integer malId) { return malId == null ? null : CACHE.get(malId); }

    private static Double score(JsonObject a) {
        String s = Api.str(a, "score");
        if (s == null) return null;
        try { return Double.parseDouble(s); } catch (Exception e) { return null; }
    }

    private static String genres(JsonObject a) {
        StringBuilder sb = new StringBuilder();
        for (JsonElement e : Api.arr(a, "genres")) {
            JsonElement g = e.isJsonObject() ? e.getAsJsonObject().get("russian") : e;
            if (g == null || g.isJsonNull()) continue;
            String v = g.getAsString().toLowerCase();
            if (sb.length() > 0) sb.append('|');
            sb.append(v);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    private static String imageUrl(String host, JsonObject a, String facet) {
        JsonObject img = a.has("image") && a.get("image").isJsonObject() ? a.getAsJsonObject("image") : null;
        if (img == null) return null;
        JsonElement path = img.get(facet);
        if (path == null || path.isJsonNull()) return null;
        String p = path.getAsString();
        if (p.contains("missing_")) return null;
        return p.startsWith("http") ? p : host + p;
    }
}
