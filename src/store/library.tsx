import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Playlist, Track } from "@/types";
import { useLocalStorage } from "@/lib/hooks";
import { uid } from "@/lib/utils";

interface LibraryCtx {
  favorites: Track[];
  favoriteIds: Set<string>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (t: Track) => boolean; // returns new state
  history: Track[];
  addToHistory: (t: Track) => void;
  clearHistory: () => void;
  playlists: Playlist[];
  createPlaylist: (name: string, tracks?: Track[]) => Playlist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, t: Track) => boolean; // false if already there
  removeFromPlaylist: (id: string, trackId: string) => void;
  recentSearches: string[];
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
}

const Ctx = createContext<LibraryCtx | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useLocalStorage<Track[]>("anibeat:favorites", []);
  const [history, setHistory] = useLocalStorage<Track[]>("anibeat:history", []);
  const [playlists, setPlaylists] = useLocalStorage<Playlist[]>("anibeat:playlists", []);
  const [recentSearches, setRecentSearches] = useLocalStorage<string[]>("anibeat:searches", []);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const isFavorite = useCallback((id: string) => favoriteIds.has(id), [favoriteIds]);

  const toggleFavorite = useCallback(
    (t: Track) => {
      const exists = favoriteIds.has(t.id);
      setFavorites((prev) => (exists ? prev.filter((x) => x.id !== t.id) : [t, ...prev]));
      return !exists;
    },
    [favoriteIds, setFavorites],
  );

  const addToHistory = useCallback(
    (t: Track) => {
      setHistory((prev) => [t, ...prev.filter((x) => x.id !== t.id)].slice(0, 60));
    },
    [setHistory],
  );
  const clearHistory = useCallback(() => setHistory([]), [setHistory]);

  const createPlaylist = useCallback(
    (name: string, tracks: Track[] = []) => {
      const p: Playlist = { id: uid(), name: name.trim() || "Новый плейлист", createdAt: Date.now(), tracks };
      setPlaylists((prev) => [p, ...prev]);
      return p;
    },
    [setPlaylists],
  );
  const renamePlaylist = useCallback(
    (id: string, name: string) => setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))),
    [setPlaylists],
  );
  const deletePlaylist = useCallback((id: string) => setPlaylists((prev) => prev.filter((p) => p.id !== id)), [setPlaylists]);
  const addToPlaylist = useCallback(
    (id: string, t: Track) => {
      let added = false;
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          if (p.tracks.some((x) => x.id === t.id)) return p;
          added = true;
          return { ...p, tracks: [...p.tracks, t] };
        }),
      );
      return added;
    },
    [setPlaylists],
  );
  const removeFromPlaylist = useCallback(
    (id: string, trackId: string) => setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((x) => x.id !== trackId) } : p))),
    [setPlaylists],
  );

  const addRecentSearch = useCallback(
    (q: string) => {
      const s = q.trim();
      if (!s) return;
      setRecentSearches((prev) => [s, ...prev.filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 10));
    },
    [setRecentSearches],
  );
  const clearRecentSearches = useCallback(() => setRecentSearches([]), [setRecentSearches]);

  const value = useMemo<LibraryCtx>(
    () => ({
      favorites, favoriteIds, isFavorite, toggleFavorite,
      history, addToHistory, clearHistory,
      playlists, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
      recentSearches, addRecentSearch, clearRecentSearches,
    }),
    [favorites, favoriteIds, isFavorite, toggleFavorite, history, addToHistory, clearHistory, playlists, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, recentSearches, addRecentSearch, clearRecentSearches],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLibrary outside LibraryProvider");
  return v;
}
