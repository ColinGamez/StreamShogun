// ── SQLite schema migrations ──────────────────────────────────────────
//
// Each migration has a monotonically increasing version number and raw
// SQL that runs inside a transaction.  Only migrations whose version is
// greater than the current DB version are applied.

export interface Migration {
  version: number;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      -- ── Playlists ──────────────────────────────────────────────────
      CREATE TABLE playlists (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        sourceType    TEXT NOT NULL CHECK (sourceType IN ('url', 'file')),
        sourceValue   TEXT NOT NULL,
        lastFetchedAt INTEGER NOT NULL DEFAULT 0
      );

      -- ── Channels ───────────────────────────────────────────────────
      CREATE TABLE channels (
        id          TEXT PRIMARY KEY,
        playlistId  TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        tvgId       TEXT NOT NULL DEFAULT '',
        name        TEXT NOT NULL,
        logo        TEXT NOT NULL DEFAULT '',
        groupTitle  TEXT NOT NULL DEFAULT '',
        streamUrl   TEXT NOT NULL,
        UNIQUE(playlistId, streamUrl)
      );

      CREATE INDEX idx_channels_playlist ON channels(playlistId);
      CREATE INDEX idx_channels_tvgId    ON channels(tvgId);

      -- ── EPG sources ────────────────────────────────────────────────
      CREATE TABLE epg_sources (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        sourceType    TEXT NOT NULL CHECK (sourceType IN ('url', 'file')),
        sourceValue   TEXT NOT NULL,
        lastFetchedAt INTEGER NOT NULL DEFAULT 0
      );

      -- ── Programmes (parsed from XMLTV) ─────────────────────────────
      --
      -- Rationale for storing parsed programmes instead of raw XML:
      --   1. SQL queries for getNowNext / getEpgRange are O(log n) via
      --      the channel+time index — far faster than re-parsing XML.
      --   2. Raw XMLTV files can be 20–50 MB; structured rows are more
      --      compact and don't need to be held in memory.
      --   3. Programme data maps naturally to a relational table with
      --      proper indexing on (channelId, start, stop).

      CREATE TABLE programmes (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        epgSourceId   TEXT NOT NULL REFERENCES epg_sources(id) ON DELETE CASCADE,
        channelId     TEXT NOT NULL,
        start         INTEGER NOT NULL,
        stop          INTEGER NOT NULL DEFAULT 0,
        title         TEXT NOT NULL DEFAULT '',
        subtitle      TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        categories    TEXT NOT NULL DEFAULT '[]',
        episodeNum    TEXT NOT NULL DEFAULT '',
        icon          TEXT NOT NULL DEFAULT '',
        rating        TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX idx_programmes_channel_time ON programmes(channelId, start, stop);
      CREATE INDEX idx_programmes_source       ON programmes(epgSourceId);

      -- ── Favorites ──────────────────────────────────────────────────
      CREATE TABLE favorites (
        channelId TEXT PRIMARY KEY
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- ── Settings (key-value store) ─────────────────────────────────
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- ── Watch history ──────────────────────────────────────────────
      CREATE TABLE watch_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        channelUrl  TEXT    NOT NULL,
        channelName TEXT    NOT NULL,
        channelLogo TEXT    NOT NULL DEFAULT '',
        groupTitle  TEXT    NOT NULL DEFAULT '',
        startedAt   INTEGER NOT NULL,
        stoppedAt   INTEGER NOT NULL DEFAULT 0,
        durationSec INTEGER NOT NULL DEFAULT 0,
        UNIQUE(channelUrl, startedAt)
      );

      CREATE INDEX idx_watch_history_channel ON watch_history(channelUrl);
      CREATE INDEX idx_watch_history_started ON watch_history(startedAt DESC);

      -- ── Default settings ───────────────────────────────────────────
      INSERT INTO settings (key, value) VALUES ('theme', 'dark');
      INSERT INTO settings (key, value) VALUES ('locale', 'en');
      INSERT INTO settings (key, value) VALUES ('autoRefreshEnabled', 'false');
      INSERT INTO settings (key, value) VALUES ('autoRefreshIntervalMin', '60');
      INSERT INTO settings (key, value) VALUES ('resumeOnLaunch', 'false');
      INSERT INTO settings (key, value) VALUES ('discordRpcEnabled', 'false');
      INSERT INTO settings (key, value) VALUES ('pipAlwaysOnTop', 'true');
    `,
  },
];
