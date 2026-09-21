package com.anibeat.app.model;

/** Мини-ссылка на аниме внутри трека. */
public class AnimeRef {
    public long id;
    public String name = "";
    public String slug = "";
    public Integer year;
    public String season;
    public Integer malId;      // MyAnimeList == Shikimori id
    public Integer anilistId;
}
