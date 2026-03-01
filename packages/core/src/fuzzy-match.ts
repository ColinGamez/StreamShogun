// ── Smart Channel ↔ EPG Matching (F3) ─────────────────────────────────
//
// Matches Channel.tvgId / Channel.name to XMLTV channel IDs using:
//   1. Exact ID match
//   2. Normalised name match (strip suffixes, case-insensitive)
//   3. Token-based Jaccard similarity for fuzzy matching
//
// All functions are pure and deterministic — safe for use in both
// the main process and the renderer.

/** Result of matching a channel to an EPG channel ID. */
export interface ChannelMatch {
  /** The channel URL (unique key). */
  channelUrl: string;
  /** The matched EPG channel ID, or empty string if no match. */
  epgChannelId: string;
  /** How the match was made. */
  method: "exact-id" | "normalised-name" | "fuzzy" | "none";
  /** Confidence score 0–1. 1 = perfect match. */
  confidence: number;
}

// ── Constants ─────────────────────────────────────────────────────────

/** Suffixes stripped during normalisation. */
const STRIP_SUFFIXES = /\s*\(?(?:HD|FHD|UHD|4K|SD|HEVC|H\.?265|H\.?264|MPEG[24]?|PLUS|\+1|\+2)\)?\s*/gi;

/** Characters removed during normalisation. */
const STRIP_CHARS = /[^a-z0-9\s]/g;

// ── Normalisation ─────────────────────────────────────────────────────

/** Normalise a channel name for comparison. */
export function normaliseChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(STRIP_SUFFIXES, " ")
    .replace(STRIP_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Break a normalised name into unique tokens (words). */
function tokenise(name: string): Set<string> {
  return new Set(name.split(" ").filter(Boolean));
}

// ── Similarity ────────────────────────────────────────────────────────

/** Jaccard similarity between two token sets (0–1). */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Matching engine ───────────────────────────────────────────────────

/** Minimum Jaccard score to consider a fuzzy match. */
const FUZZY_THRESHOLD = 0.5;

/**
 * Match an array of channels to EPG channel IDs.
 *
 * @param channels       Array of `{ url, tvgId, name }` objects.
 * @param epgChannelIds  Set (or array) of known EPG channel IDs.
 * @param epgDisplayNames Optional map of EPG channel ID → display names (for fuzzy matching).
 */
export function matchChannelsToEpg(
  channels: readonly { url: string; tvgId: string; name: string }[],
  epgChannelIds: readonly string[],
  epgDisplayNames?: ReadonlyMap<string, string[]>,
): ChannelMatch[] {
  // Build lookup structures
  const idSet = new Set(epgChannelIds);
  const normalisedIdMap = new Map<string, string>(); // normalised → original ID

  for (const id of epgChannelIds) {
    normalisedIdMap.set(normaliseChannelName(id), id);
  }

  // Build normalised display-name → ID map for fuzzy
  const normNameToId = new Map<string, { id: string; tokens: Set<string> }>();
  if (epgDisplayNames) {
    for (const [id, names] of epgDisplayNames) {
      for (const name of names) {
        const norm = normaliseChannelName(name);
        normNameToId.set(norm, { id, tokens: tokenise(norm) });
      }
    }
  }

  // Also index by normalised ID as a name
  for (const id of epgChannelIds) {
    const norm = normaliseChannelName(id);
    if (!normNameToId.has(norm)) {
      normNameToId.set(norm, { id, tokens: tokenise(norm) });
    }
  }

  const results: ChannelMatch[] = [];

  for (const ch of channels) {
    // 1. Exact ID match
    if (ch.tvgId && idSet.has(ch.tvgId)) {
      results.push({
        channelUrl: ch.url,
        epgChannelId: ch.tvgId,
        method: "exact-id",
        confidence: 1,
      });
      continue;
    }

    // 2. Normalised name match
    const normName = normaliseChannelName(ch.name);
    const normTvgId = ch.tvgId ? normaliseChannelName(ch.tvgId) : "";

    // Check normalised tvgId first
    if (normTvgId && normalisedIdMap.has(normTvgId)) {
      results.push({
        channelUrl: ch.url,
        epgChannelId: normalisedIdMap.get(normTvgId)!,
        method: "normalised-name",
        confidence: 0.95,
      });
      continue;
    }

    // Check normalised display name
    if (normNameToId.has(normName)) {
      results.push({
        channelUrl: ch.url,
        epgChannelId: normNameToId.get(normName)!.id,
        method: "normalised-name",
        confidence: 0.9,
      });
      continue;
    }

    // 3. Fuzzy match via Jaccard similarity
    const chTokens = tokenise(normName);
    let bestScore = 0;
    let bestId = "";

    for (const [, entry] of normNameToId) {
      const score = jaccardSimilarity(chTokens, entry.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestId = entry.id;
      }
    }

    if (bestScore >= FUZZY_THRESHOLD) {
      results.push({
        channelUrl: ch.url,
        epgChannelId: bestId,
        method: "fuzzy",
        confidence: Math.round(bestScore * 100) / 100,
      });
      continue;
    }

    // No match
    results.push({
      channelUrl: ch.url,
      epgChannelId: "",
      method: "none",
      confidence: 0,
    });
  }

  return results;
}
