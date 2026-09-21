package com.anibeat.app.util;

import androidx.annotation.Nullable;

import com.anibeat.app.model.Track;
import com.google.gson.Gson;

import java.util.Locale;

/** Общие утилиты: сериализация трека, форматирование, жанры, фильтр 18+. */
public final class Formats {

    private static final Gson GSON = new Gson();

    private Formats() { }

    public static String toJson(Track t) { return GSON.toJson(t); }

    @Nullable public static Track fromJson(String json) {
        try { return GSON.fromJson(json, Track.class); } catch (Exception e) { return null; }
    }

    public static String time(long ms) {
        if (ms < 0) ms = 0;
        long total = ms / 1000;
        return String.format(Locale.US, "%d:%02d", total / 60, total % 60);
    }

    public static String bytes(long n) {
        if (n < 1024) return n + " Б";
        double kb = n / 1024.0;
        if (kb < 1024) return Math.round(kb) + " КБ";
        double mb = kb / 1024.0;
        if (mb < 1024) return String.format(Locale.US, "%.1f МБ", mb);
        return String.format(Locale.US, "%.2f ГБ", mb / 1024.0);
    }

    public static String seasonRu(String season) {
        if (season == null) return "";
        switch (season) {
            case "Winter": return "Зима";
            case "Spring": return "Весна";
            case "Summer": return "Лето";
            case "Fall": return "Осень";
            default: return season;
        }
    }

    public static String kindRu(String kind) {
        if (kind == null) return "";
        switch (kind) {
            case "tv": return "TV-сериал";
            case "movie": return "Фильм";
            case "ova": return "OVA";
            case "ona": return "ONA";
            case "special": return "Спешл";
            case "music": return "Клип";
            default: return kind.toUpperCase(Locale.US);
        }
    }

    /** «18+» — фильтр по флагу nsfw, который приходит из API. */
    public static boolean passesMature(Track t, boolean allowMature) {
        return allowMature || !t.nsfw;
    }

    /** Простой маппинг жанров (RU-строки) в id фильтров. */
    public static boolean matchesGenre(@Nullable String genres, @Nullable String filterId) {
        if (filterId == null || filterId.isEmpty()) return true;
        if (genres == null || genres.isEmpty()) return true; // без метаданных не скрываем
        String g = genres.toLowerCase(Locale.US);
        switch (filterId) {
            case "action": return g.contains("экшен") || g.contains("боевик") || g.contains("action");
            case "fantasy": return g.contains("фэнтези") || g.contains("fantasy") || g.contains("фантастика");
            case "romance": return g.contains("романтика") || g.contains("romance");
            case "comedy": return g.contains("комедия") || g.contains("comedy");
            case "drama": return g.contains("драма") || g.contains("drama");
            case "music": return g.contains("музыка") || g.contains("идол") || g.contains("music");
            case "sports": return g.contains("спорт") || g.contains("sports");
            case "thriller": return g.contains("триллер") || g.contains("ужас") || g.contains("мистика") || g.contains("детектив");
            default: return true;
        }
    }

    /** Как в веб-версии: «сегодня/неделя» считаем по дате создания темы. */
    public static boolean withinPeriod(@Nullable String createdAtIso, String period) {
        if ("all".equals(period) || createdAtIso == null || createdAtIso.isEmpty()) return true;
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            long ts = f.parse(createdAtIso.substring(0, Math.min(19, createdAtIso.length()))).getTime();
            long now = System.currentTimeMillis();
            long window = "today".equals(period) ? 86_400_000L : 7L * 86_400_000L;
            return now - ts <= window;
        } catch (Exception e) {
            return true;
        }
    }
}
