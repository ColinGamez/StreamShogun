import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "@stream-shogun/core";

/**
 * Secure preload bridge — `window.shogun`.
 *
 * Rules:
 *  • contextIsolation = true  → renderer JS cannot reach Node / Electron.
 *  • nodeIntegration  = false → no `require()` in renderer.
 *  • sandbox          = true  → Chromium sandbox active.
 *
 * Only typed, promise-returning functions are exposed.
 * The renderer never sees ipcRenderer, fs, or fetch directly.
 */
contextBridge.exposeInMainWorld("shogun", {
  // ── App ─────────────────────────────────────────────────────────
  getAppInfo: (): Promise<{ name: string; version: string }> =>
    ipcRenderer.invoke(IpcChannels.GET_APP_INFO),

  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.PING),

  // ── Playlists ───────────────────────────────────────────────────
  loadPlaylistFromFile: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.PLAYLIST_LOAD_FILE, filePath),

  loadPlaylistFromUrl: (url: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.PLAYLIST_LOAD_URL, url),

  // ── EPG ─────────────────────────────────────────────────────────
  loadEpgFromFile: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.EPG_LOAD_FILE, filePath),

  loadEpgFromUrl: (url: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.EPG_LOAD_URL, url),

  // ── DB-backed persistence ───────────────────────────────────────
  dbSavePlaylist: (args: {
    name: string;
    sourceType: string;
    sourceValue: string;
    channels: unknown[];
  }): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DB_SAVE_PLAYLIST, args),

  dbListPlaylists: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DB_LIST_PLAYLISTS),

  dbRemovePlaylist: (id: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_REMOVE_PLAYLIST, id),

  dbListChannels: (playlistId?: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_LIST_CHANNELS, playlistId),

  dbSetFavorite: (args: { channelId: string; isFavorite: boolean }): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_SET_FAVORITE, args),

  dbListFavorites: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DB_LIST_FAVORITES),

  dbSaveEpgSource: (args: {
    name: string;
    sourceType: string;
    sourceValue: string;
    programmes: unknown[];
  }): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DB_SAVE_EPG_SOURCE, args),

  dbListEpgSources: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DB_LIST_EPG_SOURCES),

  dbRemoveEpgSource: (id: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_REMOVE_EPG_SOURCE, id),

  dbGetNowNext: (args: { channelId: string; now?: number }): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_GET_NOW_NEXT, args),

  dbGetEpgRange: (args: { channelId: string; start: number; stop: number }): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_GET_EPG_RANGE, args),

  // ── Settings (F8) ──────────────────────────────────────────────
  dbGetAllSettings: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_GET_ALL_SETTINGS),

  dbSetSetting: (args: { key: string; value: string }): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_SET_SETTING, args),

  // ── Watch History (F4) ─────────────────────────────────────────
  dbSaveWatch: (args: {
    channelUrl: string;
    channelName: string;
    channelLogo: string;
    groupTitle: string;
    startedAt: number;
    stoppedAt: number;
    durationSec: number;
  }): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DB_SAVE_WATCH, args),

  dbListWatchHistory: (limit?: number): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_LIST_WATCH_HISTORY, limit),

  dbGetLastWatched: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_GET_LAST_WATCHED),

  dbClearWatchHistory: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DB_CLEAR_WATCH_HISTORY),

  // ── Auto Refresh (F1) ─────────────────────────────────────────
  refreshSetInterval: (args: { minutes: number; enabled: boolean }): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.REFRESH_SET_INTERVAL, args),

  refreshTrigger: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.REFRESH_TRIGGER),

  refreshGetStatus: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.REFRESH_GET_STATUS),

  /** Subscribe to refresh-completed push events from main process. */
  onRefreshCompleted: (callback: (payload: unknown) => void): (() => void) => {
    const handler = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on(IpcChannels.REFRESH_COMPLETED, handler);
    return () => ipcRenderer.removeListener(IpcChannels.REFRESH_COMPLETED, handler);
  },

  // ── Mini Player / PIP (F5) ────────────────────────────────────
  pipOpen: (args: { channelUrl: string; channelName: string }): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.PIP_OPEN, args),

  pipClose: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.PIP_CLOSE),

  pipIsOpen: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.PIP_IS_OPEN),

  // ── Discord Rich Presence (F6) ────────────────────────────────
  discordSetActivity: (args: {
    details: string;
    state?: string;
    startTimestamp?: number;
  }): Promise<unknown> => ipcRenderer.invoke(IpcChannels.DISCORD_SET_ACTIVITY, args),

  discordClearActivity: (): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.DISCORD_CLEAR_ACTIVITY),
});

// Keep the legacy "electronAPI" alias for backward-compat with the UI
contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: (): Promise<{ name: string; version: string }> =>
    ipcRenderer.invoke(IpcChannels.GET_APP_INFO),

  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.PING),
});
