import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { showToast } from "../components/Toast";
import { SearchInput } from "../components/SearchInput";
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
  const [search, setSearch] = useState("");

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

  /** Relative time string (e.g. "2h ago", "3d ago"). */
  const relativeTime = (ts: number): string => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return t("history.timeAgo.justNow", locale);
    if (minutes < 60) return t("history.timeAgo.minutesAgo", locale, { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("history.timeAgo.hoursAgo", locale, { n: hours });
    const days = Math.floor(hours / 24);
    return t("history.timeAgo.daysAgo", locale, { n: days });
  };

  // Filtered history by search query
  const filteredHistory = useMemo(() => {
    if (!search.trim()) return watchHistory;
    const q = search.toLowerCase();
    return watchHistory.filter(
      (row) =>
        row.channelName.toLowerCase().includes(q) || row.groupTitle.toLowerCase().includes(q),
    );
  }, [watchHistory, search]);

  const handleExportCsv = useCallback(() => {
    if (watchHistory.length === 0) return;
    const header = "Channel,Group,Duration,Started,Stopped";
    const rows = watchHistory.map((r) => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        esc(r.channelName),
        esc(r.groupTitle),
        formatDuration(r.durationSec),
        r.startedAt ? new Date(r.startedAt).toISOString() : "",
        r.stoppedAt ? new Date(r.stoppedAt).toISOString() : "",
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watch-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t("history.exported", locale), "success");
  }, [watchHistory, locale]);

  return (
    <div className="page page-history">
      <div className="page-header">
        <h2 className="page-title">🕒 {t("history.title", locale)}</h2>
        {watchHistory.length > 0 && (
          <div className="page-header-actions">
            <button className="btn-secondary" onClick={handleExportCsv}>
              📥 {t("history.export", locale)}
            </button>
            <button className="btn-danger" onClick={handleClear}>
              🗑️ {t("history.clear", locale)}
            </button>
          </div>
        )}
      </div>

      {/* ── Continue Watching ──────────────────────────── */}
      {lastWatched && (
        <section className="history-continue">
          <h3>{t("history.continueWatching", locale)}</h3>
          <div
            className="history-continue-card"
            onClick={() => handleContinue(lastWatched)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleContinue(lastWatched);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`${t("history.continueWatching", locale)} ${lastWatched.channelName}`}
          >
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

      {/* ── Search toolbar ────────────────────────────── */}
      {watchHistory.length > 0 && (
        <div className="history-toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("history.search", locale)}
          />
        </div>
      )}

      {/* ── History List ───────────────────────────────── */}
      {watchHistory.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🕒</span>
          <p>{t("history.empty", locale)}</p>
        </div>
      ) : (
        <div className="history-list">
          {filteredHistory.map((row) => (
            <div
              key={row.id}
              className="history-row"
              onClick={() => handleContinue(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleContinue(row);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={t("history.play", locale, { name: row.channelName })}
            >
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
                <span className="history-relative-time" title={formatTime(row.startedAt)}>
                  {relativeTime(row.startedAt)}
                </span>
              </div>
              <span className="history-row-play">▶</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
