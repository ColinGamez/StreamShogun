import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ── Fakes ─────────────────────────────────────────────────────────────
// ipc.ts is the main-process boundary for every renderer call. Electron's
// ipcMain is mocked to capture the registered handlers so tests can invoke
// them directly; db/scheduler/pip/discord/api-client/token-store and
// network-fetch are all mocked. Real @stream-shogun/core parsers run.

const fakes = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const openExternal = vi.fn();
  return {
    handlers,
    isPackaged: false,
    openExternal,
    showSaveDialog: vi.fn(),
    db: {
      savePlaylist: vi.fn(),
      listPlaylists: vi.fn(() => []),
      removePlaylist: vi.fn(),
      listChannels: vi.fn(() => []),
      setFavorite: vi.fn(),
      listFavorites: vi.fn(() => []),
      saveEpgSource: vi.fn(),
      listEpgSources: vi.fn(() => []),
      removeEpgSource: vi.fn(),
      listProgrammes: vi.fn(() => []),
      getNowNext: vi.fn(),
      getEpgRange: vi.fn(() => []),
      getAllSettings: vi.fn(() => ({})),
      setSetting: vi.fn(),
      saveWatchSession: vi.fn(),
      listWatchHistory: vi.fn(() => []),
      getLastWatched: vi.fn(),
      clearWatchHistory: vi.fn(),
      getLicenseStatus: vi.fn(),
      setLicenseKey: vi.fn((key: string) => ({ key })),
      setProEnabled: vi.fn((enabled: boolean) => ({ enabled })),
    },
    scheduler: {
      initScheduler: vi.fn(),
      setRefreshInterval: vi.fn(),
      triggerRefresh: vi.fn(async () => {}),
      getRefreshStatus: vi.fn(() => ({})),
    },
    pip: { openPipWindow: vi.fn(), closePipWindow: vi.fn(), isPipOpen: vi.fn(() => false) },
    discord: {
      setDiscordEnabled: vi.fn(),
      setActivity: vi.fn(async () => {}),
      clearActivity: vi.fn(async () => {}),
    },
    api: {
      apiRegister: vi.fn(),
      apiLogin: vi.fn(),
      apiLogout: vi.fn(async () => {}),
      apiGetFeatures: vi.fn(),
      apiGetMasterSources: vi.fn(),
      apiGetMasterSourceContent: vi.fn(),
      apiRefreshTokens: vi.fn(),
      apiCloudSyncGet: vi.fn(),
      apiCloudSyncPut: vi.fn(),
      apiBillingCheckout: vi.fn(),
      apiBillingPortal: vi.fn(),
      apiBillingReconcile: vi.fn(),
    },
    loadTokens: vi.fn(async () => null),
    fetchRaw: vi.fn(),
    gunzipCapped: vi.fn(),
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) =>
      fakes.handlers.set(channel, fn),
  },
  app: {
    getName: () => "StreamShogun",
    getVersion: () => "0.0.0-test",
    get isPackaged() {
      return fakes.isPackaged;
    },
  },
  shell: { openExternal: fakes.openExternal },
  dialog: { showSaveDialog: fakes.showSaveDialog },
}));

vi.mock("../db", () => fakes.db);
vi.mock("../scheduler", () => fakes.scheduler);
vi.mock("../pip", () => fakes.pip);
vi.mock("../discord", () => fakes.discord);
vi.mock("../api-client", () => fakes.api);
vi.mock("../token-store", () => ({ loadTokens: fakes.loadTokens }));
vi.mock("../network-fetch", () => ({
  fetchRaw: fakes.fetchRaw,
  gunzipCapped: fakes.gunzipCapped,
}));

import { IpcChannels } from "@stream-shogun/core";
import { registerIpcHandlers } from "../ipc";

type IpcResponse = { ok: true; data: unknown } | { ok: false; error: string };

/** Invoke a captured handler the way Electron would. */
function invoke(channel: string, ...args: unknown[]): Promise<IpcResponse> | IpcResponse {
  const handler = fakes.handlers.get(channel);
  if (!handler) throw new Error(`no handler registered for ${channel}`);
  return handler({}, ...args) as Promise<IpcResponse> | IpcResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isPackaged = false;
  fakes.handlers.clear();
  registerIpcHandlers();
});

describe("IPC URL validation (SSRF guard)", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/list.m3u",
    "http://169.254.169.254/latest/meta-data",
    "http://169.254.169.253/",
    "http://100.100.100.200/",
    "http://[fd00:ec2::254]/",
    "not a url",
    "",
  ])("rejects %s without fetching", async (url) => {
    const res = await invoke(IpcChannels.PLAYLIST_LOAD_URL, url);
    expect(res.ok).toBe(false);
    expect(fakes.fetchRaw).not.toHaveBeenCalled();
  });

  it("fetches and parses a valid http playlist URL", async () => {
    fakes.fetchRaw.mockResolvedValue(
      Buffer.from('#EXTM3U\n#EXTINF:-1 tvg-id="a",Alpha\nhttp://s/a\n'),
    );
    const res = await invoke(IpcChannels.PLAYLIST_LOAD_URL, "https://example.com/list.m3u");
    expect(res.ok).toBe(true);
    expect((res as { data: { channels: unknown[] } }).data.channels).toHaveLength(1);
    // Private LAN ranges stay allowed — home IPTV servers live there.
    await invoke(IpcChannels.PLAYLIST_LOAD_URL, "http://192.168.1.10:8080/list.m3u");
    expect(fakes.fetchRaw).toHaveBeenCalledTimes(2);
  });
});

describe("IPC file validation", () => {
  it("rejects non-playlist extensions without reading the file", async () => {
    const res = await invoke(IpcChannels.PLAYLIST_LOAD_FILE, "C:\\temp\\evil.exe");
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/extension/i);
  });

  it("loads a real .m3u file", async () => {
    const file = path.join(os.tmpdir(), "ss-ipc-test.m3u");
    await fs.writeFile(file, '#EXTM3U\n#EXTINF:-1 tvg-id="b",Beta\nhttp://s/b\n');
    try {
      const res = await invoke(IpcChannels.PLAYLIST_LOAD_FILE, file);
      expect(res.ok).toBe(true);
      expect((res as { data: { channels: unknown[] } }).data.channels).toHaveLength(1);
    } finally {
      await fs.rm(file, { force: true });
    }
  });
});

describe("IPC settings guard", () => {
  it.each(["isProEnabled", "licenseKey", "licenseValidationState"])(
    "refuses renderer writes to protected setting %s",
    async (key) => {
      const res = await invoke(IpcChannels.DB_SET_SETTING, { key, value: "true" });
      expect(res.ok).toBe(false);
      expect(fakes.db.setSetting).not.toHaveBeenCalled();
    },
  );

  it("allows ordinary settings and fires the Discord side-effect", async () => {
    expect(await invoke(IpcChannels.DB_SET_SETTING, { key: "theme", value: "dark" })).toEqual({
      ok: true,
      data: null,
    });
    await invoke(IpcChannels.DB_SET_SETTING, { key: "discordRpcEnabled", value: "true" });
    expect(fakes.discord.setDiscordEnabled).toHaveBeenCalledWith(true);
  });
});

describe("IPC license override guard", () => {
  it.each([IpcChannels.LICENSE_SET_KEY, IpcChannels.LICENSE_SET_PRO_ENABLED])(
    "allows %s in dev builds",
    async (channel) => {
      const arg = channel === IpcChannels.LICENSE_SET_KEY ? { key: "SS-A" } : { enabled: true };
      expect((await invoke(channel, arg)).ok).toBe(true);
    },
  );

  it.each([IpcChannels.LICENSE_SET_KEY, IpcChannels.LICENSE_SET_PRO_ENABLED])(
    "blocks %s in packaged builds",
    async (channel) => {
      fakes.isPackaged = true;
      const arg = channel === IpcChannels.LICENSE_SET_KEY ? { key: "SS-A" } : { enabled: true };
      const res = await invoke(channel, arg);
      expect(res.ok).toBe(false);
      expect((res as { error: string }).error).toMatch(/production builds/);
      expect(fakes.db.setLicenseKey).not.toHaveBeenCalled();
      expect(fakes.db.setProEnabled).not.toHaveBeenCalled();
    },
  );
});

describe("IPC billing URL trust", () => {
  it("opens only https *.stripe.com URLs in the system browser", async () => {
    fakes.api.apiBillingCheckout.mockResolvedValue({
      ok: true,
      status: 200,
      data: { url: "https://checkout.stripe.com/c/pay_123" },
    });
    const res = await invoke(IpcChannels.BILLING_CHECKOUT, { interval: "yearly" });
    expect(res.ok).toBe(true);
    expect(fakes.openExternal).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay_123");
  });

  it.each([
    "http://stripe.com/c/pay_123", // not https
    "https://stripe.com.evil.com/phish", // suffix trick
    "https://evil.com/?next=checkout.stripe.com",
    "steam://open/evil",
    "not a url",
  ])("refuses to open %s", async (url) => {
    fakes.api.apiBillingCheckout.mockResolvedValue({ ok: true, status: 200, data: { url } });
    const res = await invoke(IpcChannels.BILLING_CHECKOUT, { interval: "monthly" });
    expect(res.ok).toBe(false);
    expect(fakes.openExternal).not.toHaveBeenCalled();
  });
});

describe("IPC numeric clamps", () => {
  it("clamps watch-history limits to 1–500 and defaults junk to 50", async () => {
    await invoke(IpcChannels.DB_LIST_WATCH_HISTORY, 99_999);
    expect(fakes.db.listWatchHistory).toHaveBeenLastCalledWith(500);
    await invoke(IpcChannels.DB_LIST_WATCH_HISTORY, 0);
    expect(fakes.db.listWatchHistory).toHaveBeenLastCalledWith(1);
    await invoke(IpcChannels.DB_LIST_WATCH_HISTORY, "lots");
    expect(fakes.db.listWatchHistory).toHaveBeenLastCalledWith(50);
  });

  it("rejects out-of-range refresh intervals before touching the scheduler", async () => {
    expect((await invoke(IpcChannels.REFRESH_SET_INTERVAL, { minutes: 2, enabled: true })).ok).toBe(
      false,
    );
    expect(
      (await invoke(IpcChannels.REFRESH_SET_INTERVAL, { minutes: 2000, enabled: true })).ok,
    ).toBe(false);
    expect(fakes.scheduler.setRefreshInterval).not.toHaveBeenCalled();

    expect(
      (await invoke(IpcChannels.REFRESH_SET_INTERVAL, { minutes: 30, enabled: true })).ok,
    ).toBe(true);
    expect(fakes.scheduler.setRefreshInterval).toHaveBeenCalledWith(30, true);
  });
});
