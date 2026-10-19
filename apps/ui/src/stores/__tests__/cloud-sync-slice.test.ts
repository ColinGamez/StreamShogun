import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import type { CloudSyncSlice } from "../slices/cloud-sync-slice";

// ── Fakes ─────────────────────────────────────────────────────────────
// Bridge and the library-slice's persistFavorites are mocked; persistence
// keeps real loadJson/saveJson over an in-memory map (node env).

const fakes = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  persistFavorites: vi.fn(),
  bridge: {
    cloudSyncPull: vi.fn(),
    cloudSyncPush: vi.fn(),
    dbSetSetting: vi.fn(async () => ({ ok: true as const, data: null })),
  },
}));

vi.mock("../../lib/bridge", () => fakes.bridge);
vi.mock("../slices/library-slice", () => ({ persistFavorites: fakes.persistFavorites }));
vi.mock("../../lib/persistence", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/persistence")>();
  return {
    ...mod,
    localStorageAdapter: {
      getItem: (k: string) => fakes.storage.get(k) ?? null,
      setItem: (k: string, v: string) => void fakes.storage.set(k, v),
      removeItem: (k: string) => void fakes.storage.delete(k),
    },
  };
});

import { createCloudSyncSlice } from "../slices/cloud-sync-slice";

interface WatchEntry {
  channelUrl: string;
  channelName: string;
  channelLogo?: string;
  groupTitle?: string;
  startedAt: number;
}

type TestState = CloudSyncSlice & {
  authUser: { id: string } | null;
  settings: Record<string, string>;
  favorites: Set<string>;
  watchHistory: WatchEntry[];
};

function makeStore() {
  return create<TestState>()((...a) => ({
    ...(createCloudSyncSlice as unknown as StateCreator<TestState, [], [], CloudSyncSlice>)(...a),
    authUser: { id: "u1" },
    settings: {},
    favorites: new Set<string>(),
    watchHistory: [],
  }));
}

const USER = { id: "u1" };

function storedHistory(): unknown[] {
  return JSON.parse(fakes.storage.get("shogun:cloud-history") ?? "[]") as unknown[];
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  vi.clearAllMocks();
  fakes.storage.clear();
  store = makeStore();
  store.setState({ cloudSyncEnabled: true, authUser: USER });
});

describe("cloud sync gating", () => {
  it("does nothing when sync is disabled or logged out", async () => {
    store.setState({ cloudSyncEnabled: false });
    await store.getState().cloudPull();
    await store.getState().cloudPush();

    store.setState({ cloudSyncEnabled: true, authUser: null });
    await store.getState().cloudPull();
    await store.getState().cloudPush();

    expect(fakes.bridge.cloudSyncPull).not.toHaveBeenCalled();
    expect(fakes.bridge.cloudSyncPush).not.toHaveBeenCalled();
    expect(store.getState().cloudSyncing).toBe(false);
  });
});

describe("cloudPull merges", () => {
  it("cloud settings win per key, local-only keys survive, each cloud key persisted", async () => {
    store.setState({ settings: { theme: "dark", localOnly: "keep" } });
    fakes.bridge.cloudSyncPull.mockResolvedValue({
      ok: true,
      data: { settings: { theme: "light", cloudOnly: "yes" } },
    });

    await store.getState().cloudPull();

    expect(store.getState().settings).toEqual({
      theme: "light",
      localOnly: "keep",
      cloudOnly: "yes",
    });
    expect(fakes.bridge.dbSetSetting).toHaveBeenCalledTimes(2);
    expect(fakes.bridge.dbSetSetting).toHaveBeenCalledWith("theme", "light");
  });

  it("favorites merge as a union and are persisted", async () => {
    store.setState({ favorites: new Set(["a", "b"]) });
    fakes.bridge.cloudSyncPull.mockResolvedValue({
      ok: true,
      data: { favorites: ["b", "c"] },
    });

    await store.getState().cloudPull();

    expect([...store.getState().favorites].sort()).toEqual(["a", "b", "c"]);
    const persisted = fakes.persistFavorites.mock.calls[0][0] as Set<string>;
    expect([...persisted].sort()).toEqual(["a", "b", "c"]);
  });

  it("history dedupes by url+timestamp, sorts newest first, caps at 50", async () => {
    const existing = [
      { channelUrl: "u://1", channelName: "One", watchedAt: 100 },
      { channelUrl: "u://2", channelName: "Two", watchedAt: 200 },
    ];
    fakes.storage.set("shogun:cloud-history", JSON.stringify(existing));
    const incoming = [
      { channelUrl: "u://2", channelName: "Two HD", watchedAt: 200 }, // dupe → replaces
      { channelUrl: "u://3", channelName: "Three", watchedAt: 300 },
    ];
    fakes.bridge.cloudSyncPull.mockResolvedValue({ ok: true, data: { history: incoming } });

    await store.getState().cloudPull();

    const merged = storedHistory() as { channelUrl: string; watchedAt: number }[];
    expect(merged.map((h) => h.watchedAt)).toEqual([300, 200, 100]);
    expect(merged[1]).toMatchObject({ channelName: "Two HD" });

    // Cap: 60 incoming entries → stored list is 50.
    fakes.storage.set("shogun:cloud-history", "[]");
    const many = Array.from({ length: 60 }, (_, i) => ({
      channelUrl: `u://${i}`,
      channelName: `Ch${i}`,
      watchedAt: i,
    }));
    fakes.bridge.cloudSyncPull.mockResolvedValue({ ok: true, data: { history: many } });
    await store.getState().cloudPull();
    expect(storedHistory()).toHaveLength(50);
  });

  it("records the server updatedAt as the last-sync timestamp", async () => {
    fakes.bridge.cloudSyncPull.mockResolvedValue({
      ok: true,
      data: { updatedAt: "2026-10-19T03:00:00.000Z" },
    });

    await store.getState().cloudPull();

    const ts = new Date("2026-10-19T03:00:00.000Z").getTime();
    expect(store.getState().cloudSyncLastAt).toBe(ts);
    expect(JSON.parse(fakes.storage.get("shogun:cloud-sync-last") ?? "0")).toBe(ts);
    expect(store.getState().cloudSyncing).toBe(false);
  });

  it("swallows pull failures and releases the syncing flag", async () => {
    fakes.bridge.cloudSyncPull.mockRejectedValue(new Error("offline"));
    await store.getState().cloudPull();
    expect(store.getState().cloudSyncing).toBe(false);
  });
});

describe("cloudPush", () => {
  it("sends settings, favorites, and capped history with epoch-0 on first sync", async () => {
    store.setState({
      settings: { theme: "dark" },
      favorites: new Set(["a"]),
      watchHistory: Array.from({ length: 60 }, (_, i) => ({
        channelUrl: `u://${i}`,
        channelName: `Ch${i}`,
        startedAt: i * 1000,
      })),
      cloudSyncLastAt: 0,
    });
    fakes.bridge.cloudSyncPush.mockResolvedValue({ ok: true, data: {} });

    await store.getState().cloudPush();

    const body = fakes.bridge.cloudSyncPush.mock.calls[0][0] as {
      settings: Record<string, string>;
      favorites: string[];
      history: { channelUrl: string; watchedAt: number }[];
      localUpdatedAt: string;
    };
    expect(body.settings).toEqual({ theme: "dark" });
    expect(body.favorites).toEqual(["a"]);
    expect(body.history).toHaveLength(50); // capped
    expect(body.history[0]).toMatchObject({ channelUrl: "u://0", watchedAt: 0 });
    expect(body.localUpdatedAt).toBe(new Date(0).toISOString());
  });

  it("echoes the last-sync timestamp and updates it from the server reply", async () => {
    const last = Date.UTC(2026, 9, 1);
    store.setState({ cloudSyncLastAt: last });
    fakes.bridge.cloudSyncPush.mockResolvedValue({
      ok: true,
      data: { updatedAt: "2026-10-19T04:00:00.000Z" },
    });

    await store.getState().cloudPush();

    const body = fakes.bridge.cloudSyncPush.mock.calls[0][0] as { localUpdatedAt: string };
    expect(body.localUpdatedAt).toBe(new Date(last).toISOString());
    const ts = new Date("2026-10-19T04:00:00.000Z").getTime();
    expect(store.getState().cloudSyncLastAt).toBe(ts);
  });

  it("on conflict, pulls the server's state instead of trusting the push", async () => {
    fakes.bridge.cloudSyncPush.mockResolvedValue({ ok: true, data: { conflict: true } });
    fakes.bridge.cloudSyncPull.mockResolvedValue({
      ok: true,
      data: { settings: { from: "server" } },
    });

    await store.getState().cloudPush();

    expect(fakes.bridge.cloudSyncPull).toHaveBeenCalled();
    expect(store.getState().settings).toEqual({ from: "server" });
    expect(store.getState().cloudSyncing).toBe(false);
  });

  it("swallows push failures and releases the syncing flag", async () => {
    fakes.bridge.cloudSyncPush.mockRejectedValue(new Error("offline"));
    await store.getState().cloudPush();
    expect(store.getState().cloudSyncing).toBe(false);
  });
});
