import { useEffect, useCallback } from "react";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { showToast } from "../components/Toast";
import type { Channel } from "@stream-shogun/core";

interface HistoryPageProps {
  onPlay: (ch: Channel) => void;
}

export function HistoryPage({ onPlay }: HistoryPageProps) {
  const locale = useAppStore((s) => s.locale);
  const watchHistory = useAppStore((s) => s.watchHistory);
  const lastWatched = useAppStore((s) => s.lastWatched);
  const loadWatchHistory = useAppStore((s) => s.loadWatchHistory);
  const clearWatchHistory = useAppStore((s) => s.clearWatchHistory);

  useEffect(() => {
    loadWatchHistory();
  }, [loadWatchHistory]);

  const handleClear = useCallback(async () => {
    if (!window.confirm(t("history.confirmClear", locale))) return;
    await clearWatchHistory();
    showToast(t("history.cleared", locale), "success");
  }, [clearWatchHistory, locale]);

  const handleContinue = useCallback(
    (row: (typeof watchHistory)[0]) => {
      const ch: Channel = {
        tvgId: "",
        tvgName: row.channelName,
        name: row.channelName,
        tvgLogo: row.channelLogo,
        groupTitle: row.groupTitle,
        url: row.channelUrl,
        duration: -1,
        extras: {},
      };
      onPlay(ch);
    },
    [onPlay],
  );

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="page page-history">
      <div className="page-header">
        <h2 className="page-title">🕒 {t("history.title", locale)}</h2>
        {watchHistory.length > 0 && (
          <button className="btn-danger" onClick={handleClear}>
            🗑️ {t("history.clear", locale)}
          </button>
        )}
      </div>

      {/* ── Continue Watching ──────────────────────────── */}
      {lastWatched && (
        <section className="history-continue">
          <h3>{t("history.continueWatching", locale)}</h3>
          <div className="history-continue-card" onClick={() => handleContinue(lastWatched)}>
            {lastWatched.channelLogo && (
              <img
                className="history-logo"
                src={lastWatched.channelLogo}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="history-continue-info">
              <span className="history-continue-name">{lastWatched.channelName}</span>
              <span className="history-continue-group">{lastWatched.groupTitle}</span>
              <span className="history-continue-time">
                {t("history.lastWatched", locale)}: {formatTime(lastWatched.stoppedAt)}
              </span>
            </div>
            <span className="history-continue-play">▶</span>
          </div>
        </section>
      )}

      {/* ── History List ───────────────────────────────── */}
      {watchHistory.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🕒</span>
          <p>{t("history.empty", locale)}</p>
        </div>
      ) : (
        <div className="history-list">
          {watchHistory.map((row) => (
            <div key={row.id} className="history-row" onClick={() => handleContinue(row)}>
              <div className="history-row-logo-wrap">
                {row.channelLogo ? (
                  <img
                    className="history-row-logo"
                    src={row.channelLogo}
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="history-row-logo-placeholder">📺</span>
                )}
              </div>
              <div className="history-row-info">
                <span className="history-row-name">{row.channelName}</span>
                <span className="history-row-group">{row.groupTitle}</span>
              </div>
              <div className="history-row-meta">
                <span className="history-row-duration">
                  {t("history.duration", locale)}: {formatDuration(row.durationSec)}
                </span>
                <span className="history-row-time">{formatTime(row.startedAt)}</span>
              </div>
              <span className="history-row-play">▶</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
