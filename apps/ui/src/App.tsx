import { useState, useCallback, useEffect } from "react";
import type { Channel } from "@stream-shogun/core";
import { useAppStore } from "./stores/app-store";

import { Sidebar, type Page } from "./components/Sidebar";
import { Welcome } from "./components/Welcome";
import { ToastContainer } from "./components/Toast";
import { LibraryPage } from "./pages/Library";
import { ChannelsPage } from "./pages/Channels";
import { GuidePage } from "./pages/Guide";
import { PlayerPage } from "./pages/Player";
import { SettingsPage } from "./pages/Settings";
import { HistoryPage } from "./pages/History";

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
        <PlayerPage
          onNavigate={() => { /* noop in PIP mode */ }}
          pipUrl={pipUrl}
          pipName={pipName}
        />
      </div>
    );
  }

  // ── First-run: show Welcome when nothing is loaded ──────────────
  if (!hasPlaylists) {
    return (
      <div className="app-shell">
        <Sidebar current={page} onChange={setPage} />
        <main className="app-main">
          <Welcome onGoToLibrary={() => setPage("library")} />
        </main>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar current={page} onChange={setPage} />

      <main className="app-main">
        {page === "library" && <LibraryPage />}
        {page === "channels" && <ChannelsPage onPlay={handlePlay} />}
        {page === "guide" && <GuidePage onPlay={handlePlay} />}
        {page === "player" && <PlayerPage onNavigate={(p) => setPage(p)} />}
        {page === "history" && <HistoryPage onPlay={handlePlay} />}
        {page === "settings" && <SettingsPage />}
      </main>

      <ToastContainer />
    </div>
  );
}

export default App;
