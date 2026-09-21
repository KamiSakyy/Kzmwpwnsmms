package com.anibeat.app.model;

import androidx.annotation.Nullable;

import java.util.ArrayList;
import java.util.List;

/** Один воспроизводимый трек: тема (OP/ED/IN) + лучший доступный видео/аудио файл. */
public class Track {
    public String id;              // themeId:entryId:videoId  (или extra:id)
    public long themeId;
    public String themeSlug;       // OP1 / ED2 / IN
    public String type;            // OP / ED / IN
    public Integer sequence;
    public String title;
    public List<Artist> artists = new ArrayList<>();
    public AnimeRef anime = new AnimeRef();
    public String cover;
    public String coverSmall;
    public String audioUrl;
    public String videoUrl;
    public Integer resolution;
    public Integer version;
    public String episodes;
    public boolean nsfw;
    public boolean spoiler;
    @Nullable public String createdAt;   // ISO-строка: когда тема добавлена в базу
    public String source = "primary";    // primary | extra

    public boolean hasVideo() {
        return videoUrl != null && !videoUrl.equals(audioUrl);
    }

    public String playbackUrl(boolean videoMode) {
        return videoMode && hasVideo() ? videoUrl : audioUrl;
    }

    public static class Artist {
        public long id;
        public String name;
        public String slug;
        public Artist(long id, String name, String slug) { this.id = id; this.name = name; this.slug = slug; }
    }

    public String artistsLine() {
        if (artists.isEmpty()) return "Неизвестный исполнитель";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < artists.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(artists.get(i).name);
        }
        return sb.toString();
    }
}
