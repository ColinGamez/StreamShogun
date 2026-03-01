// ── EpgGrid – virtualised EPG timeline grid ──────────────────────────
//
// Features:
// • Left channel column with logos/names, scroll-synced with grid
// • 30-min block timeline header (sticky)
// • Programme blocks with proportional widths
// • Current-time red marker, auto-updated every minute
// • Row virtualisation for large channel lists
// • Only renders programmes within a visible time window (now-1h … now+5h)
// • Click programme → detail callback; click channel label → play callback
//
// No heavy UI framework — pure CSS positioning + useVirtualRows hook.

import { useRef, useState, useMemo, useEffect, useCallback, type CSSProperties } from "react";
import type { Channel, Programme } from "@stream-shogun/core";
import type { SerializedEpgIndex } from "../vite-env";
import { useVirtualRows } from "../hooks/useVirtualRows";

// ── Configuration ─────────────────────────────────────────────────────

/** Pixels per hour in the timeline. */
const PX_PER_HOUR = 240;
/** Pixels per 30-min block. */
const PX_PER_HALF = PX_PER_HOUR / 2;
/** Row height in px. */
const ROW_H = 52;
/** Width of the left channel column. */
const CHAN_COL_W = 170;
/** Hours before now to include. */
const HOURS_BEFORE = 1;
/** Hours after now to include. */
const HOURS_AFTER = 5;
/** Total visible hours. */
const TOTAL_HOURS = HOURS_BEFORE + HOURS_AFTER;
/** Default programme duration if stop=0. */
const DEFAULT_DUR_MS = 30 * 60_000;

// ── Props ─────────────────────────────────────────────────────────────

export interface EpgGridProps {
  channels: Channel[];
  epgIndex: SerializedEpgIndex;
  /** Called when the user clicks a programme block. */
  onSelectProgramme?: (prog: Programme, channel: Channel) => void;
  /** Called when the user clicks a channel label. */
  onPlayChannel?: (channel: Channel) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Snap a timestamp down to the nearest half-hour. */
function snapHalfHour(ts: number): number {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return d.getTime();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function msToPixels(ms: number): number {
  return (ms / 3_600_000) * PX_PER_HOUR;
}

// ── Component ─────────────────────────────────────────────────────────

export function EpgGrid({ channels, epgIndex, onSelectProgramme, onPlayChannel }: EpgGridProps) {
  // ── Time window ─────────────────────────────────────────────────────
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const windowStart = useMemo(() => snapHalfHour(now - HOURS_BEFORE * 3_600_000), [now]);
  const windowEnd = windowStart + TOTAL_HOURS * 3_600_000;
  const totalTimelinePx = TOTAL_HOURS * PX_PER_HOUR;

  // ── Channels with EPG data (preserve order, include those without too) ──
  const guideChannels = useMemo(() => {
    return channels.filter((ch) => {
      const progs = epgIndex[ch.tvgId];
      return progs && progs.length > 0;
    });
  }, [channels, epgIndex]);

  // ── Refs ────────────────────────────────────────────────────────────
  const channelColRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Virtualisation ──────────────────────────────────────────────────
  const { start, end, offsetY, totalHeight } = useVirtualRows(
    scrollContainerRef,
    guideChannels.length,
    ROW_H,
  );
  const visibleChannels = guideChannels.slice(start, end);

  // ── Scroll sync: vertical ───────────────────────────────────────────
  const handleVerticalScroll = useCallback(() => {
    const sc = scrollContainerRef.current;
    const col = channelColRef.current;
    if (sc && col) {
      col.scrollTop = sc.scrollTop;
    }
  }, []);

  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    sc.addEventListener("scroll", handleVerticalScroll, { passive: true });
    return () => sc.removeEventListener("scroll", handleVerticalScroll);
  }, [handleVerticalScroll]);

  // ── Auto-scroll to "now" on mount ───────────────────────────────────
  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const nowOffset = msToPixels(now - windowStart);
    // Center the now marker in view
    sc.scrollLeft = Math.max(0, nowOffset - sc.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 30-min time labels ──────────────────────────────────────────────
  const timeSlots = useMemo(() => {
    const slots: { ts: number; left: number; label: string }[] = [];
    const COUNT = TOTAL_HOURS * 2; // 30-min blocks
    for (let i = 0; i < COUNT; i++) {
      const ts = windowStart + i * 30 * 60_000;
      slots.push({
        ts,
        left: i * PX_PER_HALF,
        label: formatTime(ts),
      });
    }
    return slots;
  }, [windowStart]);

  // ── Now marker x-position relative to timeline start ────────────────
  const nowPx = msToPixels(now - windowStart);
  const showNowMarker = nowPx >= 0 && nowPx <= totalTimelinePx;

  // ── Programme blocks for a channel (filtered to visible window) ─────
  const getProgrammes = useCallback(
    (ch: Channel): Programme[] => {
      const progs = epgIndex[ch.tvgId];
      if (!progs) return [];
      return progs.filter((p) => {
        const stop = p.stop || p.start + DEFAULT_DUR_MS;
        return stop > windowStart && p.start < windowEnd;
      });
    },
    [epgIndex, windowStart, windowEnd],
  );

  const blockStyle = useCallback(
    (prog: Programme): CSSProperties => {
      const clampedStart = Math.max(prog.start, windowStart);
      const stop = prog.stop || prog.start + DEFAULT_DUR_MS;
      const clampedEnd = Math.min(stop, windowEnd);
      const left = msToPixels(clampedStart - windowStart);
      const width = Math.max(msToPixels(clampedEnd - clampedStart), 4);
      return { left, width };
    },
    [windowStart, windowEnd],
  );

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="epg-grid">
      {/* ── Header row: empty corner + time slots ─────────────── */}
      <div className="epg-grid-header">
        <div className="epg-corner" style={{ width: CHAN_COL_W }}>
          {guideChannels.length} ch
        </div>
        <div className="epg-timeline-header-scroll">
          <div className="epg-timeline-header" style={{ width: totalTimelinePx }}>
            {timeSlots.map((slot) => (
              <div
                key={slot.ts}
                className="epg-time-slot"
                style={{ left: slot.left, width: PX_PER_HALF }}
              >
                <span className="epg-time-label">{slot.label}</span>
              </div>
            ))}
            {showNowMarker && (
              <div className="epg-now-line epg-now-line-header" style={{ left: nowPx }} />
            )}
          </div>
        </div>
      </div>

      {/* ── Body: channel column + scrollable grid ────────────── */}
      <div className="epg-grid-body">
        {/* Left channel column (scroll-synced vertically) */}
        <div ref={channelColRef} className="epg-channel-col" style={{ width: CHAN_COL_W }}>
          <div style={{ height: totalHeight, position: "relative" }}>
            <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
              {visibleChannels.map((ch) => (
                <div
                  key={ch.url}
                  className="epg-channel-cell"
                  style={{ height: ROW_H }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPlayChannel?.(ch)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onPlayChannel?.(ch);
                  }}
                  title={`Play ${ch.name}`}
                >
                  {ch.tvgLogo ? (
                    <img
                      className="epg-ch-logo"
                      src={ch.tvgLogo}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="epg-ch-logo-placeholder">
                      {ch.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="epg-ch-name">{ch.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable timeline grid */}
        <div ref={scrollContainerRef} className="epg-scroll-area" onScroll={handleVerticalScroll}>
          <div className="epg-grid-canvas" style={{ width: totalTimelinePx, height: totalHeight }}>
            {/* Now marker (full-height red line) */}
            {showNowMarker && <div className="epg-now-line" style={{ left: nowPx }} />}

            {/* Virtualised rows */}
            <div
              style={{
                position: "absolute",
                top: offsetY,
                left: 0,
                right: 0,
              }}
            >
              {visibleChannels.map((ch) => {
                const progs = getProgrammes(ch);
                return (
                  <div key={ch.url} className="epg-row" style={{ height: ROW_H }}>
                    {progs.map((prog, i) => {
                      const style = blockStyle(prog);
                      const isNow =
                        prog.start <= now && (prog.stop || prog.start + DEFAULT_DUR_MS) > now;
                      return (
                        <button
                          key={`${prog.channelId}-${prog.start}-${i}`}
                          className={`epg-block${isNow ? " epg-block-now" : ""}`}
                          style={style}
                          onClick={() => onSelectProgramme?.(prog, ch)}
                          title={prog.titles[0] ?? ""}
                        >
                          <span className="epg-block-title">{prog.titles[0] ?? ""}</span>
                          {(style.width as number) > 90 && prog.subtitle && (
                            <span className="epg-block-sub">{prog.subtitle}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
