// ── Auth / SaaS slice (login, registration, server features, entitlements) ──
import type { StateCreator } from "zustand";
import type { AppState } from "../app-store";
import { localStorageAdapter, loadJson, saveJson } from "../../lib/persistence";
import { logUpgradeIntent, logCheckoutCompleted } from "../../lib/analytics";
import * as bridge from "../../lib/bridge";

const P = localStorageAdapter;

export interface AuthSlice {
  authUser: { id: string; email: string; displayName?: string; createdAt: string } | null;
  authPlan: string;
  subscriptionStatus: string;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  isFoundingMember: boolean;
  serverFlags: Record<string, boolean>;
  serverFlagsTimestamp: number;
  authLoading: boolean;
  authError: string | null;

  appOpenCount: number;
  incrementAppOpen: () => void;

  initAuth: () => Promise<void>;
  authLoginAction: (email: string, password: string) => Promise<boolean>;
  authRegisterAction: (email: string, password: string, displayName?: string) => Promise<boolean>;
  authLogoutAction: () => Promise<void>;
  fetchServerFeatures: () => Promise<void>;
  isServerFeatureEnabled: (flagKey: string) => boolean;

  requestFeature: (flagKey: string) => boolean;

  isOffline: boolean;
  usingCachedPlan: boolean;
  canUse: (flagKey: string) => boolean;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  authUser: loadJson<{ id: string; email: string; displayName?: string; createdAt: string } | null>(P, "shogun:auth-user", null),
  authPlan: loadJson<string>(P, "shogun:auth-plan", "FREE") ?? "FREE",
  subscriptionStatus: loadJson<string>(P, "shogun:subscription-status", "NONE") ?? "NONE",
  billingInterval: loadJson<string | null>(P, "shogun:billing-interval", null) ?? null,
  currentPeriodEnd: loadJson<string | null>(P, "shogun:current-period-end", null) ?? null,
  trialEndsAt: loadJson<string | null>(P, "shogun:trial-ends-at", null) ?? null,
  isFoundingMember: loadJson<boolean>(P, "shogun:founding-member", false),
  serverFlags: loadJson<Record<string, boolean>>(P, "shogun:server-flags", {}),
  serverFlagsTimestamp: loadJson<number>(P, "shogun:server-flags-ts", 0) ?? 0,
  authLoading: false,
  authError: null,

  appOpenCount: loadJson<number>(P, "shogun:app-open-count", 0) ?? 0,

  incrementAppOpen: () => {
    const count = get().appOpenCount + 1;
    saveJson(P, "shogun:app-open-count", count);
    set({ appOpenCount: count });
  },

  initAuth: async () => {
    set({ authLoading: true, authError: null });
    try {
      const refreshRes = await bridge.authRefresh();
      if (refreshRes.ok) {
        await get().fetchServerFeatures();
        get().cloudPull().catch(() => { /* never block */ });
      } else {
        const ts = get().serverFlagsTimestamp;
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        if (ts > 0 && Date.now() - ts > SEVEN_DAYS) {
          set({ authPlan: "FREE", subscriptionStatus: "NONE", billingInterval: null, currentPeriodEnd: null, trialEndsAt: null, isFoundingMember: false, serverFlags: {}, authUser: null, isOffline: false, usingCachedPlan: false });
          saveJson(P, "shogun:auth-plan", "FREE");
          saveJson(P, "shogun:subscription-status", "NONE");
          saveJson(P, "shogun:billing-interval", null);
          saveJson(P, "shogun:current-period-end", null);
          saveJson(P, "shogun:trial-ends-at", null);
          saveJson(P, "shogun:founding-member", false);
          saveJson(P, "shogun:server-flags", {});
          saveJson(P, "shogun:auth-user", null);
          window.dispatchEvent(new CustomEvent("shogun:show-login"));
        } else if (ts > 0) {
          set({ isOffline: true, usingCachedPlan: true });
        }
      }
    } catch {
      const ts = get().serverFlagsTimestamp;
      if (ts > 0) {
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - ts > SEVEN_DAYS) {
          set({ authPlan: "FREE", subscriptionStatus: "NONE", billingInterval: null, currentPeriodEnd: null, trialEndsAt: null, isFoundingMember: false, serverFlags: {}, authUser: null, isOffline: true, usingCachedPlan: false });
          saveJson(P, "shogun:auth-plan", "FREE");
          saveJson(P, "shogun:subscription-status", "NONE");
          saveJson(P, "shogun:billing-interval", null);
          saveJson(P, "shogun:current-period-end", null);
          saveJson(P, "shogun:trial-ends-at", null);
          saveJson(P, "shogun:founding-member", false);
          saveJson(P, "shogun:server-flags", {});
          saveJson(P, "shogun:auth-user", null);
        } else {
          set({ isOffline: true, usingCachedPlan: true });
        }
      }
    } finally {
      set({ authLoading: false });
    }
  },

  authLoginAction: async (email, password) => {
    set({ authLoading: true, authError: null });
    try {
      const res = await bridge.authLogin(email, password);
      if (res.ok) {
        const { user, subscription } = res.data;
        set({ authUser: user, authPlan: subscription.plan });
        saveJson(P, "shogun:auth-user", user);
        saveJson(P, "shogun:auth-plan", subscription.plan);
        await get().fetchServerFeatures();
        set({ authLoading: false });
        return true;
      }
      set({ authError: "Invalid credentials", authLoading: false });
      return false;
    } catch (err) {
      set({ authError: (err as Error).message, authLoading: false });
      return false;
    }
  },

  authRegisterAction: async (email, password, displayName) => {
    set({ authLoading: true, authError: null });
    try {
      const res = await bridge.authRegister(email, password, displayName);
      if (res.ok) {
        const { user, subscription } = res.data;
        set({ authUser: user, authPlan: subscription.plan });
        saveJson(P, "shogun:auth-user", user);
        saveJson(P, "shogun:auth-plan", subscription.plan);
        await get().fetchServerFeatures();
        set({ authLoading: false });
        return true;
      }
      set({ authError: "Registration failed", authLoading: false });
      return false;
    } catch (err) {
      set({ authError: (err as Error).message, authLoading: false });
      return false;
    }
  },

  authLogoutAction: async () => {
    await bridge.authLogout();
    set({ authUser: null, authPlan: "FREE", subscriptionStatus: "NONE", billingInterval: null, currentPeriodEnd: null, trialEndsAt: null, isFoundingMember: false, serverFlags: {}, serverFlagsTimestamp: 0, authError: null });
    saveJson(P, "shogun:auth-user", null);
    saveJson(P, "shogun:auth-plan", "FREE");
    saveJson(P, "shogun:subscription-status", "NONE");
    saveJson(P, "shogun:billing-interval", null);
    saveJson(P, "shogun:current-period-end", null);
    saveJson(P, "shogun:trial-ends-at", null);
    saveJson(P, "shogun:founding-member", false);
    saveJson(P, "shogun:server-flags", {});
    saveJson(P, "shogun:server-flags-ts", 0);
  },

  fetchServerFeatures: async () => {
    try {
      const res = await bridge.featuresFetch();
      if (res.ok) {
        const now = Date.now();
        const prevPlan = get().authPlan;
        set({
          authPlan: res.data.plan,
          subscriptionStatus: res.data.subscriptionStatus ?? "NONE",
          billingInterval: res.data.billingInterval ?? null,
          currentPeriodEnd: res.data.currentPeriodEnd ?? null,
          trialEndsAt: res.data.trialEndsAt ?? null,
          isFoundingMember: res.data.isFoundingMember ?? false,
          serverFlags: res.data.flags,
          serverFlagsTimestamp: now,
          isOffline: false,
          usingCachedPlan: false,
        });
        saveJson(P, "shogun:auth-plan", res.data.plan);
        saveJson(P, "shogun:subscription-status", res.data.subscriptionStatus ?? "NONE");
        saveJson(P, "shogun:billing-interval", res.data.billingInterval ?? null);
        saveJson(P, "shogun:current-period-end", res.data.currentPeriodEnd ?? null);
        saveJson(P, "shogun:trial-ends-at", res.data.trialEndsAt ?? null);
        saveJson(P, "shogun:founding-member", res.data.isFoundingMember ?? false);
        saveJson(P, "shogun:server-flags", res.data.flags);
        saveJson(P, "shogun:server-flags-ts", now);
        if (prevPlan === "FREE" && res.data.plan === "PRO") {
          logCheckoutCompleted(res.data.billingInterval);
        }
      }
    } catch {
      set({ isOffline: true, usingCachedPlan: get().serverFlagsTimestamp > 0 });
    }
  },

  isServerFeatureEnabled: (flagKey) => {
    const { serverFlags, authPlan, serverFlagsTimestamp } = get();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (serverFlagsTimestamp === 0 || Date.now() - serverFlagsTimestamp > SEVEN_DAYS) {
      return false;
    }
    if (flagKey in serverFlags) return serverFlags[flagKey];
    return authPlan === "PRO";
  },

  // ── Entitlement hardening ──────────────────────────────────────

  isOffline: false,
  usingCachedPlan: false,

  canUse: (flagKey) => {
    if (get().license.isProEnabled) return true;
    return get().isServerFeatureEnabled(flagKey);
  },

  requestFeature: (flagKey) => {
    if (get().canUse(flagKey)) return true;
    logUpgradeIntent(flagKey);
    window.dispatchEvent(
      new CustomEvent("shogun:show-paywall", { detail: { feature: flagKey } }),
    );
    return false;
  },
});
