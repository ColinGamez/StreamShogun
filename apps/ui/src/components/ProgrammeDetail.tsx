// ── ProgrammeDetail – slide-out detail panel for a selected programme ─

import { useEffect } from "react";
import type { Channel, Programme } from "@stream-shogun/core";

export interface ProgrammeDetailProps {
  programme: Programme;
  channel: Channel;
  onClose: () => void;
  onPlay: (ch: Channel) => void;
}

function formatTimeRange(start: number, stop: number): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (!stop) return fmt(start);
  return `${fmt(start)} – ${fmt(stop)}`;
}

function durationMinutes(start: number, stop: number): number {
  if (!stop) return 0;
  return Math.round((stop - start) / 60_000);
}

export function ProgrammeDetail({ programme, channel, onClose, onPlay }: ProgrammeDetailProps) {
  const dur = durationMinutes(programme.start, programme.stop);
  const isLive =
    programme.start <= Date.now() && (programme.stop === 0 || programme.stop > Date.now());

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="prog-detail" role="dialog" aria-label="Programme details">
      {/* Header */}
      <div className="prog-detail-header">
        <div className="prog-detail-title-row">
          <h3 className="prog-detail-title">{programme.titles[0] ?? "Untitled"}</h3>
          <button className="prog-detail-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {programme.subtitle && <p className="prog-detail-subtitle">{programme.subtitle}</p>}
      </div>

      {/* Metadata pills */}
      <div className="prog-detail-meta">
        <span className="prog-pill">{formatTimeRange(programme.start, programme.stop)}</span>
        {dur > 0 && <span className="prog-pill">{dur} min</span>}
        {isLive && <span className="prog-pill prog-pill-live">LIVE</span>}
        {programme.rating && <span className="prog-pill">★ {programme.rating}</span>}
        {programme.episodeNum && <span className="prog-pill">{programme.episodeNum}</span>}
      </div>

      {/* Categories */}
      {programme.categories.length > 0 && (
        <div className="prog-detail-cats">
          {programme.categories.map((c) => (
            <span key={c} className="prog-cat-tag">
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {programme.description && <p className="prog-detail-desc">{programme.description}</p>}

      {/* Programme icon/poster */}
      {programme.icon && (
        <img
          className="prog-detail-poster"
          src={programme.icon}
          alt=""
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      {/* Channel + Play */}
      <div className="prog-detail-footer">
        <div className="prog-detail-ch">
          {channel.tvgLogo && (
            <img
              className="prog-detail-ch-logo"
              src={channel.tvgLogo}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span>{channel.name}</span>
        </div>
        <button className="prog-detail-play" onClick={() => onPlay(channel)}>
          ▶ Watch
        </button>
      </div>
    </div>
  );
}
