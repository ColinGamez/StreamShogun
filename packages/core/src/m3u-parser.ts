// ── M3U / M3U8 playlist parser ────────────────────────────────────────
//
// Handles the most common IPTV M3U flavours:
//   #EXTM3U header (with optional x-tvg-url, url-tvg, etc.)
//   #EXTINF:-1 tvg-id="…" tvg-name="…" tvg-logo="…" group-title="…", Name
//   http(s)://…  or  rtmp://… / rtsp://… / udp://…
//
// Gracefully skips blank lines, comments, and unknown directives.

import type { Channel, Playlist, EpgSource } from "./iptv-types.js";

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Extract key="value" or key=value pairs from a string.
 * Supports both double-quoted and unquoted values.
 */
function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match:  key="value"  or  key=non-whitespace-value
  const re = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      attrs[m[1].toLowerCase()] = m[2];
    } else if (m[3] !== undefined) {
      attrs[m[3].toLowerCase()] = m[4];
    }
  }
  return attrs;
}

/**
 * Extract the display-name portion from an #EXTINF line.
 * The name appears after the last comma that isn't inside quotes.
 */
function extractDisplayName(line: string): string {
  // Strategy: find the last comma that is *not* inside a quoted attribute value.
  // We do this by scanning for the last comma outside of paired double-quotes.
  let inQuotes = false;
  let lastCommaIdx = -1;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    if (line[i] === "," && !inQuotes) lastCommaIdx = i;
  }

  if (lastCommaIdx === -1) return "";
  return line.slice(lastCommaIdx + 1).trim();
}

/**
 * Parse the duration integer from "#EXTINF:<dur> …".
 * Returns -1 if not parseable (common for live streams).
 */
function parseDuration(raw: string): number {
  const match = raw.match(/#EXTINF:\s*(-?\d+)/i);
  if (!match) return -1;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : -1;
}

/** True if the line looks like a stream URL. */
function isStreamUrl(line: string): boolean {
  return /^https?:\/\/|^rtmp:\/\/|^rtsp:\/\/|^udp:\/\/|^rtp:\/\/|^mms:\/\//i.test(line);
}

/** Extract EPG source URLs from header attributes. */
function extractEpgSources(attrs: Record<string, string>): EpgSource[] {
  const sources: EpgSource[] = [];
  const epgKeys = ["x-tvg-url", "url-tvg", "tvg-url"];

  for (const key of epgKeys) {
    const val = attrs[key];
    if (!val) continue;
    // Some headers pack multiple URLs space-separated or comma-separated.
    const urls = val.split(/[,\s]+/).filter((u) => u.startsWith("http"));
    for (const url of urls) {
      sources.push({ url: url.trim(), label: key });
    }
  }
  return sources;
}

// ── Known #EXTINF attribute keys we handle explicitly ─────────────────
const KNOWN_KEYS = new Set(["tvg-id", "tvg-name", "tvg-logo", "group-title"]);

// ── Main parser ───────────────────────────────────────────────────────

/**
 * Parse an M3U/M3U8 playlist string into a structured `Playlist` object.
 *
 * - Normalises `\r\n` / `\r` to `\n`.
 * - Trims every line; skips empty lines.
 * - Gracefully skips malformed segments (logged in `malformedLines`).
 */
export function parseM3U(text: string): Playlist {
  // Normalise line endings & split
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  const rawLineCount = rawLines.length;

  const channels: Channel[] = [];
  const malformedLines: string[] = [];
  let headerAttrs: Record<string, string> = {};
  let epgSources: EpgSource[] = [];

  // State: the most-recently-seen #EXTINF data waiting for a URL line.
  let pendingExtinf: {
    duration: number;
    name: string;
    tvgId: string;
    tvgName: string;
    tvgLogo: string;
    groupTitle: string;
    extras: Record<string, string>;
  } | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    // Skip empty lines
    if (line === "") continue;

    // ── #EXTM3U header ─────────────────────────────────────────────
    if (/^#EXTM3U/i.test(line)) {
      headerAttrs = parseAttributes(line);
      epgSources = extractEpgSources(headerAttrs);
      continue;
    }

    // ── #EXTINF line ───────────────────────────────────────────────
    if (/^#EXTINF:/i.test(line)) {
      const duration = parseDuration(line);
      const attrs = parseAttributes(line);
      const displayName = extractDisplayName(line);

      const tvgId = attrs["tvg-id"] ?? "";
      const tvgName = attrs["tvg-name"] ?? "";
      const tvgLogo = attrs["tvg-logo"] ?? "";
      const groupTitle = attrs["group-title"] ?? "";

      // Collect extra attributes not in the known set.
      const extras: Record<string, string> = {};
      for (const [k, v] of Object.entries(attrs)) {
        if (!KNOWN_KEYS.has(k)) extras[k] = v;
      }

      pendingExtinf = {
        duration,
        name: displayName,
        tvgId,
        tvgName,
        tvgLogo,
        groupTitle,
        extras,
      };
      continue;
    }

    // ── Other directives / comments → skip ─────────────────────────
    if (line.startsWith("#")) {
      // Unknown directive – not an error, just not something we parse.
      continue;
    }

    // ── URL line ───────────────────────────────────────────────────
    if (isStreamUrl(line) || line.endsWith(".m3u8") || line.endsWith(".ts")) {
      if (pendingExtinf) {
        // Name fallback: tvg-name → display name → tvg-id → "Unnamed"
        const resolvedName =
          pendingExtinf.name || pendingExtinf.tvgName || pendingExtinf.tvgId || "Unnamed Channel";

        channels.push({
          tvgId: pendingExtinf.tvgId,
          tvgName: pendingExtinf.tvgName || resolvedName,
          name: resolvedName,
          tvgLogo: pendingExtinf.tvgLogo,
          groupTitle: pendingExtinf.groupTitle,
          url: line,
          duration: pendingExtinf.duration,
          extras: pendingExtinf.extras,
        });
        pendingExtinf = null;
      } else {
        // Bare URL without preceding #EXTINF – still valid.
        channels.push({
          tvgId: "",
          tvgName: "",
          name: "Unnamed Channel",
          tvgLogo: "",
          groupTitle: "",
          url: line,
          duration: -1,
          extras: {},
        });
      }
      continue;
    }

    // ── Anything else is malformed ─────────────────────────────────
    malformedLines.push(`L${i + 1}: ${line}`);
    // Reset pending EXTINF so we don't associate stale data with the next URL.
    pendingExtinf = null;
  }

  return {
    channels,
    headerAttrs,
    epgSources,
    rawLineCount,
    malformedLines,
  };
}
