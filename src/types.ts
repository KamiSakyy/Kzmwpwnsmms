export type ThemeType = "OP" | "ED" | "IN";
export type Season = "Winter" | "Spring" | "Summer" | "Fall";
/** Internal catalog id. `undefined` (legacy persisted tracks) means the primary catalog. */
export type TrackSource = "primary" | "extra";

export interface ArtistRef {
  id: number;
  name: string;
  slug: string;
}

export interface AnimeRef {
  id: number;
  name: string;
  /** animethemes slug, or `mal-{id}` for anime that only exist in other sources */
  slug: string;
  year: number | null;
  season: Season | null;
  /** MyAnimeList id == Shikimori id */
  malId?: number | null;
  anilistId?: number | null;
}

export interface Track {
  /** Unique id: `${themeId}:${entryId}:${videoId}` */
  id: string;
  themeId: number;
  themeSlug: string; // "OP1", "ED2"
  type: ThemeType;
  sequence: number | null;
  title: string;
  artists: ArtistRef[];
  anime: AnimeRef;
  cover: string | null;
  coverSmall: string | null;
  audioUrl: string;
  videoUrl: string;
  resolution: number | null;
  tags: string;
  version: number | null;
  episodes: string | null;
  nsfw: boolean;
  spoiler: boolean;
  source?: TrackSource;
  /** ISO-дата добавления темы в каталог — используется календарём релизов */
  createdAt?: string | null;
}

export interface AnimeSummary extends AnimeRef {
  cover: string | null;
  coverSmall: string | null;
  mediaFormat?: string | null;
  synopsis?: string | null;
}

export interface AnimeDetail extends AnimeSummary {
  synopsis: string | null;
  tracks: Track[]; // all entries (versions included)
  studios: { name: string; slug: string }[];
  series: { name: string; slug: string }[];
  resources: { site: string; link: string }[];
}

export interface ArtistSummary extends ArtistRef {
  image: string | null;
  imageSmall: string | null;
}

export interface ArtistDetail extends ArtistSummary {
  information: string | null;
  tracks: Track[];
}

export interface SearchResults {
  anime: AnimeSummary[];
  tracks: Track[];
  artists: ArtistSummary[];
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  tracks: Track[];
}

export type RepeatMode = "off" | "all" | "one";
