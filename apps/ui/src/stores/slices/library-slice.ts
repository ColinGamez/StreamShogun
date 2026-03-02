// ── Library slice (playlists, channels, EPG, favorites, DB persistence) ──
import type { StateCreator } from "zustand";
import type { AppState, PlaylistEntry, EpgEntry } from "../app-store";
import type { Channel, Programme } from "@stream-shogun/core";
import { FREE_PLAYLIST_LIMIT } from "@stream-shogun/shared";
import type {
  SerializedEpgIndex,
  DbPlaylistRow,
  DbEpgSourceRow,
} from "../../vite-env";
import { localStorageAdapter, loadJson, saveJson } from "../../lib/persistence";
import * as bridge from "../../lib/bridge";

const P = localStorageAdapter;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistFavorites(favs: Set<string>) {
  saveJson(P, "shogun:favorites", [...favs]);
}

export { persistFavorites };

export interface LibrarySlice {
  playlistEntries: PlaylistEntry[];
  channels: Channel[];
  addPlaylist: (entry: PlaylistEntry, channels: Channel[]) => void;
  removePlaylist: (id: string) => void;

  epgEntries: EpgEntry[];
  epgIndex: SerializedEpgIndex;
  programmes: Programme[];
  addEpg: (entry: EpgEntry, programmes: Programme[], index: SerializedEpgIndex) => void;
  removeEpg: (id: string) => void;

  favorites: Set<string>;
  toggleFavorite: (url: string) => void;

  dbReady: boolean;
  dbPlaylists: DbPlaylistRow[];
  dbEpgSources: DbEpgSourceRow[];
  dbFavorites: Set<string>;

  initFromDb: () => Promise<void>;
  dbSavePlaylist: (
    name: string,
    sourceType: "url" | "file",
    sourceValue: string,
    channels: Channel[],
  ) => Promise<DbPlaylistRow | null>;
  dbRemovePlaylist: (id: string) => Promise<void>;
  dbSaveEpgSource: (
    name: string,
    sourceType: "url" | "file",
    sourceValue: string,
    programmes: Programme[],
  ) => Promise<DbEpgSourceRow | null>;
  dbRemoveEpgSource: (id: string) => Promise<void>;
  dbToggleFavorite: (channelId: string) => Promise<void>;

  playlistLimitReached: () => boolean;
}

export const createLibrarySlice: StateCreator<AppState, [], [], LibrarySlice> = (set, get) => ({
  // ── In-memory playlists ────────────────────────────────────────
  playlistEntries: loadJson<PlaylistEntry[]>(P, "shogun:playlists", []),
  channels: loadJson<Channel[]>(P, "shogun:channels", []),

  addPlaylist: (entry, channels) => {
    const id = entry.id || uid();
    const newEntry = { ...entry, id };
    const entries = [...get().playlistEntries, newEntry];
    // Deduplicate channels by URL to prevent accumulation on re-add
    const existingUrls = new Set(get().channels.map((c) => c.url));
    const newChannels = channels.filter((c) => !existingUrls.has(c.url));
    const allChannels = [...get().channels, ...newChannels];
    saveJson(P, "shogun:playlists", entries);
    saveJson(P, "shogun:channels", allChannels);
    set({ playlistEntries: entries, channels: allChannels });
  },

  removePlaylist: (id) => {
    const removed = get().playlistEntries.find((e) => e.id === id);
    const entries = get().playlistEntries.filter((e) => e.id !== id);
    saveJson(P, "shogun:playlists", entries);
    // If the removed entry stored a location, remove its channels too.
    // For the in-memory path we rebuild from remaining playlists' channels.
    // Since channels don't track which playlist they belong to, we must
    // keep only channels whose URL still appears in a remaining playlist.
    // However, we lack a per-playlist → channel mapping in the in-memory
    // path, so clearing all channels from the removed entry isn't feasible.
    // Best-effort: just persist the entry list. The DB-backed path
    // (dbRemovePlaylist) already reloads channels correctly.
    set({ playlistEntries: entries });
    if (removed) {
      saveJson(P, "shogun:playlists", entries);
    }
  },

  // ── EPG ────────────────────────────────────────────────────────
  epgEntries: loadJson<EpgEntry[]>(P, "shogun:epg-entries", []),
  epgIndex: loadJson<SerializedEpgIndex>(P, "shogun:epg-index", {}),
  programmes: loadJson<Programme[]>(P, "shogun:programmes", []),

  addEpg: (entry, programmes, index) => {
    const id = entry.id || uid();
    const newEntry = { ...entry, id };
    const entries = [...get().epgEntries, newEntry];
    const allProgrammes = [...get().programmes, ...programmes];
    const merged = { ...get().epgIndex, ...index };
    saveJson(P, "shogun:epg-entries", entries);
    saveJson(P, "shogun:programmes", allProgrammes);
    saveJson(P, "shogun:epg-index", merged);
    set({ epgEntries: entries, programmes: allProgrammes, epgIndex: merged });
  },

  removeEpg: (id) => {
    const entries = get().epgEntries.filter((e) => e.id !== id);
    // Rebuild programmes and epgIndex from remaining entries.
    // Since we can't easily re-derive them, clear stale state.
    // When no EPG entries remain, wipe all EPG data.
    if (entries.length === 0) {
      saveJson(P, "shogun:epg-entries", entries);
      saveJson(P, "shogun:programmes", []);
      saveJson(P, "shogun:epg-index", {});
      set({ epgEntries: entries, programmes: [], epgIndex: {} });
    } else {
      saveJson(P, "shogun:epg-entries", entries);
      set({ epgEntries: entries });
    }
  },

  // ── Favorites ──────────────────────────────────────────────────
  favorites: new Set(loadJson<string[]>(P, "shogun:favorites", [])),

  toggleFavorite: (url) => {
    const favs = new Set(get().favorites);
    if (favs.has(url)) favs.delete(url);
    else favs.add(url);
    persistFavorites(favs);
    set({ favorites: favs });
  },

  // ── DB-backed persistence ──────────────────────────────────────

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

    const chRes = await bridge.dbListChannels();
    if (chRes.ok && chRes.data.length > 0) {
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

      const existingUrls = new Set(dbChannels.map((c) => c.url));
      const merged = [...dbChannels, ...get().channels.filter((c) => !existingUrls.has(c.url))];
      set({ channels: merged });
    }

    set({ dbReady: true, dbPlaylists, dbFavorites, dbEpgSources });

    // Load other subsystems (non-blocking)
    get().loadSettings().catch(() => { /* best-effort */ });
    get().loadWatchHistory().catch(() => { /* best-effort */ });
    get().loadLicense().catch(() => { /* best-effort */ });
  },

  dbSavePlaylist: async (name, sourceType, sourceValue, channels) => {
    const res = await bridge.dbSavePlaylist(name, sourceType, sourceValue, channels);
    if (!res.ok) return null;
    const plRes = await bridge.dbListPlaylists();
    if (plRes.ok) set({ dbPlaylists: plRes.data });
    return res.data;
  },

  dbRemovePlaylist: async (id) => {
    await bridge.dbRemovePlaylist(id);
    const plRes = await bridge.dbListPlaylists();
    if (plRes.ok) set({ dbPlaylists: plRes.data });
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

  playlistLimitReached: () => {
    if (get().canUse("unlimited_playlists")) return false;
    const total = get().dbPlaylists.length || get().playlistEntries.length;
    return total >= FREE_PLAYLIST_LIMIT;
  },
});
