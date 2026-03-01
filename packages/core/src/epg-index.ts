// ── EPG Index — efficient programme lookups ───────────────────────────
//
// createEpgIndex  → Map<channelId, Programme[]> sorted by start
// getNowNext      → O(log n) current + next programme
// getRange        → O(log n + k) programmes in a time window

import type { Programme, EpgIndex } from "./xmltv-types.js";

// ── Index creation ────────────────────────────────────────────────────

/**
 * Build a lookup index from a flat array of programmes.
 *
 * Each channel's programmes are sorted ascending by `start` time so
 * binary search can be used for all time-based queries.
 */
export function createEpgIndex(programmes: Programme[]): EpgIndex {
  const index: EpgIndex = new Map();

  for (const prog of programmes) {
    const key = prog.channelId;
    let list = index.get(key);
    if (!list) {
      list = [];
      index.set(key, list);
    }
    list.push(prog);
  }

  // Sort each channel's list by start time (ascending).
  for (const list of index.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  return index;
}

// ── Binary search helpers ─────────────────────────────────────────────

/**
 * Find the index of the last programme whose start ≤ `time`.
 * Returns -1 if all programmes start after `time`.
 */
function lowerBound(progs: Programme[], time: number): number {
  let lo = 0;
  let hi = progs.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (progs[mid].start <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

/**
 * Find the index of the first programme whose start ≥ `time`.
 * Returns progs.length if none qualifies.
 */
// Exported for potential external use in advanced range queries.
export function upperBound(progs: Programme[], time: number): number {
  let lo = 0;
  let hi = progs.length - 1;
  let result = progs.length;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (progs[mid].start >= time) {
      result = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return result;
}

// ── Public helpers ────────────────────────────────────────────────────

/**
 * Get the currently-airing and next-up programmes for a channel.
 *
 * "Now" is the programme whose start ≤ `now` and stop > `now`
 * (or, if stop is 0, the next programme hasn't started yet).
 *
 * Complexity: O(log n) per call.
 */
export function getNowNext(
  index: EpgIndex,
  channelId: string,
  now: Date = new Date(),
): { now?: Programme; next?: Programme } {
  const progs = index.get(channelId);
  if (!progs || progs.length === 0) return {};

  const ts = now.getTime();
  const idx = lowerBound(progs, ts);

  let current: Programme | undefined;
  let next: Programme | undefined;

  if (idx >= 0) {
    const candidate = progs[idx];
    // Check if it's still airing.
    const isAiring =
      candidate.stop > ts || // explicit stop in the future
      candidate.stop === 0; // no stop time recorded
    if (isAiring) {
      current = candidate;
      next = progs[idx + 1];
    } else {
      // The candidate has finished; the "next" is whatever comes after.
      next = progs[idx + 1];
    }
  } else {
    // All programmes are in the future — first one is "next".
    next = progs[0];
  }

  return { now: current, next };
}

/**
 * Get all programmes for a channel that overlap with [startDate, endDate].
 *
 * A programme overlaps if:
 *   programme.start < endDate AND (programme.stop > startDate OR stop === 0)
 *
 * Complexity: O(log n + k) where k = number of results.
 */
export function getRange(
  index: EpgIndex,
  channelId: string,
  startDate: Date,
  endDate: Date,
): Programme[] {
  const progs = index.get(channelId);
  if (!progs || progs.length === 0) return [];

  const startTs = startDate.getTime();
  const endTs = endDate.getTime();

  // Find the first programme that could overlap: start < endTs.
  // We need programmes whose start < endTs, so we find the first with start >= endTs
  // and take everything before that.  But we also need stop > startTs.
  // Strategy: start scanning from the first programme whose start >= startTs (or a
  //   bit earlier to catch programmes that started before startTs but are still airing).

  // Find the latest programme starting at or before startTs — it may still be airing.
  const anchor = lowerBound(progs, startTs);
  const scanFrom = Math.max(0, anchor);

  const results: Programme[] = [];

  for (let i = scanFrom; i < progs.length; i++) {
    const p = progs[i];

    // Programme starts at or after endTs → no more overlaps.
    if (p.start >= endTs) break;

    // Programme ended before our window.
    if (p.stop !== 0 && p.stop <= startTs) continue;

    results.push(p);
  }

  return results;
}
