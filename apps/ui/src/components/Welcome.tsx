// ── Welcome screen – shown on first run (no playlists loaded) ────────

import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { loadSampleData } from "../lib/sample-data";

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-logo">⚔️</div>
        <h1 className="welcome-title">StreamShōgun</h1>
        <p className="welcome-subtitle">{t("welcome.subtitle", locale)}</p>

        <div className="welcome-features">
          <div className="welcome-feature">
            <span className="welcome-feature-icon">📚</span>
            <div>
              <strong>{t("welcome.feature1.title", locale)}</strong>
              <p>{t("welcome.feature1.desc", locale)}</p>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="welcome-feature-icon">📅</span>
            <div>
              <strong>{t("welcome.feature2.title", locale)}</strong>
              <p>{t("welcome.feature2.desc", locale)}</p>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="welcome-feature-icon">▶️</span>
            <div>
              <strong>{t("welcome.feature3.title", locale)}</strong>
              <p>{t("welcome.feature3.desc", locale)}</p>
            </div>
          </div>
        </div>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={onGoToLibrary}>
            {t("welcome.addPlaylist", locale)}
          </button>
          <button className="welcome-btn secondary" onClick={handleSampleData} disabled={loading}>
            {loading ? "Loading…" : t("welcome.loadSample", locale)}
          </button>
        </div>

        <p className="welcome-hint">{t("welcome.hint", locale)}</p>
      </div>
    </div>
  );
}
