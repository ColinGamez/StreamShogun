// ── Repository layer — all CRUD for the SQLite store ──────────────────
//
// Every public function is synchronous (better-sqlite3 is sync) and
// returns plain-object DTOs that survive Electron's structured-clone IPC.

import { getDb } from "./database";
import type { Channel, Programme, LicenseStatus, LicenseValidationState } from "@stream-shogun/core";
import { validateLicenseKeyFormat, DEFAULT_LICENSE_STATUS } from "@stream-shogun/core";
import * as crypto from "crypto";

// ── Row types (DB rows → plain objects) ───────────────────────────────

export interface PlaylistRow {
  id: string;
  name: string;
  sourceType: "url" | "file";
  sourceValue: string;
  lastFetchedAt: number;
  channelCount: number;
}

export interface ChannelRow {
  id: string;
  playlistId: string;
  tvgId: string;
  name: string;
  logo: string;
  groupTitle: string;
  streamUrl: string;
}

export interface EpgSourceRow {
  id: string;
  name: string;
  sourceType: "url" | "file";
  sourceValue: string;
  lastFetchedAt: number;
  programmeCount: number;
}

export interface ProgrammeRow {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  subtitle: string;
  description: string;
  categories: string[];
  episodeNum: string;
  icon: string;
  rating: string;
}

export interface NowNextResult {
  now: ProgrammeRow | null;
  next: ProgrammeRow | null;
}

// ── Watch history row type ────────────────────────────────────────────

export interface WatchHistoryRow {
  id: number;
  channelUrl: string;
  channelName: string;
  channelLogo: string;
  groupTitle: string;
  startedAt: number;
  stoppedAt: number;
  durationSec: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Deterministic ID from a composite key. */
function deterministicId(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}

/** Convert a raw DB programme row into the public DTO. */
function toProgrammeRow(row: Record<string, unknown>): ProgrammeRow {
  return {
    channelId: row.channelId as string,
    start: row.start as number,
    stop: row.stop as number,
    title: row.title as string,
    subtitle: row.subtitle as string,
    description: row.description as string,
    categories: JSON.parse((row.categories as string) || "[]"),
    episodeNum: row.episodeNum as string,
    icon: row.icon as string,
    rating: row.rating as string,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Playlists
// ═══════════════════════════════════════════════════════════════════════

/** Upsert a playlist row and replace all its channels. */
export function savePlaylist(
  name: string,
  sourceType: "url" | "file",
  sourceValue: string,
  channels: Channel[],
): PlaylistRow {
  const db = getDb();
  const playlistId = deterministicId(sourceType, sourceValue);
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO playlists (id, name, sourceType, sourceValue, lastFetchedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name          = excluded.name,
        lastFetchedAt = excluded.lastFetchedAt
    `,
    ).run(playlistId, name, sourceType, sourceValue, now);

    // Wipe old channels for this playlist and re-insert
    db.prepare("DELETE FROM channels WHERE playlistId = ?").run(playlistId);

    const insert = db.prepare(`
      INSERT INTO channels (id, playlistId, tvgId, name, logo, groupTitle, streamUrl)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ch of channels) {
      const channelId = deterministicId(playlistId, ch.url);
      insert.run(channelId, playlistId, ch.tvgId, ch.name, ch.tvgLogo, ch.groupTitle, ch.url);
    }
  })();

  return {
    id: playlistId,
    name,
    sourceType,
    sourceValue,
    lastFetchedAt: now,
    channelCount: channels.length,
  };
}

/** List all playlists with channel counts. */
export function listPlaylists(): PlaylistRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT p.*, COUNT(c.id) AS channelCount
      FROM playlists p
      LEFT JOIN channels c ON c.playlistId = p.id
      GROUP BY p.id
      ORDER BY p.name
    `,
    )
    .all() as PlaylistRow[];
}

/** Delete a playlist and its channels (cascade). */
export function removePlaylist(id: string): void {
  getDb().prepare("DELETE FROM playlists WHERE id = ?").run(id);
}

// ═══════════════════════════════════════════════════════════════════════
//  Channels
// ═══════════════════════════════════════════════════════════════════════

/**
 * List channels — optionally filter by playlistId.
 * Returns Channel-compatible objects (field names match the core type).
 */
export function listChannels(playlistId?: string): ChannelRow[] {
  const db = getDb();
  if (playlistId) {
    return db
      .prepare("SELECT * FROM channels WHERE playlistId = ? ORDER BY name")
      .all(playlistId) as ChannelRow[];
  }
  return db.prepare("SELECT * FROM channels ORDER BY name").all() as ChannelRow[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Favorites
// ═══════════════════════════════════════════════════════════════════════

/** Add or remove a channel from favorites. */
export function setFavorite(channelId: string, isFavorite: boolean): void {
  const db = getDb();
  if (isFavorite) {
    db.prepare("INSERT OR IGNORE INTO favorites (channelId) VALUES (?)").run(channelId);
  } else {
    db.prepare("DELETE FROM favorites WHERE channelId = ?").run(channelId);
  }
}

/** Return all favorited channel IDs. */
export function listFavorites(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT channelId FROM favorites").all() as { channelId: string }[];
  return rows.map((r) => r.channelId);
}

// ═══════════════════════════════════════════════════════════════════════
//  EPG Sources + Programmes
// ═══════════════════════════════════════════════════════════════════════

/**
 * Upsert an EPG source and replace all its programmes with the parsed
 * data.  We store **parsed** programmes rather than raw XML because:
 *
 *  1. `getNowNext` and `getEpgRange` can use indexed SQL — O(log n)
 *     versus re-parsing multi-MB XML on every query.
 *  2. Programme data maps cleanly to relational columns; raw XML would
 *     be an opaque blob requiring a full parse to answer any question.
 *  3. Storage is more compact: only the fields we need are kept, and
 *     SQLite pages compress well with WAL mode.
 */
export function saveEpgSource(
  name: string,
  sourceType: "url" | "file",
  sourceValue: string,
  programmes: Programme[],
): EpgSourceRow {
  const db = getDb();
  const sourceId = deterministicId(sourceType, sourceValue);
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO epg_sources (id, name, sourceType, sourceValue, lastFetchedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name          = excluded.name,
        lastFetchedAt = excluded.lastFetchedAt
    `,
    ).run(sourceId, name, sourceType, sourceValue, now);

    // Replace programmes for this source
    db.prepare("DELETE FROM programmes WHERE epgSourceId = ?").run(sourceId);

    const insert = db.prepare(`
      INSERT INTO programmes
        (epgSourceId, channelId, start, stop, title, subtitle, description,
         categories, episodeNum, icon, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of programmes) {
      insert.run(
        sourceId,
        p.channelId,
        p.start,
        p.stop,
        p.titles[0] ?? "",
        p.subtitle,
        p.description,
        JSON.stringify(p.categories),
        p.episodeNum,
        p.icon,
        p.rating,
      );
    }
  })();

  return {
    id: sourceId,
    name,
    sourceType,
    sourceValue,
    lastFetchedAt: now,
    programmeCount: programmes.length,
  };
}

/** List all EPG sources with programme counts. */
export function listEpgSources(): EpgSourceRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT e.*, COUNT(p.id) AS programmeCount
      FROM epg_sources e
      LEFT JOIN programmes p ON p.epgSourceId = e.id
      GROUP BY e.id
      ORDER BY e.name
    `,
    )
    .all() as EpgSourceRow[];
}

/** Delete an EPG source and its programmes (cascade). */
export function removeEpgSource(id: string): void {
  getDb().prepare("DELETE FROM epg_sources WHERE id = ?").run(id);
}

// ═══════════════════════════════════════════════════════════════════════
//  EPG Queries
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the currently-airing programme and (optionally) the next one
 * for a given channelId.  Uses the compound index on
 * `(channelId, start, stop)`.
 */
export function getNowNext(channelId: string, nowMs?: number): NowNextResult {
  const db = getDb();
  const now = nowMs ?? Date.now();

  const nowRow = db
    .prepare(
      `
      SELECT * FROM programmes
      WHERE channelId = ? AND start <= ? AND stop > ?
      ORDER BY start DESC
      LIMIT 1
    `,
    )
    .get(channelId, now, now) as Record<string, unknown> | undefined;

  let nextRow: Record<string, unknown> | undefined;
  if (nowRow) {
    // Next programme starts at or after the current one ends
    nextRow = db
      .prepare(
        `
        SELECT * FROM programmes
        WHERE channelId = ? AND start >= ?
        ORDER BY start ASC
        LIMIT 1
      `,
      )
      .get(channelId, nowRow.stop as number) as Record<string, unknown> | undefined;
  } else {
    // Nothing airing now — find the nearest upcoming programme
    nextRow = db
      .prepare(
        `
        SELECT * FROM programmes
        WHERE channelId = ? AND start > ?
        ORDER BY start ASC
        LIMIT 1
      `,
      )
      .get(channelId, now) as Record<string, unknown> | undefined;
  }

  return {
    now: nowRow ? toProgrammeRow(nowRow) : null,
    next: nextRow ? toProgrammeRow(nextRow) : null,
  };
}

/**
 * Get all programmes for a channel whose time range overlaps
 * `[startMs, stopMs)`.  Results are sorted by start time.
 */
export function getEpgRange(channelId: string, startMs: number, stopMs: number): ProgrammeRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT * FROM programmes
      WHERE channelId = ? AND stop > ? AND start < ?
      ORDER BY start ASC
    `,
    )
    .all(channelId, startMs, stopMs) as Record<string, unknown>[];
  return rows.map(toProgrammeRow);
}

// ═══════════════════════════════════════════════════════════════════════
//  Settings (F8)
// ═══════════════════════════════════════════════════════════════════════

/** Retrieve all settings as a key-value record. */
export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}

/** Get a single setting value. */
export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/** Upsert a setting value. */
export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

// ═══════════════════════════════════════════════════════════════════════
//  Watch History (F4)
// ═══════════════════════════════════════════════════════════════════════

/** Maximum rows to keep in watch_history. */
const MAX_WATCH_HISTORY_ROWS = 500;

/** Record a watch session and prune old rows beyond the limit. */
export function saveWatchSession(
  channelUrl: string,
  channelName: string,
  channelLogo: string,
  groupTitle: string,
  startedAt: number,
  stoppedAt: number,
  durationSec: number,
): WatchHistoryRow {
  const db = getDb();

  const row = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO watch_history
           (channelUrl, channelName, channelLogo, groupTitle, startedAt, stoppedAt, durationSec)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(channelUrl, startedAt) DO UPDATE SET
           stoppedAt   = excluded.stoppedAt,
           durationSec = excluded.durationSec`,
      )
      .run(channelUrl, channelName, channelLogo, groupTitle, startedAt, stoppedAt, durationSec);

    // Prune old rows beyond the limit
    db.prepare(
      `DELETE FROM watch_history WHERE id NOT IN (
         SELECT id FROM watch_history ORDER BY startedAt DESC LIMIT ?
       )`,
    ).run(MAX_WATCH_HISTORY_ROWS);

    return {
      id: Number(info.lastInsertRowid),
      channelUrl,
      channelName,
      channelLogo,
      groupTitle,
      startedAt,
      stoppedAt,
      durationSec,
    };
  })();

  return row;
}

/** List recent watch sessions. */
export function listWatchHistory(limit = 50): WatchHistoryRow[] {
  return getDb()
    .prepare("SELECT * FROM watch_history ORDER BY startedAt DESC LIMIT ?")
    .all(limit) as WatchHistoryRow[];
}

/** Get the most recently watched channel. */
export function getLastWatched(): WatchHistoryRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM watch_history ORDER BY startedAt DESC LIMIT 1")
      .get() as WatchHistoryRow | undefined) ?? null
  );
}

/** Clear all watch history. */
export function clearWatchHistory(): void {
  getDb().prepare("DELETE FROM watch_history").run();
}

// ═══════════════════════════════════════════════════════════════════════
//  License / Pro (Monetization)
// ═══════════════════════════════════════════════════════════════════════

/** Retrieve the current license status from settings. */
export function getLicenseStatus(): LicenseStatus {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('isProEnabled', 'licenseKey', 'licenseValidationState')")
    .all() as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    isProEnabled: map.isProEnabled === "true",
    licenseKey: map.licenseKey ?? DEFAULT_LICENSE_STATUS.licenseKey,
    validationState: (map.licenseValidationState as LicenseValidationState) ?? DEFAULT_LICENSE_STATUS.validationState,
  };
}

/** Store a license key and run offline format validation. */
export function setLicenseKey(key: string): LicenseStatus {
  const db = getDb();
  const trimmed = key.trim();

  const validationState: LicenseValidationState =
    trimmed === "" ? "none" : validateLicenseKeyFormat(trimmed) ? "valid" : "invalid";

  const isProEnabled = validationState === "valid";

  db.transaction(() => {
    const upsert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    upsert.run("licenseKey", trimmed);
    upsert.run("licenseValidationState", validationState);
    upsert.run("isProEnabled", String(isProEnabled));
  })();

  return { isProEnabled, licenseKey: trimmed, validationState };
}

/** Manually toggle Pro mode (for dev / testing). */
export function setProEnabled(enabled: boolean): LicenseStatus {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('isProEnabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(enabled));

  return getLicenseStatus();
}
