package com.anibeat.app.model;

import androidx.annotation.Nullable;

/** Карточка аниме для сеток и каруселей. */
public class AnimeSummary {
    public long id;
    public String name = "";
    public String slug = "";
    public Integer year;
    public String season;
    public Integer malId;
    public Integer anilistId;
    public String cover;
    public String coverSmall;
    public String mediaFormat;
    @Nullable public String synopsis;

    /** Заполняется из MetaApi (RU-название, HD-постер, рейтинг). */
    @Nullable public String ruTitle;
    @Nullable public String hdPoster;
    @Nullable public Double score;
    @Nullable public java.util.List<String> genres;

    public String displayTitle() {
        return ruTitle != null && !ruTitle.isEmpty() ? ruTitle : name;
    }
}
