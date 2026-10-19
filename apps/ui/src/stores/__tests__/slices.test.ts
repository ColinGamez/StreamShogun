import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import { Feature, type LicenseStatus } from "@stream-shogun/core";
import type { SettingsSlice } from "../slices/settings-slice";
import type { LicenseSlice } from "../slices/license-slice";
import type { PlayerSlice } from "../slices/player-slice";

// ── Fakes ─────────────────────────────────────────────────────────────
// Bridge mocked; persistence keeps real loadJson/saveJson over an
// in-memory map. Covers the three small slices: settings, license, player.

const fakes = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  bridge: {
    dbGetAllSettings: vi.fn(),
    dbSetSetting: vi.fn(async () => ({ ok: true as const, data: null })),
    licenseGetStatus: vi.fn(),
    licenseSetKey: vi.fn(),
    licenseSetProEnabled: vi.fn(),
    dbListWatchHistory: vi.fn(),
    dbGetLastWatched: vi.fn(),
    dbSaveWatch: vi.fn(async () => ({ ok: true as const, data: null })),
    dbClearWatchHistory: vi.fn(async () => ({ ok: true as const, data: null })),
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

import { createSettingsSlice } from "../slices/settings-slice";
import { createLicenseSlice } from "../slices/license-slice";
import { createPlayerSlice } from "../slices/player-slice";

type TestState = SettingsSlice & LicenseSlice & PlayerSlice;

function makeStore() {
  return create<TestState>()((...a) => ({
    ...(createSettingsSlice as unknown as StateCreator<TestState, [], [], SettingsSlice>)(...a),
    ...(createLicenseSlice as unknown as StateCreator<TestState, [], [], LicenseSlice>)(...a),
    ...(createPlayerSlice as unknown as StateCreator<TestState, [], [], PlayerSlice>)(...a),
  }));
}

const VALID_PRO: LicenseStatus = {
  isProEnabled: true,
  licenseKey: "SS-AAAA-BBBB-CCCC-DDDD",
  validationState: "valid",
};

const HISTORY_ROW = {
  id: 1,
  channelUrl: "u://1",
  channelName: "One",
  channelLogo: "",
  groupTitle: "",
  startedAt: 100,
  stoppedAt: 200,
  durationSec: 100,
};

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  vi.clearAllMocks();
  fakes.storage.clear();
  store = makeStore();
});

describe("settings slice", () => {
  it("defaults to en, persists locale changes", () => {
    expect(store.getState().locale).toBe("en");
    store.getState().setLocale("ja");
    expect(store.getState().locale).toBe("ja");
    expect(JSON.parse(fakes.storage.get("shogun:locale") ?? "null")).toBe("ja");
  });

  it("adopts the DB locale only when it is a known locale", async () => {
    fakes.bridge.dbGetAllSettings.mockResolvedValue({
      ok: true,
      data: { locale: "es", theme: "dark" },
    });
    await store.getState().loadSettings();
    expect(store.getState().locale).toBe("es");
    expect(store.getState().settings).toEqual({ locale: "es", theme: "dark" });

    fakes.bridge.dbGetAllSettings.mockResolvedValue({
      ok: true,
      data: { locale: "klingon" },
    });
    await store.getState().loadSettings();
    expect(store.getState().locale).toBe("es"); // unchanged
  });

  it("setSetting mirrors to local state and handles the locale key specially", async () => {
    await store.getState().setSetting("theme", "light");
    expect(store.getState().settings.theme).toBe("light");
    expect(store.getState().locale).toBe("en"); // untouched

    await store.getState().setSetting("locale", "ja");
    expect(store.getState().locale).toBe("ja");
    expect(JSON.parse(fakes.storage.get("shogun:locale") ?? "null")).toBe("ja");

    await store.getState().setSetting("locale", "not-a-locale");
    expect(store.getState().settings.locale).toBe("not-a-locale"); // stored
    expect(store.getState().locale).toBe("ja"); // but not adopted
  });
});

describe("license slice", () => {
  it("loads status on success and keeps defaults on failure", async () => {
    fakes.bridge.licenseGetStatus.mockResolvedValue({ ok: true, data: VALID_PRO });
    await store.getState().loadLicense();
    expect(store.getState().license).toEqual(VALID_PRO);

    fakes.bridge.licenseGetStatus.mockResolvedValue({ ok: false, error: "nope" });
    const fresh = makeStore();
    await fresh.getState().loadLicense();
    expect(fresh.getState().license.isProEnabled).toBe(false);
  });

  it("activateLicenseKey applies the status only on success", async () => {
    fakes.bridge.licenseSetKey.mockResolvedValue({ ok: true, data: VALID_PRO });
    const res = await store.getState().activateLicenseKey("SS-AAAA-BBBB-CCCC-DDDD");
    expect(res).toEqual(VALID_PRO);
    expect(store.getState().license).toEqual(VALID_PRO);

    fakes.bridge.licenseSetKey.mockResolvedValue({ ok: false, error: "invalid" });
    const bad = await store.getState().activateLicenseKey("bad-key");
    expect(bad).toBeNull();
    expect(store.getState().license).toEqual(VALID_PRO); // unchanged
  });

  it("setProEnabled mirrors the server response only on success", async () => {
    fakes.bridge.licenseSetProEnabled.mockResolvedValue({ ok: true, data: VALID_PRO });
    expect(await store.getState().setProEnabled(true)).toEqual(VALID_PRO);

    fakes.bridge.licenseSetProEnabled.mockResolvedValue({ ok: false, error: "nope" });
    expect(await store.getState().setProEnabled(false)).toBeNull();
  });

  it("isFeatureEnabled requires a fully valid Pro license", () => {
    expect(store.getState().isFeatureEnabled(Feature.DiscordRpc)).toBe(false);
    store.setState({ license: VALID_PRO });
    expect(store.getState().isFeatureEnabled(Feature.DiscordRpc)).toBe(true);
    store.setState({ license: { ...VALID_PRO, validationState: "unchecked" } });
    expect(store.getState().isFeatureEnabled(Feature.DiscordRpc)).toBe(false);
  });
});

describe("player slice", () => {
  it("loads history and last-watched together", async () => {
    fakes.bridge.dbListWatchHistory.mockResolvedValue({ ok: true, data: [HISTORY_ROW] });
    fakes.bridge.dbGetLastWatched.mockResolvedValue({ ok: true, data: HISTORY_ROW });

    await store.getState().loadWatchHistory();

    expect(store.getState().watchHistory).toEqual([HISTORY_ROW]);
    expect(store.getState().lastWatched).toEqual(HISTORY_ROW);
    expect(fakes.bridge.dbListWatchHistory).toHaveBeenCalledWith(50);
  });

  it("saveWatch persists then refreshes history and last-watched", async () => {
    fakes.bridge.dbListWatchHistory.mockResolvedValue({ ok: true, data: [HISTORY_ROW] });
    fakes.bridge.dbGetLastWatched.mockResolvedValue({ ok: true, data: HISTORY_ROW });

    await store.getState().saveWatch("u://1", "One", "", "", 100, 200, 100);

    expect(fakes.bridge.dbSaveWatch).toHaveBeenCalledWith("u://1", "One", "", "", 100, 200, 100);
    expect(store.getState().watchHistory).toEqual([HISTORY_ROW]);
    expect(store.getState().lastWatched).toEqual(HISTORY_ROW);
  });

  it("clearWatchHistory empties state after the DB call", async () => {
    store.setState({ watchHistory: [HISTORY_ROW], lastWatched: HISTORY_ROW });
    await store.getState().clearWatchHistory();

    expect(fakes.bridge.dbClearWatchHistory).toHaveBeenCalled();
    expect(store.getState().watchHistory).toEqual([]);
    expect(store.getState().lastWatched).toBeNull();
  });

  it("tracks the current channel and watch-start timestamp", () => {
    const ch = {
      tvgId: "",
      tvgName: "A",
      name: "A",
      tvgLogo: "",
      groupTitle: "",
      url: "u://a",
      duration: -1,
      extras: {},
    };
    store.getState().setCurrentChannel(ch);
    store.getState().setWatchStartedAt(1234);
    expect(store.getState().currentChannel).toEqual(ch);
    expect(store.getState().watchStartedAt).toBe(1234);
    store.getState().setCurrentChannel(null);
    expect(store.getState().currentChannel).toBeNull();
  });
});
