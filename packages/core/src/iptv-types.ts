// ── IPTV / M3U types ──────────────────────────────────────────────────

/** A single channel parsed from an M3U playlist. */
export interface Channel {
  /** tvg-id attribute (e.g. "BBC1.uk"). Empty string if absent. */
  tvgId: string;
  /** tvg-name attribute. Falls back to the #EXTINF display name. */
  tvgName: string;
  /** Channel display name from the #EXTINF line (after the comma). */
  name: string;
  /** tvg-logo URL. Empty string if absent. */
  tvgLogo: string;
  /** group-title attribute. Empty string if absent. */
  groupTitle: string;
  /** Stream URL (may be .m3u8, .ts, http, etc.). */
  url: string;
  /** Raw duration value from #EXTINF (commonly -1 for live). */
  duration: number;
  /** Any extra key=value attributes not covered above. */
  extras: Record<string, string>;
}

/** Represents a parsed M3U/M3U8 playlist. */
export interface Playlist {
  /** Channels in order of appearance. */
  channels: Channel[];
  /** #EXTM3U header attributes (e.g. x-tvg-url). */
  headerAttrs: Record<string, string>;
  /** EPG sources discovered from the header. */
  epgSources: EpgSource[];
  /** Raw line count of the input (for diagnostics). */
  rawLineCount: number;
  /** Lines that could not be parsed. */
  malformedLines: string[];
}

/** An EPG (Electronic Program Guide) source extracted from the header. */
export interface EpgSource {
  url: string;
  /** Optional label derived from the attribute name. */
  label: string;
}

/** Describes where a playlist can be loaded from. */
export interface PlaylistSource {
  /** User-facing label. */
  name: string;
  /** URL or local file path. */
  location: string;
  /** Whether this is a remote URL or a local path. */
  type: "url" | "file";
  /** When the source was last fetched (epoch ms). 0 if never. */
  lastFetched: number;
}
