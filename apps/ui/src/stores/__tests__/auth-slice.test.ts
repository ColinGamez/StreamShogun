import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import { DEFAULT_LICENSE_STATUS, type LicenseStatus } from "@stream-shogun/core";
import type { AuthSlice } from "../slices/auth-slice";

// ── Fakes ─────────────────────────────────────────────────────────────
// The slice talks to the Electron bridge, analytics, and persistence.
// Bridge + analytics are mocked; persistence keeps the real loadJson /
// saveJson but swaps localStorage for an in-memory map (node env).

const fakes = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  dispatchEvent: vi.fn(),
  cloudPull: vi.fn(async () => {}),
  bridge: {
    authRefresh: vi.fn(),
    authLogin: vi.fn(),
    authRegister: vi.fn(),
    authLogout: vi.fn(async () => ({ ok: true as const, data: null })),
    featuresFetch: vi.fn(),
  },
  analytics: {
    logUpgradeIntent: vi.fn(),
    logCheckoutCompleted: vi.fn(),
  },
}));

vi.mock("../../lib/bridge", () => fakes.bridge);
vi.mock("../../lib/analytics", () => fakes.analytics);
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

// CustomEvent exists in Node 24, but pin a minimal version so the suite
// does not depend on runtime globals beyond Event.
vi.stubGlobal(
  "CustomEvent",
  class<T> extends Event {
    detail: T | undefined;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail;
    }
  },
);
vi.stubGlobal("window", { dispatchEvent: fakes.dispatchEvent });

import { createAuthSlice } from "../slices/auth-slice";

type TestState = AuthSlice & {
  license: LicenseStatus;
  cloudPull: () => Promise<void>;
};

function makeStore() {
  return create<TestState>()((...a) => ({
    ...(createAuthSlice as unknown as StateCreator<TestState, [], [], AuthSlice>)(...a),
    license: { ...DEFAULT_LICENSE_STATUS },
    cloudPull: fakes.cloudPull,
  }));
}

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function featuresOk(plan: string, flags: Record<string, boolean> = {}) {
  return {
    ok: true as const,
    data: {
      plan,
      subscriptionStatus: plan === "PRO" ? "ACTIVE" : "NONE",
      billingInterval: plan === "PRO" ? "monthly" : null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      isFoundingMember: false,
      isMasterAccount: false,
      flags,
    },
  };
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  vi.clearAllMocks();
  fakes.storage.clear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  store = makeStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isServerFeatureEnabled staleness", () => {
  it("returns the server flag value while the cache is fresh", () => {
    store.setState({ serverFlags: { epg: true, sync: false }, serverFlagsTimestamp: NOW });
    expect(store.getState().isServerFeatureEnabled("epg")).toBe(true);
    expect(store.getState().isServerFeatureEnabled("sync")).toBe(false);
  });

  it("falls back to the cached plan for flags the server did not send", () => {
    store.setState({ serverFlags: {}, serverFlagsTimestamp: NOW, authPlan: "PRO" });
    expect(store.getState().isServerFeatureEnabled("unknown-flag")).toBe(true);
    store.setState({ authPlan: "FREE" });
    expect(store.getState().isServerFeatureEnabled("unknown-flag")).toBe(false);
  });

  it("treats a stale cache as no entitlement, even for known flags", () => {
    store.setState({ serverFlags: { epg: true }, serverFlagsTimestamp: NOW - SEVEN_DAYS - 1 });
    expect(store.getState().isServerFeatureEnabled("epg")).toBe(false);
  });

  it("treats a never-fetched cache (ts=0) as no entitlement", () => {
    store.setState({ serverFlags: { epg: true }, serverFlagsTimestamp: 0 });
    expect(store.getState().isServerFeatureEnabled("epg")).toBe(false);
  });
});

describe("canUse / requestFeature", () => {
  const PRO_LICENSE: LicenseStatus = {
    isProEnabled: true,
    licenseKey: "SS-AAAA-BBBB-CCCC-DDDD",
    validationState: "valid",
  };

  it("a well-formed local Pro license unlocks features without any server state", () => {
    store.setState({ license: PRO_LICENSE });
    expect(store.getState().canUse("anything")).toBe(true);
  });

  it("a flag-less license does not unlock on its own", () => {
    store.setState({
      license: { ...PRO_LICENSE, validationState: "unchecked" },
      serverFlags: { epg: true },
      serverFlagsTimestamp: NOW,
    });
    expect(store.getState().canUse("epg")).toBe(true); // via server flag
    expect(store.getState().canUse("other")).toBe(false);
  });

  it("requestFeature opens the paywall only when access is denied", () => {
    store.setState({ serverFlags: { epg: true }, serverFlagsTimestamp: NOW });
    expect(store.getState().requestFeature("epg")).toBe(true);
    expect(fakes.dispatchEvent).not.toHaveBeenCalled();

    expect(store.getState().requestFeature("4k")).toBe(false);
    expect(fakes.analytics.logUpgradeIntent).toHaveBeenCalledWith("4k");
    const evt = fakes.dispatchEvent.mock.calls[0][0] as CustomEvent<{ feature: string }>;
    expect(evt.type).toBe("shogun:show-paywall");
    expect(evt.detail?.feature).toBe("4k");
  });
});

describe("fetchServerFeatures", () => {
  it("applies plan, flags, and master status, and persists them", async () => {
    const res = featuresOk("PRO", { epg: true });
    res.data.isMasterAccount = true;
    fakes.bridge.featuresFetch.mockResolvedValue(res);

    await store.getState().fetchServerFeatures();

    const s = store.getState();
    expect(s.authPlan).toBe("PRO");
    expect(s.subscriptionStatus).toBe("ACTIVE");
    expect(s.isMasterAccount).toBe(true);
    expect(s.serverFlags).toEqual({ epg: true });
    expect(s.serverFlagsTimestamp).toBe(NOW);
    expect(s.isOffline).toBe(false);
    expect(JSON.parse(fakes.storage.get("shogun:master-account") ?? "null")).toBe(true);
    expect(JSON.parse(fakes.storage.get("shogun:server-flags") ?? "null")).toEqual({ epg: true });
  });

  it("logs checkout completion only on a FREE → PRO transition", async () => {
    fakes.bridge.featuresFetch.mockResolvedValue(featuresOk("PRO"));
    store.setState({ authPlan: "PRO" });
    await store.getState().fetchServerFeatures();
    expect(fakes.analytics.logCheckoutCompleted).not.toHaveBeenCalled();

    store.setState({ authPlan: "FREE" });
    await store.getState().fetchServerFeatures();
    expect(fakes.analytics.logCheckoutCompleted).toHaveBeenCalledWith("monthly");
  });

  it("marks offline and keeps a fresh cached plan on failure", async () => {
    fakes.bridge.featuresFetch.mockRejectedValue(new Error("network down"));
    store.setState({ serverFlagsTimestamp: NOW, authPlan: "PRO" });
    await store.getState().fetchServerFeatures();
    expect(store.getState().isOffline).toBe(true);
    expect(store.getState().usingCachedPlan).toBe(true);
    expect(store.getState().authPlan).toBe("PRO");
  });
});

describe("initAuth", () => {
  it("on token refresh, pulls features and kicks off cloud sync", async () => {
    fakes.bridge.authRefresh.mockResolvedValue({ ok: true, data: { hasTokens: true } });
    fakes.bridge.featuresFetch.mockResolvedValue(featuresOk("FREE"));

    await store.getState().initAuth();

    expect(fakes.bridge.featuresFetch).toHaveBeenCalled();
    expect(fakes.cloudPull).toHaveBeenCalled();
    expect(store.getState().authLoading).toBe(false);
  });

  it("keeps a fresh cached plan when refresh fails (offline mode)", async () => {
    fakes.bridge.authRefresh.mockResolvedValue({ ok: false, error: "expired" });
    store.setState({ authPlan: "PRO", serverFlagsTimestamp: NOW });

    await store.getState().initAuth();

    expect(store.getState().isOffline).toBe(true);
    expect(store.getState().usingCachedPlan).toBe(true);
    expect(store.getState().authPlan).toBe("PRO");
    expect(fakes.dispatchEvent).not.toHaveBeenCalled();
  });

  it("resets to FREE and shows login when the cache is stale", async () => {
    fakes.bridge.authRefresh.mockResolvedValue({ ok: false, error: "expired" });
    store.setState({
      authPlan: "PRO",
      serverFlagsTimestamp: NOW - SEVEN_DAYS - 1,
      serverFlags: { epg: true },
    });

    await store.getState().initAuth();

    const s = store.getState();
    expect(s.authPlan).toBe("FREE");
    expect(s.subscriptionStatus).toBe("NONE");
    expect(s.serverFlags).toEqual({});
    expect(s.authUser).toBeNull();
    const evt = fakes.dispatchEvent.mock.calls[0][0] as Event;
    expect(evt.type).toBe("shogun:show-login");
    expect(JSON.parse(fakes.storage.get("shogun:auth-plan") ?? "null")).toBe("FREE");
  });
});

describe("login / logout", () => {
  it("logs in, applies the plan, and persists the user", async () => {
    const user = { id: "u1", email: "master@example.com", createdAt: "2026-01-01" };
    fakes.bridge.authLogin.mockResolvedValue({
      ok: true,
      data: { user, subscription: { plan: "PRO", status: "ACTIVE" } },
    });
    fakes.bridge.featuresFetch.mockResolvedValue(featuresOk("PRO"));

    const ok = await store.getState().authLoginAction("master@example.com", "hunter2");

    expect(ok).toBe(true);
    expect(store.getState().authUser).toEqual(user);
    expect(store.getState().authPlan).toBe("PRO");
    expect(JSON.parse(fakes.storage.get("shogun:auth-user") ?? "null")).toEqual(user);
  });

  it("surfaces invalid credentials without touching state", async () => {
    fakes.bridge.authLogin.mockResolvedValue({ ok: false, error: "nope" });

    const ok = await store.getState().authLoginAction("master@example.com", "wrong");

    expect(ok).toBe(false);
    expect(store.getState().authError).toBe("Invalid credentials");
    expect(store.getState().authUser).toBeNull();
    expect(fakes.storage.has("shogun:auth-user")).toBe(false);
  });

  it("logout clears every entitlement field including master status", async () => {
    store.setState({
      authUser: { id: "u1", email: "master@example.com", createdAt: "2026-01-01" },
      authPlan: "PRO",
      isMasterAccount: true,
      isFoundingMember: true,
      serverFlags: { epg: true },
      serverFlagsTimestamp: NOW,
    });

    await store.getState().authLogoutAction();

    const s = store.getState();
    expect(s.authUser).toBeNull();
    expect(s.authPlan).toBe("FREE");
    expect(s.isMasterAccount).toBe(false);
    expect(s.isFoundingMember).toBe(false);
    expect(s.serverFlags).toEqual({});
    expect(s.serverFlagsTimestamp).toBe(0);
    expect(JSON.parse(fakes.storage.get("shogun:master-account") ?? "null")).toBe(false);
    expect(JSON.parse(fakes.storage.get("shogun:server-flags-ts") ?? "null")).toBe(0);
  });
});
