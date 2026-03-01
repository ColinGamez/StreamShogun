// ── Multi-EPG Merge (F2) ──────────────────────────────────────────────
//
// Merges programme arrays from multiple EPG sources into a unified
// index.  When programmes from different sources overlap on the same
// channel + time, the source with the higher priority (later in the
// sources array) wins.
//
// Each merged programme carries a `sourceId` tag so the UI can display
// a source badge.

import type { Programme } from "./xmltv-types.js";

/** A programme annotated with its originating EPG source. */
export interface TaggedProgramme extends Programme {
  /** The EPG source ID this programme came from. */
  sourceId: string;
  /** Human-readable source name (for badge display). */
  sourceName: string;
}

/** Input: programmes grouped by source. */
export interface EpgSourceBatch {
  sourceId: string;
  sourceName: string;
  programmes: Programme[];
}

/**
 * Merge multiple EPG source batches into a single Map keyed by channelId.
 *
 * Conflict resolution — when two programmes from different sources
 * cover the same channel at overlapping times, the source that appears
 * **later** in the `sources` array wins (higher priority).
 *
 * The returned programmes for each channel are sorted by start time.
 */
export function mergeEpgSources(sources: EpgSourceBatch[]): Map<string, TaggedProgramme[]> {
  // Step 1: Collect all tagged programmes grouped by channel
  const byChannel = new Map<string, TaggedProgramme[]>();

  for (const src of sources) {
    for (const prog of src.programmes) {
      const tagged: TaggedProgramme = {
        ...prog,
        sourceId: src.sourceId,
        sourceName: src.sourceName,
      };

      let arr = byChannel.get(prog.channelId);
      if (!arr) {
        arr = [];
        byChannel.set(prog.channelId, arr);
      }
      arr.push(tagged);
    }
  }

  // Build source priority map (higher index = higher priority)
  const priority = new Map<string, number>();
  for (let i = 0; i < sources.length; i++) {
    priority.set(sources[i].sourceId, i);
  }

  // Step 2: For each channel, resolve overlaps
  for (const [channelId, progs] of byChannel) {
    // Sort by start time, then by priority (higher priority last)
    progs.sort((a, b) => {
      const d = a.start - b.start;
      if (d !== 0) return d;
      return (priority.get(a.sourceId) ?? 0) - (priority.get(b.sourceId) ?? 0);
    });

    // Remove programmes that are completely covered by a higher-priority programme
    const merged = resolveOverlaps(progs, priority);
    byChannel.set(channelId, merged);
  }

  return byChannel;
}

/**
 * Given a sorted array of tagged programmes for a single channel,
 * remove lower-priority programmes that overlap with higher-priority ones.
 */
function resolveOverlaps(
  progs: TaggedProgramme[],
  priority: Map<string, number>,
): TaggedProgramme[] {
  if (progs.length <= 1) return progs;

  const result: TaggedProgramme[] = [];

  for (const prog of progs) {
    if (result.length === 0) {
      result.push(prog);
      continue;
    }

    const last = result[result.length - 1];
    const lastEnd = last.stop || last.start + 30 * 60_000;

    // No overlap — just append
    if (prog.start >= lastEnd) {
      result.push(prog);
      continue;
    }

    // Overlap detected — higher priority wins
    const lastPri = priority.get(last.sourceId) ?? 0;
    const progPri = priority.get(prog.sourceId) ?? 0;

    if (progPri > lastPri) {
      // New programme has higher priority — it replaces the overlapping portion
      // If the old programme started earlier, keep the non-overlapping head
      if (last.start < prog.start) {
        result[result.length - 1] = { ...last, stop: prog.start };
      } else {
        result.pop();
      }
      result.push(prog);
    } else if (progPri === lastPri) {
      // Same source priority — keep both (natural ordering)
      if (prog.start >= lastEnd) {
        result.push(prog);
      }
      // If completely overlapping from same source, skip duplicate
    }
    // Lower priority new programme — skip it (existing wins)
  }

  // Remove any zero-duration remnants
  return result.filter((p) => {
    const end = p.stop || p.start + 30 * 60_000;
    return end > p.start;
  });
}

/**
 * Convert a merged Map into the serialised `Record<string, Programme[]>`
 * format used by the UI store.
 */
export function serializeMergedEpg(
  merged: Map<string, TaggedProgramme[]>,
): Record<string, TaggedProgramme[]> {
  const obj: Record<string, TaggedProgramme[]> = {};
  for (const [key, value] of merged) {
    obj[key] = value;
  }
  return obj;
}
