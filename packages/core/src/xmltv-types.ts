// ── XMLTV / EPG types ─────────────────────────────────────────────────

/** A channel entry from the XMLTV <channel> element. */
export interface XmltvChannel {
  /** The channel id attribute (matches programme @channel). */
  id: string;
  /** Display names (there can be multiple per channel). */
  displayNames: string[];
  /** Channel icon URL, if present. */
  icon: string;
  /** Optional URL associated with the channel. */
  url: string;
}

/** A single programme from an XMLTV <programme> element. */
export interface Programme {
  /** Channel id this programme belongs to. */
  channelId: string;
  /** Programme start time (UTC epoch ms). */
  start: number;
  /** Programme stop time (UTC epoch ms). 0 if absent. */
  stop: number;
  /** Programme title(s). First is primary. */
  titles: string[];
  /** Short description / subtitle. */
  subtitle: string;
  /** Full description. */
  description: string;
  /** Category / genre tags. */
  categories: string[];
  /** Episode numbering string (e.g. "S01E03", raw xmltv_ns, etc.). */
  episodeNum: string;
  /** Icon / poster URL. */
  icon: string;
  /** Star rating as a string (e.g. "7.5/10"). */
  rating: string;
}

/** Result of parsing an XMLTV document. */
export interface XmltvParseResult {
  channels: XmltvChannel[];
  programmes: Programme[];
}

/**
 * An efficient lookup index: channelId → programmes sorted by start time.
 *
 * Implemented as a plain Map so it serialises nicely and has O(1) channel
 * access + O(log n) binary-search for time-based lookups.
 */
export type EpgIndex = Map<string, Programme[]>;
