// ── Application store (Zustand) ───────────────────────────────────────

import { create } from "zustand";
import type { Channel, Programme, LicenseStatus , Feature} from "@stream-shogun/core";
import { isFeatureEnabled, DEFAULT_LICENSE_STATUS } from "@stream-shogun/core";import { FREE_PLAYLIST_LIMIT } from "@stream-shogun/shared";import type {
  SerializedEpgIndex,
  DbPlaylistRow,
  DbEpgSourceRow,
  DbWatchHistoryRow,
} from "../vite-env";
import type { Locale } from "../lib/i18n";
import { localStorageAdapter, loadJson, saveJson } from "../lib/persistence";
import { logUpgradeIntent, logCheckoutCompleted } from "../lib/analytics";
import * as bridge from "../lib/bridge";

const P = localStorageAdapter;

// ── Persisted source metadata ─────────────────────────────────────────
export interface PlaylistEntry {
  id: string;
  name: string;
  location: string;
  type: "url" | "file";
  channelCount: number;
  addedAt: number;
}

export interface EpgEntry {
  id: string;
  name: string;
  location: string;
  type: "url" | "file";
  programmeCount: number;
  channelCount: number;
  addedAt: number;
}

// ── Store shape ───────────────────────────────────────────────────────
export interface AppState {
  // ── Locale ──────────────────────────────────────────────────────
  locale: Locale;
  setLocale: (l: Locale) => void;

  // ── Playlists / channels ────────────────────────────────────────
  playlistEntries: PlaylistEntry[];
  channels: Channel[];
  addPlaylist: (entry: PlaylistEntry, channels: Channel[]) => void;
  removePlaylist: (id: string) => void;

  // ── EPG ─────────────────────────────────────────────────────────
  epgEntries: EpgEntry[];
  epgIndex: SerializedEpgIndex;
  programmes: Programme[];
  addEpg: (entry: EpgEntry, programmes: Programme[], index: SerializedEpgIndex) => void;
  removeEpg: (id: string) => void;

  // ── Favorites ───────────────────────────────────────────────────
  favorites: Set<string>; // channel URLs for uniqueness
  toggleFavorite: (url: string) => void;

  // ── Player state ────────────────────────────────────────────────
  currentChannel: Channel | null;
  setCurrentChannel: (ch: Channel | null) => void;

  // ── DB-backed persistence ───────────────────────────────────────
  /** Whether the DB layer has been loaded at least once. */
  dbReady: boolean;
  dbPlaylists: DbPlaylistRow[];
  dbEpgSources: DbEpgSourceRow[];
  dbFavorites: Set<string>;

  /**
   * Initialise store from the SQLite DB (call once on app start).
   * Falls back silently when not running in Electron.
   */
  initFromDb: () => Promise<void>;

  /** Save a playlist + channels to DB after parsing. */
  dbSavePlaylist: (
    name: string,
    sourceType: "url" | "file",
    sourceValue: string,
    channels: Channel[],
  ) => Promise<DbPlaylistRow | null>;

  /** Remove a playlist from DB. */
  dbRemovePlaylist: (id: string) => Promise<void>;

  /** Save an EPG source + programmes to DB after parsing. */
  dbSaveEpgSource: (
    name: string,
    sourceType: "url" | "file",
    sourceValue: string,
    programmes: Programme[],
  ) => Promise<DbEpgSourceRow | null>;

  /** Remove an EPG source from DB. */
  dbRemoveEpgSource: (id: string) => Promise<void>;

  /** Toggle a channel favourite in DB. */
  dbToggleFavorite: (channelId: string) => Promise<void>;

  // ── Settings (F8) ──────────────────────────────────────────────
  settings: Record<string, string>;
  loadSettings: () => Promise<void>;
  setSetting: (key: string, value: string) => Promise<void>;

  // ── Watch History (F4) ─────────────────────────────────────────
  watchHistory: DbWatchHistoryRow[];
  loadWatchHistory: () => Promise<void>;
  saveWatch: (
    channelUrl: string,
    channelName: string,
    channelLogo: string,
    groupTitle: string,
    startedAt: number,
    stoppedAt: number,
    durationSec: number,
  ) => Promise<void>;
  clearWatchHistory: () => Promise<void>;
  lastWatched: DbWatchHistoryRow | null;

  // ── Tracking: when the current channel started playing ─────────
  watchStartedAt: number;
  setWatchStartedAt: (ts: number) => void;

  // ── License / Pro ──────────────────────────────────────────────
  license: LicenseStatus;
  loadLicense: () => Promise<void>;
  activateLicenseKey: (key: string) => Promise<LicenseStatus | null>;
  setProEnabled: (enabled: boolean) => Promise<LicenseStatus | null>;
  /** Check whether a specific Pro feature is currently enabled. */
  isFeatureEnabled: (feature: Feature) => boolean;

  // ── Auth / SaaS ────────────────────────────────────────────────
  authUser: { id: string; email: string; displayName?: string; createdAt: string } | null;
  authPlan: string; // "FREE" | "PRO"
  subscriptionStatus: string; // "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | …
  billingInterval: string | null; // "MONTHLY" | "YEARLY" | null
  currentPeriodEnd: string | null; // ISO-8601
  trialEndsAt: string | null; // ISO-8601 (only during TRIALING)
  isFoundingMember: boolean;
  serverFlags: Record<string, boolean>;
  serverFlagsTimestamp: number; // ms epoch — for offline cache validity
  authLoading: boolean;
  authError: string | null;

  /** Number of times the app has been opened (persisted). */
  appOpenCount: number;
  /** Increment open count + check nudge eligibility. */
  incrementAppOpen: () => void;

  /** Attempt silent token refresh + feature fetch on app start. */
  initAuth: () => Promise<void>;
  authLoginAction: (email: string, password: string) => Promise<boolean>;
  authRegisterAction: (email: string, password: string, displayName?: string) => Promise<boolean>;
  authLogoutAction: () => Promise<void>;
  fetchServerFeatures: () => Promise<void>;
  /** Check a server-side feature flag with offline fallback. */
  isServerFeatureEnabled: (flagKey: string) => boolean;

  /**
   * Try to use a feature. If gated, dispatches the paywall event
   * so the PaywallModal opens, and returns `false`.
   * Usage: `if (!requestFeature("cloud_sync")) return;`
   */
  requestFeature: (flagKey: string) => boolean;

  /** Whether the FREE playlist limit has been reached. */
  playlistLimitReached: () => boolean;

  // ── Entitlement hardening ──────────────────────────────────────
  /** True when the last server fetch failed (network unavailable). */
  isOffline: boolean;
  /** True when using cached entitlements because we're offline. */
  usingCachedPlan: boolean;

  /**
   * Unified feature gate — combines local license + server entitlements.
   * Returns `true` when the feature is enabled by **either** the local
   * offline license key OR the server-side subscription flags.
   * Core playback is never gated.
   */
  canUse: (flagKey: string) => boolean;

  // ── Cloud Sync v1 ──────────────────────────────────────────────
  /** Whether cloud sync is enabled (PRO-only, persisted). */
  cloudSyncEnabled: boolean;
  /** Timestamp of last successful cloud sync (ms epoch). */
  cloudSyncLastAt: number;
  /** Whether a sync is currently in flight. */
  cloudSyncing: boolean;

  setCloudSyncEnabled: (enabled: boolean) => void;
  /** Pull cloud → merge into local. Never throws. */
  cloudPull: () => Promise<void>;
  /** Push local → cloud (debounced externally). Never throws. */
  cloudPush: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistFavorites(favs: Set<string>) {
  saveJson(P, "shogun:favorites", [...favs]);
}

// ── Store ─────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // locale
  locale: (loadJson<string>(P, "shogun:locale", "en") as Locale) || "en",
  setLocale: (l) => {
    saveJson(P, "shogun:locale", l);
    set({ locale: l });
  },

  // playlists
  playlistEntries: loadJson<PlaylistEntry[]>(P, "shogun:playlists", []),
  channels: loadJson<Channel[]>(P, "shogun:channels", []),

  addPlaylist: (entry, channels) => {
    const id = entry.id || uid();
    const newEntry = { ...entry, id };
    const entries = [...get().playlistEntries, newEntry];
    const allChannels = [...get().channels, ...channels];
    saveJson(P, "shogun:playlists", entries);
    saveJson(P, "shogun:channels", allChannels);
    set({ playlistEntries: entries, channels: allChannels });
  },

  removePlaylist: (id) => {
    const entries = get().playlistEntries.filter((e) => e.id !== id);
    // For simplicity, keep all channels (a full impl would track per-playlist)
    saveJson(P, "shogun:playlists", entries);
    set({ playlistEntries: entries });
  },

  // EPG
  epgEntries: loadJson<EpgEntry[]>(P, "shogun:epg-entries", []),
  epgIndex: loadJson<SerializedEpgIndex>(P, "shogun:epg-index", {}),
  programmes: loadJson<Programme[]>(P, "shogun:programmes", []),

  addEpg: (entry, programmes, index) => {
    const id = entry.id || uid();
    const newEntry = { ...entry, id };
    const entries = [...get().epgEntries, newEntry];
    const allProgrammes = [...get().programmes, ...programmes];
    // Merge indices
    const merged = { ...get().epgIndex, ...index };
    saveJson(P, "shogun:epg-entries", entries);
    saveJson(P, "shogun:programmes", allProgrammes);
    saveJson(P, "shogun:epg-index", merged);
    set({ epgEntries: entries, programmes: allProgrammes, epgIndex: merged });
  },

  removeEpg: (id) => {
    const entries = get().epgEntries.filter((e) => e.id !== id);
    saveJson(P, "shogun:epg-entries", entries);
    set({ epgEntries: entries });
  },

  // Favorites
  favorites: new Set(loadJson<string[]>(P, "shogun:favorites", [])),
  toggleFavorite: (url) => {
    const favs = new Set(get().favorites);
    if (favs.has(url)) favs.delete(url);
    else favs.add(url);
    persistFavorites(favs);
    set({ favorites: favs });
  },

  // Player
  currentChannel: null,
  setCurrentChannel: (ch) => set({ currentChannel: ch }),

  // ── DB-backed persistence ───────────────────────────────────────

  dbReady: false,
  dbPlaylists: [],
  dbEpgSources: [],
  dbFavorites: new Set<string>(),

  initFromDb: async () => {
    const [plRes, favRes, epgRes] = await Promise.all([
      bridge.dbListPlaylists(),
      bridge.dbListFavorites(),
      bridge.dbListEpgSources(),
    ]);

    const dbPlaylists = plRes.ok ? plRes.data : [];
    const dbFavorites = new Set(favRes.ok ? favRes.data : []);
    const dbEpgSources = epgRes.ok ? epgRes.data : [];

    // Also load all channels from DB to populate the in-memory channel list
    const chRes = await bridge.dbListChannels();
    if (chRes.ok && chRes.data.length > 0) {
      // Convert DB channel rows to the core Channel type for backward compat
      const dbChannels: Channel[] = chRes.data.map((r) => ({
        tvgId: r.tvgId,
        tvgName: r.name,
        name: r.name,
        tvgLogo: r.logo,
        groupTitle: r.groupTitle,
        url: r.streamUrl,
        duration: -1,
        extras: {},
      }));

      // Merge with any existing localStorage channels (prefer DB)
      const existingUrls = new Set(dbChannels.map((c) => c.url));
      const merged = [...dbChannels, ...get().channels.filter((c) => !existingUrls.has(c.url))];

      set({ channels: merged });
    }

    set({ dbReady: true, dbPlaylists, dbFavorites, dbEpgSources });

    // Load settings & watch history (non-blocking for startup)
    get().loadSettings().catch(() => { /* best-effort */ });
    get().loadWatchHistory().catch(() => { /* best-effort */ });
    get().loadLicense().catch(() => { /* best-effort */ });
  },

  dbSavePlaylist: async (name, sourceType, sourceValue, channels) => {
    const res = await bridge.dbSavePlaylist(name, sourceType, sourceValue, channels);
    if (!res.ok) return null;
    // Refresh playlists list
    const plRes = await bridge.dbListPlaylists();
    if (plRes.ok) set({ dbPlaylists: plRes.data });
    return res.data;
  },

  dbRemovePlaylist: async (id) => {
    await bridge.dbRemovePlaylist(id);
    const plRes = await bridge.dbListPlaylists();
    if (plRes.ok) set({ dbPlaylists: plRes.data });
    // Refresh channels
    const chRes = await bridge.dbListChannels();
    if (chRes.ok) {
      const dbChannels: Channel[] = chRes.data.map((r) => ({
        tvgId: r.tvgId,
        tvgName: r.name,
        name: r.name,
        tvgLogo: r.logo,
        groupTitle: r.groupTitle,
        url: r.streamUrl,
        duration: -1,
        extras: {},
      }));
      set({ channels: dbChannels });
    }
  },

  dbSaveEpgSource: async (name, sourceType, sourceValue, programmes) => {
    const res = await bridge.dbSaveEpgSource(name, sourceType, sourceValue, programmes);
    if (!res.ok) return null;
    const epgRes = await bridge.dbListEpgSources();
    if (epgRes.ok) set({ dbEpgSources: epgRes.data });
    return res.data;
  },

  dbRemoveEpgSource: async (id) => {
    await bridge.dbRemoveEpgSource(id);
    const epgRes = await bridge.dbListEpgSources();
    if (epgRes.ok) set({ dbEpgSources: epgRes.data });
  },

  dbToggleFavorite: async (channelId) => {
    const isFav = get().dbFavorites.has(channelId);
    await bridge.dbSetFavorite(channelId, !isFav);
    const favRes = await bridge.dbListFavorites();
    if (favRes.ok) set({ dbFavorites: new Set(favRes.data) });
  },

  // ── Settings (F8) ──────────────────────────────────────────────

  settings: {},

  loadSettings: async () => {
    const res = await bridge.dbGetAllSettings();
    if (res.ok) {
      set({ settings: res.data });
      // Apply locale from settings if present
      const savedLocale = res.data.locale;
      if (savedLocale && (savedLocale === "en" || savedLocale === "es" || savedLocale === "ja")) {
        set({ locale: savedLocale as Locale });
      }
    }
  },

  setSetting: async (key, value) => {
    await bridge.dbSetSetting(key, value);
    const current = get().settings;
    set({ settings: { ...current, [key]: value } });

    // Apply side-effects
    if (key === "locale" && (value === "en" || value === "es" || value === "ja")) {
      set({ locale: value as Locale });
      saveJson(P, "shogun:locale", value);
    }
  },

  // ── Watch History (F4) ─────────────────────────────────────────

  watchHistory: [],
  lastWatched: null,

  loadWatchHistory: async () => {
    const [histRes, lastRes] = await Promise.all([
      bridge.dbListWatchHistory(50),
      bridge.dbGetLastWatched(),
    ]);
    if (histRes.ok) set({ watchHistory: histRes.data });
    if (lastRes.ok) set({ lastWatched: lastRes.data });
  },

  saveWatch: async (channelUrl, channelName, channelLogo, groupTitle, startedAt, stoppedAt, durationSec) => {
    await bridge.dbSaveWatch(channelUrl, channelName, channelLogo, groupTitle, startedAt, stoppedAt, durationSec);
    // Refresh history
    const histRes = await bridge.dbListWatchHistory(50);
    if (histRes.ok) set({ watchHistory: histRes.data });
    const lastRes = await bridge.dbGetLastWatched();
    if (lastRes.ok) set({ lastWatched: lastRes.data });
  },

  clearWatchHistory: async () => {
    await bridge.dbClearWatchHistory();
    set({ watchHistory: [], lastWatched: null });
  },

  // ── Watch tracking ─────────────────────────────────────────────
  watchStartedAt: 0,
  setWatchStartedAt: (ts) => set({ watchStartedAt: ts }),

  // ── License / Pro ──────────────────────────────────────────────

  license: DEFAULT_LICENSE_STATUS,

  loadLicense: async () => {
    const res = await bridge.licenseGetStatus();
    if (res.ok) set({ license: res.data });
  },

  activateLicenseKey: async (key) => {
    const res = await bridge.licenseSetKey(key);
    if (res.ok) {
      set({ license: res.data });
      return res.data;
    }
    return null;
  },

  setProEnabled: async (enabled) => {
    const res = await bridge.licenseSetProEnabled(enabled);
    if (res.ok) {
      set({ license: res.data });
      return res.data;
    }
    return null;
  },

  isFeatureEnabled: (feature: Feature) => {
    return isFeatureEnabled(feature, get().license);
  },

  // ── Auth / SaaS ────────────────────────────────────────────────

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
        // We have valid tokens — fetch features (marks online)
        await get().fetchServerFeatures();
        // Cloud sync pull on startup (fire-and-forget)
        get().cloudPull().catch(() => { /* never block */ });
      } else {
        // Token refresh failed — check offline cache validity (7 days)
        const ts = get().serverFlagsTimestamp;
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        if (ts > 0 && Date.now() - ts > SEVEN_DAYS) {
          // Cache expired — reset to FREE defaults
          set({ authPlan: "FREE", subscriptionStatus: "NONE", billingInterval: null, currentPeriodEnd: null, trialEndsAt: null, isFoundingMember: false, serverFlags: {}, authUser: null, isOffline: false, usingCachedPlan: false });
          saveJson(P, "shogun:auth-plan", "FREE");
          saveJson(P, "shogun:subscription-status", "NONE");
          saveJson(P, "shogun:billing-interval", null);
          saveJson(P, "shogun:current-period-end", null);
          saveJson(P, "shogun:trial-ends-at", null);
          saveJson(P, "shogun:founding-member", false);
          saveJson(P, "shogun:server-flags", {});
          saveJson(P, "shogun:auth-user", null);
          // Force re-login so user can re-authenticate
          window.dispatchEvent(new CustomEvent("shogun:show-login"));
        } else if (ts > 0) {
          // Have valid cached data — offline grace period
          set({ isOffline: true, usingCachedPlan: true });
        }
        // If ts === 0, user was never logged in — nothing to do
      }
    } catch {
      // Network unavailable — offline mode, keep cached values
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
        // Fetch features right after login
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
        // Track upgrade completion
        if (prevPlan === "FREE" && res.data.plan === "PRO") {
          logCheckoutCompleted(res.data.billingInterval);
        }
      }
    } catch {
      // Offline — keep cached values, mark offline
      set({ isOffline: true, usingCachedPlan: get().serverFlagsTimestamp > 0 });
    }
  },

  isServerFeatureEnabled: (flagKey) => {
    const { serverFlags, authPlan, serverFlagsTimestamp } = get();
    // If we have no cached data or cache is older than 7 days, default to FREE
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (serverFlagsTimestamp === 0 || Date.now() - serverFlagsTimestamp > SEVEN_DAYS) {
      return false;
    }
    // Check explicit flag
    if (flagKey in serverFlags) return serverFlags[flagKey];
    // PRO plan → true by default
    return authPlan === "PRO";
  },

  // ── Entitlement hardening ──────────────────────────────────────

  isOffline: false,
  usingCachedPlan: false,

  canUse: (flagKey) => {
    // Local offline license always grants access (license key activation)
    if (get().license.isProEnabled) return true;
    // Server-side entitlement (respects 7-day cache TTL)
    return get().isServerFeatureEnabled(flagKey);
  },

  requestFeature: (flagKey) => {
    if (get().canUse(flagKey)) return true;
    // Feature gated — fire paywall
    logUpgradeIntent(flagKey);
    window.dispatchEvent(
      new CustomEvent("shogun:show-paywall", { detail: { feature: flagKey } }),
    );
    return false;
  },

  playlistLimitReached: () => {
    if (get().canUse("unlimited_playlists")) return false;
    const total = get().dbPlaylists.length || get().playlistEntries.length;
    return total >= FREE_PLAYLIST_LIMIT;
  },

  // ── Cloud Sync v1 ──────────────────────────────────────────────

  cloudSyncEnabled: loadJson<boolean>(P, "shogun:cloud-sync-enabled", false),
  cloudSyncLastAt: loadJson<number>(P, "shogun:cloud-sync-last", 0) ?? 0,
  cloudSyncing: false,

  setCloudSyncEnabled: (enabled) => {
    saveJson(P, "shogun:cloud-sync-enabled", enabled);
    set({ cloudSyncEnabled: enabled });
  },

  cloudPull: async () => {
    if (!get().cloudSyncEnabled || !get().authUser) return;
    set({ cloudSyncing: true });
    try {
      const res = await bridge.cloudSyncPull();
      if (!res.ok) return;

      const { settings, favorites, history, updatedAt } = res.data;

      // Merge settings — cloud wins for keys present in cloud
      if (settings && Object.keys(settings).length > 0) {
        const local = { ...get().settings };
        const merged = { ...local, ...settings };
        set({ settings: merged });
        // Persist each cloud key locally
        for (const [key, value] of Object.entries(settings)) {
          bridge.dbSetSetting(key, value).catch(() => { /* best-effort */ });
        }
      }

      // Merge favorites — union of local + cloud
      if (favorites && favorites.length > 0) {
        const local = get().favorites;
        const merged = new Set([...local, ...favorites]);
        persistFavorites(merged);
        set({ favorites: merged });
      }

      // Merge history — union by channelUrl+watchedAt, keep most recent
      if (history && history.length > 0) {
        // History is informational in the store (watchHistory comes from DB).
        // We store cloud history snapshot in localStorage for the push cycle.
        const existing = loadJson<typeof history>(P, "shogun:cloud-history", []);
        const byKey = new Map(existing.map((h) => [`${h.channelUrl}:${h.watchedAt}`, h]));
        for (const h of history) byKey.set(`${h.channelUrl}:${h.watchedAt}`, h);
        const merged = [...byKey.values()]
          .sort((a, b) => b.watchedAt - a.watchedAt)
          .slice(0, 50);
        saveJson(P, "shogun:cloud-history", merged);
      }

      if (updatedAt) {
        const ts = new Date(updatedAt).getTime();
        set({ cloudSyncLastAt: ts });
        saveJson(P, "shogun:cloud-sync-last", ts);
      }
    } catch {
      // Never block playback — swallow
    } finally {
      set({ cloudSyncing: false });
    }
  },

  cloudPush: async () => {
    if (!get().cloudSyncEnabled || !get().authUser) return;
    set({ cloudSyncing: true });
    try {
      const localSettings = { ...get().settings };
      const localFavorites = [...get().favorites];

      // Build bounded history from watch history
      const localHistory = get().watchHistory.slice(0, 50).map((w) => ({
        channelUrl: w.channelUrl,
        channelName: w.channelName,
        channelLogo: w.channelLogo ?? "",
        groupTitle: w.groupTitle ?? "",
        watchedAt: w.startedAt,
      }));

      const lastAt = get().cloudSyncLastAt;
      const localUpdatedAt = lastAt > 0
        ? new Date(lastAt).toISOString()
        : new Date(0).toISOString();

      const res = await bridge.cloudSyncPush({
        settings: localSettings,
        favorites: localFavorites,
        history: localHistory,
        localUpdatedAt,
      });

      if (!res.ok) return;

      if (res.data.conflict) {
        // Server was newer — re-pull to get latest then retry push
        await get().cloudPull();
        return;
      }

      if (res.data.updatedAt) {
        const ts = new Date(res.data.updatedAt).getTime();
        set({ cloudSyncLastAt: ts });
        saveJson(P, "shogun:cloud-sync-last", ts);
      }
    } catch {
      // Never block playback — swallow
    } finally {
      set({ cloudSyncing: false });
    }
  },
}));
