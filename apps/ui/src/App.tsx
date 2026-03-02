import { useState, useCallback, useEffect } from "react";
import type { Channel } from "@stream-shogun/core";
import { useAppStore } from "./stores/app-store";

import { Sidebar, type Page } from "./components/Sidebar";
import { Welcome } from "./components/Welcome";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LibraryPage } from "./pages/Library";
import { ChannelsPage } from "./pages/Channels";
import { GuidePage } from "./pages/Guide";
import { PlayerPage } from "./pages/Player";
import { SettingsPage } from "./pages/Settings";
import { HistoryPage } from "./pages/History";
import { LoginModal } from "./components/LoginModal";
import { OfflineBanner } from "./components/OfflineBanner";
import { PaywallModal } from "./components/PaywallModal";
import { BillingStateBanner } from "./components/BillingStateBanner";
import { UpgradeNudgeBanner } from "./components/UpgradeNudgeBanner";

function App() {
  // ── PIP mode detection ─────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const isPip = params.get("pip") === "true";
  const pipUrl = params.get("url") || "";
  const pipName = params.get("name") || "";

  const [page, setPage] = useState<Page>("library");
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const hasPlaylists = useAppStore(
    (s) => s.playlistEntries.length > 0 || s.channels.length > 0 || s.dbPlaylists.length > 0,
  );
  const initAuth = useAppStore((s) => s.initAuth);

  const settings = useAppStore((s) => s.settings);
  const incrementAppOpen = useAppStore((s) => s.incrementAppOpen);

  // Theme toggle
  useEffect(() => {
    if (settings.theme === "light") {
      document.documentElement.classList.add("theme-light");
    } else {
      document.documentElement.classList.remove("theme-light");
    }
  }, [settings.theme]);

  // Silent auth refresh on startup
  useEffect(() => {
    initAuth();
    incrementAppOpen();
  }, [initAuth, incrementAppOpen]);

  // Play a channel → switch to player page
  const handlePlay = useCallback(
    (ch: Channel) => {
      setCurrentChannel(ch);
      setPage("player");
    },
    [setCurrentChannel],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Alt+1‥6 to switch pages
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const pages: Page[] = ["library", "channels", "guide", "player", "history", "settings"];
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < pages.length) {
          e.preventDefault();
          setPage(pages[idx]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── PIP mode: minimal player only ─────────────────────────────────
  if (isPip && pipUrl) {
    return (
      <div className="app-pip">
        <ErrorBoundary label="PIP Player">
          <PlayerPage
            onNavigate={() => { /* noop in PIP mode */ }}
            pipUrl={pipUrl}
            pipName={pipName}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // ── First-run: show Welcome when nothing is loaded ──────────────
  if (!hasPlaylists) {
    return (
      <div className="app-shell">
        <div className="aurora-bg" aria-hidden="true">
          <div className="aurora-orb aurora-orb-1" />
          <div className="aurora-orb aurora-orb-2" />
          <div className="aurora-orb aurora-orb-3" />
        </div>
        <Sidebar current={page} onChange={setPage} />
        <main className="app-main">
          <OfflineBanner />
          <BillingStateBanner />
          <UpgradeNudgeBanner />
          <Welcome onGoToLibrary={() => setPage("library")} />
        </main>
        <ToastContainer />
        <LoginModal />
        <PaywallModal />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="aurora-bg" aria-hidden="true">
        <div className="aurora-orb aurora-orb-1" />
        <div className="aurora-orb aurora-orb-2" />
        <div className="aurora-orb aurora-orb-3" />
      </div>
      <Sidebar current={page} onChange={setPage} />

      <main className="app-main">
        <OfflineBanner />
        <BillingStateBanner />
        <UpgradeNudgeBanner />
        {page === "library" && <ErrorBoundary label="Library"><LibraryPage /></ErrorBoundary>}
        {page === "channels" && <ErrorBoundary label="Channels"><ChannelsPage onPlay={handlePlay} /></ErrorBoundary>}
        {page === "guide" && <ErrorBoundary label="Guide"><GuidePage onPlay={handlePlay} /></ErrorBoundary>}
        {page === "player" && <ErrorBoundary label="Player"><PlayerPage onNavigate={(p) => setPage(p)} /></ErrorBoundary>}
        {page === "history" && <ErrorBoundary label="History"><HistoryPage onPlay={handlePlay} /></ErrorBoundary>}
        {page === "settings" && <ErrorBoundary label="Settings"><SettingsPage /></ErrorBoundary>}
      </main>

      <ToastContainer />
      <LoginModal />
      <PaywallModal />
    </div>
  );
}

export default App;
