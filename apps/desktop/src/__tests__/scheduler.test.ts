import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Fakes ─────────────────────────────────────────────────────────────
// scheduler.ts pulls in electron, ./db (better-sqlite3) and ./network-fetch
// at module scope; all three are mocked so the scheduling logic runs in
// plain Node. Real @stream-shogun/core parsers are used on purpose.

const fakes = vi.hoisted(() => {
  const send = vi.fn();
  const windows = [{ isDestroyed: () => false, webContents: { send } }];
  return {
    send,
    windows,
    settings: new Map<string, string>(),
    playlists: [] as {
      id: string;
      name: string;
      sourceType: "url" | "file";
      sourceValue: string;
      lastFetchedAt: number;
      channelCount: number;
    }[],
    epgSources: [] as {
      id: string;
      name: string;
      sourceType: "url" | "file";
      sourceValue: string;
      lastFetchedAt: number;
      programmeCount: number;
    }[],
    savePlaylist: vi.fn(),
    saveEpgSource: vi.fn(),
    fetchText: vi.fn(),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => fakes.windows },
  app: { getVersion: () => "0.0.0-test" },
}));

vi.mock("../db", () => ({
  getSetting: (key: string) => fakes.settings.get(key) ?? null,
  setSetting: (key: string, value: string) => void fakes.settings.set(key, value),
  listPlaylists: () => fakes.playlists,
  listEpgSources: () => fakes.epgSources,
  savePlaylist: fakes.savePlaylist,
  saveEpgSource: fakes.saveEpgSource,
}));

vi.mock("../network-fetch", () => ({
  fetchText: fakes.fetchText,
}));

import {
  getRefreshStatus,
  initScheduler,
  setRefreshInterval,
  stopScheduler,
  triggerRefresh,
} from "../scheduler";

const CHANNEL = "refresh:completed";

function urlPlaylist(id: string, url: string) {
  return {
    id,
    name: id,
    sourceType: "url" as const,
    sourceValue: url,
    lastFetchedAt: 0,
    channelCount: 0,
  };
}

function notifications(): { type?: string; [k: string]: unknown }[] {
  return fakes.send.mock.calls
    .filter(([channel]) => channel === CHANNEL)
    .map(([, payload]) => payload as { type?: string });
}

/** Let pending microtasks (and the sync head of doRefresh) settle. */
async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.settings.clear();
  fakes.playlists = [];
  fakes.epgSources = [];
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
});

describe("scheduler settings", () => {
  it("clamps the interval to 5 min – 24 h and persists it", () => {
    setRefreshInterval(1, false);
    expect(getRefreshStatus().intervalMin).toBe(5);
    expect(fakes.settings.get("autoRefreshIntervalMin")).toBe("5");

    setRefreshInterval(99_999, false);
    expect(getRefreshStatus().intervalMin).toBe(1440);

    setRefreshInterval(30, false);
    expect(getRefreshStatus().intervalMin).toBe(30);
    expect(fakes.settings.get("autoRefreshEnabled")).toBe("false");
  });

  it("rejects a non-finite interval instead of arming setInterval with NaN", () => {
    expect(() => setRefreshInterval(Number.NaN, false)).toThrow("finite");
    expect(() => setRefreshInterval(Number.POSITIVE_INFINITY, false)).toThrow("finite");
  });

  it("restores enabled state and interval from persisted settings", () => {
    fakes.settings.set("autoRefreshEnabled", "true");
    fakes.settings.set("autoRefreshIntervalMin", "45");
    initScheduler();
    expect(getRefreshStatus().enabled).toBe(true);
    expect(getRefreshStatus().intervalMin).toBe(45);
  });

  it("falls back to 60 min when the persisted interval is garbage", () => {
    fakes.settings.set("autoRefreshIntervalMin", "not-a-number");
    initScheduler();
    expect(getRefreshStatus().enabled).toBe(false);
    expect(getRefreshStatus().intervalMin).toBe(60);
  });
});

describe("scheduler refresh cycle", () => {
  it("refreshes URL sources only and reports per-source stats", async () => {
    fakes.playlists = [
      urlPlaylist("pl-url", "https://example.com/list.m3u"),
      { ...urlPlaylist("pl-file", "C:\\local\\list.m3u"), sourceType: "file" },
    ];
    fakes.epgSources = [
      {
        id: "epg-url",
        name: "epg-url",
        sourceType: "url",
        sourceValue: "https://example.com/guide.xml",
        lastFetchedAt: 0,
        programmeCount: 0,
      },
    ];
    fakes.fetchText.mockImplementation(async (url: string) =>
      url.endsWith(".m3u")
        ? '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="G",Alpha\nhttp://s/a\n'
        : "<tv></tv>",
    );

    await triggerRefresh();

    expect(fakes.fetchText).toHaveBeenCalledTimes(2);
    expect(fakes.fetchText.mock.calls.map(([u]) => u)).not.toContain("C:\\local\\list.m3u");
    expect(fakes.savePlaylist).toHaveBeenCalledTimes(1);
    expect(fakes.savePlaylist.mock.calls[0][3]).toHaveLength(1); // parsed channel
    expect(fakes.saveEpgSource).toHaveBeenCalledTimes(1);

    const notes = notifications();
    expect(notes[0]?.type).toBe("start");
    const complete = notes.find((n) => n.type === "complete");
    expect(complete).toMatchObject({
      stats: { playlistOk: 1, playlistFail: 0, epgOk: 1, epgFail: 0 },
    });
    expect(getRefreshStatus().lastRefreshAt).toBeGreaterThan(0);
  });

  it("counts a failed source without failing the whole run", async () => {
    fakes.playlists = [
      urlPlaylist("pl-ok", "https://example.com/ok.m3u"),
      urlPlaylist("pl-bad", "https://example.com/bad.m3u"),
    ];
    fakes.fetchText.mockImplementation(async (url: string) => {
      if (url.includes("bad")) throw new Error("HTTP 403");
      return "#EXTM3U\n";
    });

    await triggerRefresh();

    const complete = notifications().find((n) => n.type === "complete");
    expect(complete).toMatchObject({
      stats: { playlistOk: 1, playlistFail: 1, epgOk: 0, epgFail: 0 },
    });
  });

  it("ignores a manual trigger while a refresh is already in flight", async () => {
    fakes.playlists = [urlPlaylist("pl-url", "https://example.com/list.m3u")];
    let release!: (text: string) => void;
    fakes.fetchText.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));

    const first = triggerRefresh();
    await flush();
    const second = await triggerRefresh(); // must be a no-op, not a second run

    expect(second).toBeUndefined();
    expect(fakes.fetchText).toHaveBeenCalledTimes(1);

    release("#EXTM3U\n");
    await first;
    expect(fakes.fetchText).toHaveBeenCalledTimes(1);
  });

  it("reports a watchdog timeout and never overwrites it with a late completion", async () => {
    vi.useFakeTimers();
    fakes.playlists = [urlPlaylist("pl-url", "https://example.com/slow.m3u")];
    let release!: (text: string) => void;
    fakes.fetchText.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));

    const run = triggerRefresh();
    await vi.advanceTimersByTimeAsync(0); // let doRefresh reach its await
    await vi.advanceTimersByTimeAsync(60_000); // fire the watchdog

    const errorNote = notifications().find((n) => n.type === "error");
    expect(errorNote).toMatchObject({ error: "Refresh timed out" });

    release("#EXTM3U\n");
    await vi.advanceTimersByTimeAsync(0);
    await run;

    // The late completion must not emit a "complete" event after the error.
    expect(notifications().some((n) => n.type === "complete")).toBe(false);
    // ...but the guard is released so the next cycle can run.
    expect(getRefreshStatus().refreshing).toBe(false);
  });
});
