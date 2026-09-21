import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { UIProvider, useUIActions } from "@/store/ui";
import { SettingsProvider } from "@/store/settings";
import { CatalogProvider } from "@/store/general";
import { LibraryProvider } from "@/store/library";
import { DownloadsProvider } from "@/store/downloads";
import { PlayerProvider, usePlayerActions, usePlayerState } from "@/store/player";
import { BottomNav, NavRail } from "@/components/Nav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { NowPlaying } from "@/components/NowPlaying";
import { PlaylistPickerSheet, QueueSheet, SettingsSheet, Toasts, TrackMenuSheet } from "@/components/Sheets";
import { Button, EmptyState } from "@/components/ui";
import { Logo } from "@/components/Icon";
import { cn } from "@/utils/cn";
import HomePage from "@/pages/Home";
import SearchPage from "@/pages/Search";
import BrowsePage, { YearPage } from "@/pages/Browse";
import LibraryPage, { PlaylistPage } from "@/pages/Library";
import AnimePage, { ArtistPage } from "@/pages/Anime";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-bg p-6 text-center">
          <Logo size={56} />
          <h1 className="mt-5 text-xl font-semibold text-on-surface">Что-то сломалось</h1>
          <p className="mt-2 max-w-sm text-sm text-on-surface-variant">{this.state.error.message}</p>
          <Button className="mt-6" icon="refresh" onClick={() => window.location.reload()}>
            Перезагрузить
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Scroll to top + close overlays when the route changes */
function RouteEffects() {
  const { pathname } = useLocation();
  const { closeTrackMenu, closePlaylistPicker } = useUIActions();
  const { setQueueOpen } = usePlayerActions();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    closeTrackMenu();
    closePlaylistPicker();
    setQueueOpen(false);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Shell() {
  const { current } = usePlayerState();
  const hasTrack = !!current;
  return (
    <div className="min-h-dvh bg-bg text-on-surface">
      <NavRail />
      <RouteEffects />
      <main className={cn("min-h-dvh md:pl-[240px]", hasTrack ? "pb-[calc(49px_+_env(safe-area-inset-bottom,0px)_+_76px)] md:pb-24" : "pb-[calc(49px_+_env(safe-area-inset-bottom,0px)_+_16px)] md:pb-8")}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/year/:year" element={<YearPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/playlist/:id" element={<PlaylistPage />} />
            <Route path="/anime/:slug" element={<AnimePage />} />
            <Route path="/artist/:slug" element={<ArtistPage />} />
            <Route path="*" element={<EmptyState icon="explore" title="Страница не найдена" text="Похоже, такой страницы нет." />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <MiniPlayer />
      <BottomNav />
      <NowPlaying />
      <QueueSheet />
      <TrackMenuSheet />
      <PlaylistPickerSheet />
      <SettingsSheet />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <UIProvider>
          <SettingsProvider>
            <CatalogProvider>
              <LibraryProvider>
                <DownloadsProvider>
                  <PlayerProvider>
                    <Shell />
                  </PlayerProvider>
                </DownloadsProvider>
              </LibraryProvider>
            </CatalogProvider>
          </SettingsProvider>
        </UIProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
