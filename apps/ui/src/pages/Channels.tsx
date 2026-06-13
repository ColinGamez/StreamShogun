import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Channel, Programme } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { ChannelCard } from "../components/ChannelCard";
import { SearchInput } from "../components/SearchInput";
import { GroupFilter } from "../components/GroupFilter";

interface ChannelsPageProps {
  onPlay: (ch: Channel) => void;
}

export function ChannelsPage({ onPlay }: ChannelsPageProps) {
  const locale = useAppStore((s) => s.locale);
  const channels = useAppStore((s) => s.channels);
  const favorites = useAppStore((s) => s.favorites);
  const epgIndex = useAppStore((s) => s.epgIndex);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  // ── Derived data ────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const ch of channels) {
      if (ch.groupTitle) set.add(ch.groupTitle);
    }
    return [...set].sort();
  }, [channels]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return channels.filter((ch) => {
      if (showFavsOnly && !favorites.has(ch.url)) return false;
      if (group && ch.groupTitle !== group) return false;
      if (q && !ch.name.toLowerCase().includes(q) && !ch.groupTitle.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [channels, search, group, showFavsOnly, favorites]);

  // Now-playing lookup helper
  const nowProgramme = useCallback(
    (ch: Channel): Programme | null => {
      const progs = epgIndex[ch.tvgId];
      if (!progs?.length) return null;
      const now = Date.now();
      for (const p of progs) {
        if (p.start <= now && (p.stop === 0 || p.stop > now)) return p;
      }
      return null;
    },
    [epgIndex],
  );

  // ── Arrow-key grid navigation ─────────────────────────────────────
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handler = (e: KeyboardEvent) => {
      const cards = Array.from(grid.querySelectorAll<HTMLElement>("[role='button']"));
      if (cards.length === 0) return;
      const idx = cards.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return; // no card focused

      // Estimate columns from grid layout
      const firstRect = cards[0].getBoundingClientRect();
      const cols = Math.max(1, Math.round(grid.clientWidth / firstRect.width));

      let next = -1;
      switch (e.key) {
        case "ArrowRight":
          next = Math.min(idx + 1, cards.length - 1);
          break;
        case "ArrowLeft":
          next = Math.max(idx - 1, 0);
          break;
        case "ArrowDown":
          next = Math.min(idx + cols, cards.length - 1);
          break;
        case "ArrowUp":
          next = Math.max(idx - cols, 0);
          break;
        default:
          return;
      }
      if (next !== idx) {
        e.preventDefault();
        cards[next].focus();
      }
    };

    grid.addEventListener("keydown", handler);
    return () => grid.removeEventListener("keydown", handler);
  }, [filtered]);

  return (
    <div className="page page-channels">
      <h1 className="page-title">{t("nav.channels", locale)}</h1>

      {channels.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📡</span>
          <p>{t("channels.empty", locale)}</p>
        </div>
      ) : (
        <>
          {/* ── Toolbar ──────────────────────────────────── */}
          <div className="channels-toolbar">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("channels.search", locale)}
            />
            <button
              className={`btn-toggle${showFavsOnly ? " active" : ""}`}
              onClick={() => setShowFavsOnly(!showFavsOnly)}
              aria-pressed={showFavsOnly}
              title={t("channels.favorites", locale)}
            >
              ★
            </button>
          </div>

          {groups.length > 1 && (
            <GroupFilter groups={groups} selected={group} onSelect={setGroup} />
          )}

          {/* ── Channel count ────────────────────────────── */}
          <p className="channel-count" aria-live="polite" aria-atomic="true">
            {filtered.length} / {channels.length} {t("nav.channels", locale).toLowerCase()}
          </p>

          {/* ── Grid ─────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <div className="empty-filter-state">
              <span className="empty-icon">🔍</span>
              <p>{t("channels.noResults", locale)}</p>
              <button
                className="btn-secondary"
                onClick={() => {
                  setSearch("");
                  setGroup("");
                  setShowFavsOnly(false);
                }}
              >
                {t("channels.clearFilters", locale)}
              </button>
            </div>
          ) : (
            <div className="channel-grid" ref={gridRef}>
              {filtered.map((ch) => (
                <ChannelCard
                  key={ch.url}
                  channel={ch}
                  nowPlaying={nowProgramme(ch)}
                  onPlay={onPlay}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
