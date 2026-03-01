// ── Memoized selectors for performance (F7) ──────────────────────────
//
// Zustand re-renders every subscriber on any state change by default.
// These memoized selector factories use shallow equality to avoid
// unnecessary re-renders for derived data.

import { useRef, useMemo } from "react";
import type { Channel, Programme } from "@stream-shogun/core";
import type { SerializedEpgIndex } from "../vite-env";

/**
 * Stable memoized hook that returns channel groups.
 * Only recalculates when the channels array reference changes.
 */
export function useChannelGroups(channels: Channel[]): string[] {
  return useMemo(() => {
    const set = new Set<string>();
    for (const ch of channels) {
      if (ch.groupTitle) set.add(ch.groupTitle);
    }
    return [...set].sort();
  }, [channels]);
}

/**
 * Stable memoized hook that returns channels filtered by search + group.
 * Avoids allocating new arrays when inputs haven't changed.
 */
export function useFilteredChannels(
  channels: Channel[],
  search: string,
  group: string,
  showFavsOnly: boolean,
  favorites: Set<string>,
): Channel[] {
  const prevRef = useRef<{
    channels: Channel[];
    search: string;
    group: string;
    showFavsOnly: boolean;
    favSize: number;
    result: Channel[];
  } | null>(null);

  return useMemo(() => {
    // Quick reference equality check
    if (
      prevRef.current &&
      prevRef.current.channels === channels &&
      prevRef.current.search === search &&
      prevRef.current.group === group &&
      prevRef.current.showFavsOnly === showFavsOnly &&
      prevRef.current.favSize === favorites.size
    ) {
      return prevRef.current.result;
    }

    const q = search.toLowerCase();
    const result = channels.filter((ch) => {
      if (showFavsOnly && !favorites.has(ch.url)) return false;
      if (group && ch.groupTitle !== group) return false;
      if (
        q &&
        !ch.name.toLowerCase().includes(q) &&
        !ch.groupTitle.toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    prevRef.current = {
      channels,
      search,
      group,
      showFavsOnly,
      favSize: favorites.size,
      result,
    };

    return result;
  }, [channels, search, group, showFavsOnly, favorites]);
}

/**
 * Memoized helper to get the now-playing programme for a channel.
 */
export function useNowProgramme(
  epgIndex: SerializedEpgIndex,
  channelTvgId: string,
): Programme | null {
  return useMemo(() => {
    const progs = epgIndex[channelTvgId];
    if (!progs?.length) return null;
    const now = Date.now();
    for (const p of progs) {
      if (p.start <= now && (p.stop === 0 || p.stop > now)) return p;
    }
    return null;
  }, [epgIndex, channelTvgId]);
}

/**
 * Memoized guide channels — only channels that have EPG data.
 */
export function useGuideChannels(
  channels: Channel[],
  epgIndex: SerializedEpgIndex,
): Channel[] {
  return useMemo(() => {
    return channels.filter((ch) => {
      const progs = epgIndex[ch.tvgId];
      return progs && progs.length > 0;
    });
  }, [channels, epgIndex]);
}
