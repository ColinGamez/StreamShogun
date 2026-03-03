// ── Player slice (current channel, watch history, watch tracking) ────
import type { StateCreator } from "zustand";
import type { AppState } from "../app-store";
import type { Channel } from "@stream-shogun/core";
import type { DbWatchHistoryRow } from "../../vite-env";
import * as bridge from "../../lib/bridge";

export interface PlayerSlice {
  currentChannel: Channel | null;
  setCurrentChannel: (ch: Channel | null) => void;

  watchHistory: DbWatchHistoryRow[];
  lastWatched: DbWatchHistoryRow | null;
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

  watchStartedAt: number;
  setWatchStartedAt: (ts: number) => void;
}

export const createPlayerSlice: StateCreator<AppState, [], [], PlayerSlice> = (set, _get) => ({
  currentChannel: null,
  setCurrentChannel: (ch) => set({ currentChannel: ch }),

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
    const histRes = await bridge.dbListWatchHistory(50);
    if (histRes.ok) set({ watchHistory: histRes.data });
    const lastRes = await bridge.dbGetLastWatched();
    if (lastRes.ok) set({ lastWatched: lastRes.data });
  },

  clearWatchHistory: async () => {
    await bridge.dbClearWatchHistory();
    set({ watchHistory: [], lastWatched: null });
  },

  watchStartedAt: 0,
  setWatchStartedAt: (ts) => set({ watchStartedAt: ts }),
});
