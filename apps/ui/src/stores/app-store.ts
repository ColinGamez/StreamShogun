// ── Application store (Zustand) ───────────────────────────────────────

import { create } from "zustand";
import type { Channel, Programme } from "@stream-shogun/core";
import type {
  SerializedEpgIndex,
  DbPlaylistRow,
  DbEpgSourceRow,
  DbWatchHistoryRow,
} from "../vite-env";
import type { Locale } from "../lib/i18n";
import { localStorageAdapter, loadJson, saveJson } from "../lib/persistence";
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
}));
