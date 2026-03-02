// ── Cloud Sync slice (pull / push sync with server) ──────────────────
import type { StateCreator } from "zustand";
import type { AppState } from "../app-store";
import { localStorageAdapter, loadJson, saveJson } from "../../lib/persistence";
import { persistFavorites } from "./library-slice";
import * as bridge from "../../lib/bridge";

const P = localStorageAdapter;

export interface CloudSyncSlice {
  cloudSyncEnabled: boolean;
  cloudSyncLastAt: number;
  cloudSyncing: boolean;

  setCloudSyncEnabled: (enabled: boolean) => void;
  cloudPull: () => Promise<void>;
  cloudPush: () => Promise<void>;
}

export const createCloudSyncSlice: StateCreator<AppState, [], [], CloudSyncSlice> = (set, get) => ({
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

      // Merge history
      if (history && history.length > 0) {
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
    } catch (err) {
      console.warn("[cloud-sync] pull failed:", err);
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
        await get().cloudPull();
        return;
      }

      if (res.data.updatedAt) {
        const ts = new Date(res.data.updatedAt).getTime();
        set({ cloudSyncLastAt: ts });
        saveJson(P, "shogun:cloud-sync-last", ts);
      }
    } catch (err) {
      console.warn("[cloud-sync] push failed:", err);
    } finally {
      set({ cloudSyncing: false });
    }
  },
});
