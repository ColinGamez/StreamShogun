import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fakes ─────────────────────────────────────────────────────────────
// loadSampleData drives the real composed app store; only the Electron
// bridge is mocked (dbSavePlaylist + its follow-up dbListPlaylists), and
// window is stubbed so tests can toggle window.shogun.

const fakes = vi.hoisted(() => ({
  dbSavePlaylist: vi.fn(),
  dbListPlaylists: vi.fn(async () => ({ ok: true as const, data: [] })),
  dbRemovePlaylist: vi.fn(),
  dbListChannels: vi.fn(async () => ({ ok: true as const, data: [] })),
}));

vi.mock("../bridge", () => fakes);

const windowStub: { shogun?: object } = {};
vi.stubGlobal("window", windowStub);

import { loadSampleData } from "../sample-data";
import { useAppStore } from "../../stores/app-store";

beforeEach(() => {
  vi.clearAllMocks();
  delete windowStub.shogun;
  useAppStore.setState({ playlistEntries: [], channels: [], dbPlaylists: [] });
});

describe("loadSampleData", () => {
  it("adds the demo playlist with metadata and all channels", async () => {
    await loadSampleData();

    const s = useAppStore.getState();
    expect(s.playlistEntries).toHaveLength(1);
    expect(s.playlistEntries[0]).toMatchObject({
      name: "Sample Playlist (Demo)",
      location: "built-in://sample",
      type: "file",
      channelCount: 5,
    });
    expect(s.channels).toHaveLength(5);
  });

  it("sample channels are structurally valid first-run streams", async () => {
    await loadSampleData();
    const channels = useAppStore.getState().channels;

    const urls = channels.map((c) => c.url);
    expect(new Set(urls).size).toBe(urls.length); // unique
    for (const c of channels) {
      expect(c.url.startsWith("https://")).toBe(true); // no mixed-content streams
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.tvgName).toBe(c.name); // display name mirrors name
      expect(c.duration).toBe(-1); // live-style streams
      expect(c.groupTitle.length).toBeGreaterThan(0); // grouped for the UI
    }
    // Demo HLS streams all end in a playlist manifest.
    expect(urls.every((u) => u.endsWith(".m3u8"))).toBe(true);
  });

  it("a second load adds another entry but never duplicates channels", async () => {
    await loadSampleData();
    await loadSampleData();

    const s = useAppStore.getState();
    expect(s.playlistEntries).toHaveLength(2);
    expect(s.channels).toHaveLength(5); // dedupe by URL
  });

  it("uses the persisted ID so the sample playlist can be deleted from the desktop database", async () => {
    windowStub.shogun = {};
    fakes.dbSavePlaylist.mockResolvedValue({ ok: true, data: { id: "db-1" } });

    await loadSampleData();
    expect(fakes.dbSavePlaylist).toHaveBeenCalledWith(
      "Sample Playlist (Demo)",
      "file",
      "built-in://sample",
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("https") })]),
    );
    const entry = useAppStore.getState().playlistEntries[0];
    expect(entry.id).toBe("db-1");
    fakes.dbRemovePlaylist.mockImplementation(async (id: string) =>
      id === "db-1" ? { ok: true, data: null } : { ok: false, error: "Playlist not found" },
    );
    await useAppStore.getState().dbRemovePlaylist(entry.id);
    useAppStore.getState().removePlaylist(entry.id);
    expect(fakes.dbRemovePlaylist).toHaveBeenCalledWith("db-1");
    expect(useAppStore.getState().playlistEntries).toEqual([]);
    expect(useAppStore.getState().channels).toEqual([]);
  });

  it("does not add a phantom playlist when the desktop save rejects", async () => {
    windowStub.shogun = {};
    fakes.dbSavePlaylist.mockRejectedValue(new Error("db down"));
    await expect(loadSampleData()).rejects.toThrow("db down");
    expect(useAppStore.getState().playlistEntries).toEqual([]);
    expect(useAppStore.getState().channels).toEqual([]);
  });

  it("reports a failed IPC response without adding in-memory sample data", async () => {
    windowStub.shogun = {};
    fakes.dbSavePlaylist.mockResolvedValue({ ok: false, error: "Disk full" });
    await expect(loadSampleData()).rejects.toThrow("Could not save the sample playlist");
    expect(useAppStore.getState().playlistEntries).toEqual([]);
    expect(useAppStore.getState().channels).toEqual([]);
  });

  it("waits for persistence before showing channels", async () => {
    windowStub.shogun = {};
    let finish!: (row: unknown) => void;
    fakes.dbSavePlaylist.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = loadSampleData();
    expect(useAppStore.getState().playlistEntries).toEqual([]);
    expect(useAppStore.getState().channels).toEqual([]);
    finish({ ok: true, data: { id: "db-deferred" } });
    await loading;
    expect(useAppStore.getState().playlistEntries[0].id).toBe("db-deferred");
    expect(useAppStore.getState().channels).toHaveLength(5);
  });
});
