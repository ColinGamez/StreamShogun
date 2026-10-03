import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "" },
}));

import { runMigrations } from "../db/database";
import { migrations } from "../db/migrations";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("NODE_MODULE_VERSION")) return false;
    throw error;
  }
}

describe.skipIf(!nativeSqliteAvailable())("desktop database upgrades", () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it("preserves user settings and library data across schema upgrades", () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");

    runMigrations(
      database,
      migrations.filter((migration) => migration.version <= 2),
    );
    database.prepare("UPDATE settings SET value = ? WHERE key = ?").run("light", "theme");
    database
      .prepare(
        "INSERT INTO playlists (id, name, sourceType, sourceValue, lastFetchedAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run("playlist-1", "My channels", "url", "https://example.com/list.m3u", 1234);

    runMigrations(database);

    const settings = Object.fromEntries(
      (
        database.prepare("SELECT key, value FROM settings").all() as {
          key: string;
          value: string;
        }[]
      ).map((row) => [row.key, row.value]),
    );
    const playlist = database
      .prepare("SELECT name, sourceValue FROM playlists WHERE id = ?")
      .get("playlist-1");
    const appliedVersions = (
      database.prepare("SELECT version FROM _migrations ORDER BY version").all() as {
        version: number;
      }[]
    ).map((row) => row.version);

    expect(settings.theme).toBe("light");
    expect(settings.isProEnabled).toBe("false");
    expect(playlist).toEqual({
      name: "My channels",
      sourceValue: "https://example.com/list.m3u",
    });
    expect(appliedVersions).toEqual([1, 2, 3]);

    runMigrations(database);
    expect(database.prepare("SELECT COUNT(*) AS count FROM _migrations").get()).toEqual({
      count: 3,
    });
  });

  it("rolls back a failed migration without recording its version", () => {
    database = new Database(":memory:");
    expect(() =>
      runMigrations(database!, [{ version: 1, sql: "CREATE TABLE example (id); INVALID SQL;" }]),
    ).toThrow();

    expect(database.prepare("SELECT COUNT(*) AS count FROM _migrations").get()).toEqual({
      count: 0,
    });
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'example'")
        .get(),
    ).toBeUndefined();
  });
});
