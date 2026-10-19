import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fakes ─────────────────────────────────────────────────────────────
// loadSampleData drives the real composed app store; only the Electron
// bridge is mocked (dbSavePlaylist + its follow-up dbListPlaylists), and
// window is stubbed so tests can toggle window.shogun.

const fakes = vi.hoisted(() => ({
  dbSavePlaylist: vi.fn(),
  dbListPlaylists: vi.fn(async () => ({ ok: true as const, data: [] })),
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

  it("persists via the bridge when present, and survives bridge failure", async () => {
    windowStub.shogun = {};
    fakes.dbSavePlaylist.mockResolvedValue({ ok: true, data: { id: "db-1" } });

    await loadSampleData();
    expect(fakes.dbSavePlaylist).toHaveBeenCalledWith(
      "Sample Playlist (Demo)",
      "file",
      "built-in://sample",
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("https") })]),
    );

    // Bridge failure must not break first-run sample data.
    fakes.dbSavePlaylist.mockRejectedValue(new Error("db down"));
    await expect(loadSampleData()).resolves.toBeUndefined();
    expect(useAppStore.getState().channels.length).toBeGreaterThan(0);
  });
});
