import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import type { Channel, Programme } from "@stream-shogun/core";
import { FREE_PLAYLIST_LIMIT } from "@stream-shogun/shared";
import type { PlaylistEntry, EpgEntry } from "../app-store";
import type { LibrarySlice } from "../slices/library-slice";

// ── Fakes ─────────────────────────────────────────────────────────────
// Bridge is mocked; persistence keeps real loadJson/saveJson over an
// in-memory map. `window` is stubbed so tests can toggle window.shogun
// (present in the packaged app, absent in the pure-web dev path).

const fakes = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  loaders: {
    loadSettings: vi.fn(async () => {}),
    loadWatchHistory: vi.fn(async () => {}),
    loadLicense: vi.fn(async () => {}),
  },
  bridge: {
    dbListPlaylists: vi.fn(),
    dbListFavorites: vi.fn(),
    dbListEpgSources: vi.fn(),
    dbListProgrammes: vi.fn(),
    dbListChannels: vi.fn(),
    dbSavePlaylist: vi.fn(),
    dbRemovePlaylist: vi.fn(async () => ({ ok: true as const, data: null })),
    dbSaveEpgSource: vi.fn(),
    dbRemoveEpgSource: vi.fn(async () => ({ ok: true as const, data: null })),
    dbSetFavorite: vi.fn(async () => ({ ok: true as const, data: null })),
  },
}));

vi.mock("../../lib/bridge", () => fakes.bridge);
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

const windowStub: { shogun?: object } = {};
vi.stubGlobal("window", windowStub);

import { createLibrarySlice } from "../slices/library-slice";

type TestState = LibrarySlice & {
  canUse: (flag: string) => boolean;
  loadSettings: () => Promise<void>;
  loadWatchHistory: () => Promise<void>;
  loadLicense: () => Promise<void>;
};

const canUse = vi.fn(() => false);

function makeStore() {
  return create<TestState>()((...a) => ({
    ...(createLibrarySlice as unknown as StateCreator<TestState, [], [], LibrarySlice>)(...a),
    canUse,
    ...fakes.loaders,
  }));
}

function channel(url: string, name = url): Channel {
  return {
    tvgId: "",
    tvgName: name,
    name,
    tvgLogo: "",
    groupTitle: "",
    url,
    duration: -1,
    extras: {},
  };
}

function playlistEntry(id: string, location = `http://x/${id}`): PlaylistEntry {
  return { id, name: id, location, type: "url", channelCount: 0, addedAt: 0 };
}

function epgEntry(id: string): EpgEntry {
  return {
    id,
    name: id,
    location: `http://x/${id}.xml`,
    type: "url",
    programmeCount: 0,
    channelCount: 0,
    addedAt: 0,
  };
}

function programme(channelId: string, start: number, stop: number, title: string): Programme {
  return {
    channelId,
    start,
    stop,
    titles: [title],
    subtitle: "",
    description: "",
    categories: [],
    episodeNum: "",
    icon: "",
    rating: "",
  };
}

function stored(key: string): unknown {
  return JSON.parse(fakes.storage.get(key) ?? "null");
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  vi.clearAllMocks();
  fakes.storage.clear();
  delete windowStub.shogun;
  store = makeStore();
});

describe("addPlaylist", () => {
  it("assigns an id, dedupes channels by URL on re-add, and persists", () => {
    store
      .getState()
      .addPlaylist(playlistEntry("", "http://x/a"), [channel("u://1"), channel("u://2")]);
    store
      .getState()
      .addPlaylist(playlistEntry("", "http://x/b"), [channel("u://2"), channel("u://3")]);

    const s = store.getState();
    expect(s.playlistEntries).toHaveLength(2);
    expect(s.playlistEntries.every((e) => e.id.length > 0)).toBe(true);
    expect(s.channels.map((c) => c.url)).toEqual(["u://1", "u://2", "u://3"]);
    expect(stored("shogun:playlists")).toHaveLength(2);
    expect(stored("shogun:channels")).toHaveLength(3);
  });

  it("lets the DB own channels when the desktop bridge is present", () => {
    windowStub.shogun = {};
    store.getState().addPlaylist(playlistEntry("p1"), [channel("u://1")]);

    expect(store.getState().channels).toHaveLength(1);
    expect(stored("shogun:playlists")).toHaveLength(1);
    expect(stored("shogun:channels")).toBeNull(); // not persisted locally
  });
});

describe("favorites", () => {
  it("toggles membership and persists the array form", () => {
    store.getState().toggleFavorite("u://1");
    expect(store.getState().favorites.has("u://1")).toBe(true);
    store.getState().toggleFavorite("u://1");
    store.getState().toggleFavorite("u://2");

    expect(store.getState().favorites.has("u://1")).toBe(false);
    expect(store.getState().favorites.has("u://2")).toBe(true);
    expect(stored("shogun:favorites")).toEqual(["u://2"]);
  });
});

describe("EPG add/remove", () => {
  it("merges new programmes over existing ones (new source wins overlaps)", () => {
    store.setState({
      epgIndex: { ch: [programme("ch", 0, 60, "Old")] },
      programmes: [programme("ch", 0, 60, "Old")],
    });
    store.getState().addEpg(epgEntry("new-src"), [programme("ch", 0, 60, "New")], {});

    const s = store.getState();
    expect(s.epgEntries.map((e) => e.id)).toEqual(["new-src"]);
    expect(s.epgIndex["ch"]).toHaveLength(1);
    expect(s.epgIndex["ch"][0].titles[0]).toBe("New");
    expect(s.programmes).toHaveLength(1);
    expect(stored("shogun:epg-index")).not.toBeNull();
  });

  it("wipes EPG state when the last source is removed, keeps it otherwise", () => {
    store.setState({
      epgEntries: [epgEntry("a"), epgEntry("b")],
      epgIndex: { ch: [programme("ch", 0, 60, "X")] },
      programmes: [programme("ch", 0, 60, "X")],
    });

    store.getState().removeEpg("a");
    expect(store.getState().epgEntries.map((e) => e.id)).toEqual(["b"]);
    expect(store.getState().epgIndex["ch"]).toHaveLength(1); // kept

    store.getState().removeEpg("b");
    expect(store.getState().epgEntries).toHaveLength(0);
    expect(store.getState().epgIndex).toEqual({});
    expect(store.getState().programmes).toEqual([]);
    expect(stored("shogun:epg-index")).toEqual({});
  });
});

describe("initFromDb", () => {
  it("restores sources, favorites, merged EPG, and channels; flags dbReady", async () => {
    fakes.bridge.dbListPlaylists.mockResolvedValue({ ok: true, data: [playlistEntry("p1")] });
    fakes.bridge.dbListFavorites.mockResolvedValue({ ok: true, data: ["c1"] });
    fakes.bridge.dbListEpgSources.mockResolvedValue({ ok: true, data: [epgEntry("e1")] });
    fakes.bridge.dbListProgrammes.mockResolvedValue({
      ok: true,
      data: [
        {
          epgSourceId: "e1",
          sourceName: "Guide",
          channelId: "ch",
          start: 0,
          stop: 60,
          title: "Restored",
          subtitle: "",
          description: "",
          categories: [],
          episodeNum: "",
          icon: "",
          rating: "",
        },
      ],
    });
    fakes.bridge.dbListChannels.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "c1",
          playlistId: "p1",
          tvgId: "t",
          name: "Chan",
          logo: "",
          groupTitle: "",
          streamUrl: "u://db",
        },
      ],
    });
    store.setState({ channels: [channel("u://local"), channel("u://db")] });

    await store.getState().initFromDb();

    const s = store.getState();
    expect(s.dbReady).toBe(true);
    expect(s.dbPlaylists).toHaveLength(1);
    expect(s.dbFavorites.has("c1")).toBe(true);
    expect(s.epgIndex["ch"][0].titles[0]).toBe("Restored");
    // Web path: DB channels + local-only channels unioned, dupes dropped.
    expect(s.channels.map((c) => c.url).sort()).toEqual(["u://db", "u://local"]);
    expect(fakes.loaders.loadSettings).toHaveBeenCalled();
    expect(fakes.loaders.loadWatchHistory).toHaveBeenCalled();
    expect(fakes.loaders.loadLicense).toHaveBeenCalled();
  });

  it("desktop path: DB channels replace local channels entirely", async () => {
    windowStub.shogun = {};
    fakes.bridge.dbListPlaylists.mockResolvedValue({ ok: true, data: [] });
    fakes.bridge.dbListFavorites.mockResolvedValue({ ok: true, data: [] });
    fakes.bridge.dbListEpgSources.mockResolvedValue({ ok: true, data: [] });
    fakes.bridge.dbListProgrammes.mockResolvedValue({ ok: false, error: "none" });
    fakes.bridge.dbListChannels.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "c1",
          playlistId: "p1",
          tvgId: "",
          name: "DbChan",
          logo: "",
          groupTitle: "",
          streamUrl: "u://db",
        },
      ],
    });
    store.setState({ channels: [channel("u://local")] });

    await store.getState().initFromDb();

    expect(store.getState().channels.map((c) => c.url)).toEqual(["u://db"]);
  });
});

describe("db-backed mutations", () => {
  it("dbToggleFavorite flips current state and refreshes from the DB", async () => {
    store.setState({ dbFavorites: new Set(["c1"]) });
    fakes.bridge.dbListFavorites.mockResolvedValue({ ok: true, data: [] });

    await store.getState().dbToggleFavorite("c1");
    expect(fakes.bridge.dbSetFavorite).toHaveBeenCalledWith("c1", false);
    expect(store.getState().dbFavorites.size).toBe(0);

    fakes.bridge.dbListFavorites.mockResolvedValue({ ok: true, data: ["c1"] });
    await store.getState().dbToggleFavorite("c1");
    expect(fakes.bridge.dbSetFavorite).toHaveBeenLastCalledWith("c1", true);
  });

  it("dbSavePlaylist refreshes the list on success and returns null on failure", async () => {
    fakes.bridge.dbSavePlaylist.mockResolvedValue({ ok: true, data: playlistEntry("p9") });
    fakes.bridge.dbListPlaylists.mockResolvedValue({ ok: true, data: [playlistEntry("p9")] });

    const row = await store.getState().dbSavePlaylist("p9", "url", "http://x", []);
    expect(row?.id).toBe("p9");
    expect(store.getState().dbPlaylists).toHaveLength(1);

    fakes.bridge.dbSavePlaylist.mockResolvedValue({ ok: false, error: "denied" });
    fakes.bridge.dbListPlaylists.mockClear();
    const failed = await store.getState().dbSavePlaylist("p10", "url", "http://y", []);
    expect(failed).toBeNull();
    expect(fakes.bridge.dbListPlaylists).not.toHaveBeenCalled();
  });
});

describe("playlistLimitReached", () => {
  it("respects the free-tier limit unless the feature is unlocked", () => {
    store.setState({ dbPlaylists: [], playlistEntries: [] });
    expect(store.getState().playlistLimitReached()).toBe(false);

    store.setState({
      dbPlaylists: Array.from({ length: FREE_PLAYLIST_LIMIT }, (_, i) => ({
        id: `p${i}`,
        name: `p${i}`,
        sourceType: "url" as const,
        sourceValue: `http://x/${i}`,
        lastFetchedAt: 0,
        channelCount: 0,
      })),
    });
    expect(store.getState().playlistLimitReached()).toBe(true);

    canUse.mockReturnValue(true);
    expect(store.getState().playlistLimitReached()).toBe(false);
    canUse.mockReturnValue(false);
  });

  it("falls back to in-memory entries when DB rows are absent", () => {
    store.setState({ dbPlaylists: [], playlistEntries: [playlistEntry("p1")] });
    expect(store.getState().playlistLimitReached()).toBe(true); // FREE_PLAYLIST_LIMIT = 1
  });
});
