// ── Welcome screen – shown on first run (no playlists loaded) ────────

import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { loadSampleData } from "../lib/sample-data";
import { showToast } from "./Toast";

interface WelcomeProps {
  onGoToLibrary: () => void;
}

export function Welcome({ onGoToLibrary }: WelcomeProps) {
  const locale = useAppStore((s) => s.locale);
  const [loading, setLoading] = useState(false);

  const handleSampleData = async () => {
    setLoading(true);
    try {
      await loadSampleData();
    } catch (err) {
      showToast(
        t("welcome.sampleError", locale) + (err instanceof Error ? `: ${err.message}` : ""),
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-eyebrow">
          <span className="welcome-eyebrow-dot" />
          YOUR PLAYLISTS. FINALLY ORGANIZED.
        </div>
        <div className="welcome-brand-row">
          <div className="welcome-logo" aria-hidden="true">
            S
          </div>
          <span>STREAMSHŌGUN / FIRST RUN</span>
        </div>
        <h1 className="welcome-title">Turn playlist chaos into a clean TV guide.</h1>
        <p className="welcome-subtitle">
          Import your own M3U playlists and XMLTV guides. StreamShōgun keeps the core workflow
          local, matches channel metadata, and puts you in control.
        </p>

        <div className="welcome-features">
          <div className="welcome-feature">
            <span className="welcome-feature-number">01</span>
            <div>
              <strong>{t("welcome.feature1.title", locale)}</strong>
              <p>{t("welcome.feature1.desc", locale)}</p>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="welcome-feature-number">02</span>
            <div>
              <strong>{t("welcome.feature2.title", locale)}</strong>
              <p>{t("welcome.feature2.desc", locale)}</p>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="welcome-feature-number">03</span>
            <div>
              <strong>{t("welcome.feature3.title", locale)}</strong>
              <p>{t("welcome.feature3.desc", locale)}</p>
            </div>
          </div>
        </div>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={onGoToLibrary}>
            {t("welcome.addPlaylist", locale)}
            <span aria-hidden="true">→</span>
          </button>
          <button className="welcome-btn secondary" onClick={handleSampleData} disabled={loading}>
            {loading ? t("library.loading", locale) : t("welcome.loadSample", locale)}
          </button>
        </div>

        <div className="welcome-trust">
          <span>LOCAL-FIRST STORAGE</span>
          <span>NO CHANNELS INCLUDED</span>
          <span>WINDOWS · MACOS · LINUX</span>
        </div>
        <p className="welcome-hint">
          StreamShōgun is desktop software for sources you provide. It is not an IPTV provider.
        </p>
      </div>
    </div>
  );
}
