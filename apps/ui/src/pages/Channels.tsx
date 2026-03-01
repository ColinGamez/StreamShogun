import { useState, useMemo, useCallback } from "react";
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
          <p className="channel-count">
            {filtered.length} / {channels.length} {t("nav.channels", locale).toLowerCase()}
          </p>

          {/* ── Grid ─────────────────────────────────────── */}
          <div className="channel-grid">
            {filtered.map((ch) => (
              <ChannelCard
                key={ch.url}
                channel={ch}
                nowPlaying={nowProgramme(ch)}
                onPlay={onPlay}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
