// ── XMLTV parser ──────────────────────────────────────────────────────
//
// Uses fast-xml-parser for high-performance, streaming-friendly parsing.
// Handles the standard XMLTV DTD elements: <tv>, <channel>, <programme>.

import { XMLParser } from "fast-xml-parser";
import type { XmltvChannel, Programme, XmltvParseResult } from "./xmltv-types.js";

// ── Timestamp handling ────────────────────────────────────────────────

/**
 * Parse an XMLTV timestamp string into UTC epoch milliseconds.
 *
 * Accepted formats:
 *   "20260302180000 +0100"
 *   "20260302180000"          (assumed UTC)
 *   "2026-03-02T18:00:00Z"   (ISO 8601 fallback)
 *
 * Returns 0 if the value is missing or unparseable.
 */
export function parseXmltvTimestamp(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = raw.trim();

  // ── ISO 8601 or Date-parseable string ───────────────────────────
  if (s.includes("T") || s.includes("-")) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // ── XMLTV native: YYYYMMDDHHmmss [±HHMM] ──────────────────────
  const match = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!match) return 0;

  const [, yr, mo, dy, hh, mm, ss, tz] = match;
  // Build an ISO string so Date can handle it reliably.
  let iso = `${yr}-${mo}-${dy}T${hh}:${mm}:${ss}`;

  if (tz) {
    // Convert "+0100" → "+01:00"
    iso += `${tz.slice(0, 3)}:${tz.slice(3)}`;
  } else {
    iso += "Z"; // no offset → UTC
  }

  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

// ── XML parser configuration ──────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Preserve arrays even when there is only one child element.
  isArray: (tagName: string) => {
    const arrayTags = new Set([
      "channel",
      "programme",
      "display-name",
      "title",
      "sub-title",
      "desc",
      "category",
      "icon",
      "episode-num",
      "rating",
      "url",
    ]);
    return arrayTags.has(tagName);
  },
  // Don't trim — we'll handle whitespace ourselves.
  trimValues: true,
});

// ── Helpers to safely pull text from parsed nodes ─────────────────────

/** Normalise a node that might be a string, object with #text, or array. */
function textOf(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === "object" && node !== null) {
    const obj = node as Record<string, unknown>;
    if ("#text" in obj) return textOf(obj["#text"]);
  }
  return String(node).trim();
}

/** Pull all text values from an array-or-single node. */
function textsOf(node: unknown): string[] {
  if (node === null || node === undefined) return [];
  const arr = Array.isArray(node) ? node : [node];
  return arr.map(textOf).filter(Boolean);
}

/** Extract the "src" attribute from an <icon> array. */
function iconSrc(node: unknown): string {
  if (node === null || node === undefined) return "";
  const arr = Array.isArray(node) ? node : [node];
  for (const item of arr) {
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      const src = obj["@_src"];
      if (typeof src === "string") return src.trim();
    }
    if (typeof item === "string") return item.trim();
  }
  return "";
}

// ── Main parser ───────────────────────────────────────────────────────

/**
 * Parse an XMLTV document into structured channels and programmes.
 *
 * - Handles missing/malformed elements gracefully.
 * - Normalises all timestamps to UTC epoch milliseconds.
 */
export function parseXmltv(xmlText: string): XmltvParseResult {
  if (!xmlText.trim()) return { channels: [], programmes: [] };

  const doc = xmlParser.parse(xmlText);
  const tv = doc.tv ?? doc.TV ?? doc;

  // ── Channels ────────────────────────────────────────────────────
  const rawChannels: unknown[] = Array.isArray(tv.channel)
    ? tv.channel
    : tv.channel
      ? [tv.channel]
      : [];

  const channels: XmltvChannel[] = rawChannels.map((raw) => {
    const ch = raw as Record<string, unknown>;
    return {
      id: textOf(ch["@_id"]),
      displayNames: textsOf(ch["display-name"]),
      icon: iconSrc(ch["icon"]),
      url: textOf(Array.isArray(ch["url"]) ? ch["url"][0] : ch["url"]),
    };
  });

  // ── Programmes ──────────────────────────────────────────────────
  const rawProgrammes: unknown[] = Array.isArray(tv.programme)
    ? tv.programme
    : tv.programme
      ? [tv.programme]
      : [];

  const programmes: Programme[] = rawProgrammes.map((raw) => {
    const p = raw as Record<string, unknown>;

    // Episode number — prefer xmltv_ns, fall back to onscreen
    let episodeNum = "";
    const epNums = Array.isArray(p["episode-num"])
      ? p["episode-num"]
      : p["episode-num"]
        ? [p["episode-num"]]
        : [];
    for (const ep of epNums) {
      const obj = ep as Record<string, unknown>;
      const system = textOf(obj["@_system"]);
      const value = textOf(obj);
      if (value) {
        episodeNum = value;
        if (system === "xmltv_ns" || system === "onscreen") break;
      }
    }

    // Rating
    let rating = "";
    const ratingNode = Array.isArray(p["rating"]) ? p["rating"][0] : p["rating"];
    if (ratingNode && typeof ratingNode === "object") {
      rating = textOf((ratingNode as Record<string, unknown>)["value"]);
    }

    return {
      channelId: textOf(p["@_channel"]),
      start: parseXmltvTimestamp(textOf(p["@_start"])),
      stop: parseXmltvTimestamp(textOf(p["@_stop"])),
      titles: textsOf(p["title"]),
      subtitle: textOf(Array.isArray(p["sub-title"]) ? p["sub-title"][0] : p["sub-title"]),
      description: textOf(Array.isArray(p["desc"]) ? p["desc"][0] : p["desc"]),
      categories: textsOf(p["category"]),
      episodeNum,
      icon: iconSrc(p["icon"]),
      rating,
    };
  });

  return { channels, programmes };
}
