import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import type { Channel } from "@stream-shogun/core";
import { useAppStore } from "./stores/app-store";
import { showToast } from "./components/Toast";

import { Sidebar, type Page } from "./components/Sidebar";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginModal } from "./components/LoginModal";
import { OfflineBanner } from "./components/OfflineBanner";
import { PaywallModal } from "./components/PaywallModal";
import { BillingStateBanner } from "./components/BillingStateBanner";
import { UpgradeNudgeBanner } from "./components/UpgradeNudgeBanner";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { Skeleton } from "./components/Skeleton";

// ── Lazy-loaded pages (only the active page is loaded) ─────────────
const LibraryPage = lazy(() => import("./pages/Library").then((m) => ({ default: m.LibraryPage })));
const ChannelsPage = lazy(() =>
  import("./pages/Channels").then((m) => ({ default: m.ChannelsPage })),
);
const GuidePage = lazy(() => import("./pages/Guide").then((m) => ({ default: m.GuidePage })));
const PlayerPage = lazy(() => import("./pages/Player").then((m) => ({ default: m.PlayerPage })));
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const HistoryPage = lazy(() => import("./pages/History").then((m) => ({ default: m.HistoryPage })));
const SupportPage = lazy(() => import("./pages/Support").then((m) => ({ default: m.SupportPage })));

/** Suspense fallback shown while a page chunk loads. */
function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <Skeleton width="40%" height="2em" />
      <Skeleton width="100%" height="120px" />
      <Skeleton width="100%" height="120px" />
      <Skeleton width="60%" height="1em" />
    </div>
  );
}

// ── PIP mode detection (parsed once — never changes during lifecycle) ──
const PIP_PARAMS = new URLSearchParams(window.location.search);
const PIP_MODE = PIP_PARAMS.get("pip") === "true";
const PIP_URL = PIP_PARAMS.get("url") || "";
const PIP_NAME = PIP_PARAMS.get("name") || "";

function App() {
  const mainRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState<Page>("library");
  const [previousPage, setPreviousPage] = useState<Page>("library");
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const initAuth = useAppStore((s) => s.initAuth);
  const initFromDb = useAppStore((s) => s.initFromDb);

  const settings = useAppStore((s) => s.settings);
  const incrementAppOpen = useAppStore((s) => s.incrementAppOpen);

  // Theme toggle (supports dark / light / system)
  useEffect(() => {
    const applyTheme = (theme: string) => {
      if (theme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.classList.toggle("theme-light", !prefersDark);
      } else if (theme === "light") {
        document.documentElement.classList.add("theme-light");
      } else {
        document.documentElement.classList.remove("theme-light");
      }
    };

    applyTheme(settings.theme);

    // Listen for OS-level theme changes when "system" is selected
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.classList.toggle("theme-light", !e.matches);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [settings.theme]);

  // Silent auth refresh on startup
  useEffect(() => {
    void initFromDb();
    initAuth();
    incrementAppOpen();
  }, [initAuth, incrementAppOpen, initFromDb]);

  // Global unhandled promise rejection handler
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      console.error("[unhandledrejection]", e.reason);
      showToast("An unexpected error occurred", "error");
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  // Focus main content, scroll to top, and update document title on page transitions
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
    const PAGE_TITLES: Record<Page, string> = {
      library: "Library",
      channels: "Channels",
      guide: "Guide",
      player: "Player",
      history: "History",
      support: "Support",
      settings: "Settings",
    };
    document.title = `${PAGE_TITLES[page]} — StreamShōgun`;
  }, [page]);

  // Play a channel → switch to player page
  const handlePlay = useCallback(
    (ch: Channel) => {
      setCurrentChannel(ch);
      setPage("player");
    },
    [setCurrentChannel],
  );

  // Track previous page so Support can show context-aware prompts
  const handlePageChange = useCallback(
    (next: Page) => {
      if (next === "support" && page !== "support") {
        setPreviousPage(page);
      }
      setPage(next);
    },
    [page],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Alt+1‥6 to switch pages
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const pages: Page[] = [
          "library",
          "channels",
          "guide",
          "player",
          "history",
          "support",
          "settings",
        ];
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < pages.length) {
          e.preventDefault();
          handlePageChange(pages[idx]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePageChange]);

  // ── PIP mode: minimal player only ─────────────────────────────────
  if (PIP_MODE && PIP_URL) {
    return (
      <div className="app-pip">
        <ErrorBoundary label="PIP Player">
          <PlayerPage
            onNavigate={() => {
              /* noop in PIP mode */
            }}
            pipUrl={PIP_URL}
            pipName={PIP_NAME}
          />
        </ErrorBoundary>
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
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Sidebar current={page} onChange={handlePageChange} />

      <main ref={mainRef} id="main-content" tabIndex={-1} className="app-main">
        <OfflineBanner />
        <BillingStateBanner />
        <UpgradeNudgeBanner />
        <Suspense fallback={<PageSkeleton />}>
          {page === "library" && (
            <ErrorBoundary label="Library">
              <LibraryPage />
            </ErrorBoundary>
          )}
          {page === "channels" && (
            <ErrorBoundary label="Channels">
              <ChannelsPage onPlay={handlePlay} />
            </ErrorBoundary>
          )}
          {page === "guide" && (
            <ErrorBoundary label="Guide">
              <GuidePage onPlay={handlePlay} />
            </ErrorBoundary>
          )}
          {page === "player" && (
            <ErrorBoundary label="Player">
              <PlayerPage onNavigate={(p) => handlePageChange(p)} />
            </ErrorBoundary>
          )}
          {page === "history" && (
            <ErrorBoundary label="History">
              <HistoryPage onPlay={handlePlay} />
            </ErrorBoundary>
          )}
          {page === "support" && (
            <ErrorBoundary label="Support">
              <SupportPage sourceContext={previousPage} />
            </ErrorBoundary>
          )}
          {page === "settings" && (
            <ErrorBoundary label="Settings">
              <SettingsPage />
            </ErrorBoundary>
          )}
        </Suspense>
      </main>

      <ToastContainer />
      <LoginModal />
      <PaywallModal />
      <KeyboardShortcuts />
    </div>
  );
}

export default App;
