// ── Database singleton ─────────────────────────────────────────────────
//
// Opens a SQLite database in the Electron userData directory and applies
// any pending migrations on startup.

import Database from "better-sqlite3";
import { app } from "electron";
import * as path from "path";
import { migrations } from "./migrations";

let db: Database.Database | null = null;

/** Return the open database handle. Throws if not yet initialised. */
export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialised — call initDatabase() first");
  return db;
}

/**
 * Open (or create) the database and run pending migrations.
 * Call once from `app.whenReady()`.
 */
export function initDatabase(): void {
  const dbPath = path.join(app.getPath("userData"), "stream-shogun.db");
  db = new Database(dbPath);

  // Performance & safety pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
}

/** Close the database cleanly (call on app quit). */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Migration runner ──────────────────────────────────────────────────

function runMigrations(database: Database.Database): void {
  // Ensure the version-tracking table exists
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = database.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM _migrations").get() as {
    v: number;
  };

  const currentVersion = row.v;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      database.transaction(() => {
        database.exec(migration.sql);
        database.prepare("INSERT INTO _migrations (version) VALUES (?)").run(migration.version);
      })();
    }
  }
}
