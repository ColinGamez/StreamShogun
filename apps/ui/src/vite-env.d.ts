/// <reference types="vite/client" />

import type { Playlist, Programme, XmltvChannel } from "@stream-shogun/core";

// ── IPC response wrapper (mirrors desktop/ipc.ts) ─────────────────────
export interface IpcOk<T> {
  ok: true;
  data: T;
}
export interface IpcErr {
  ok: false;
  error: string;
}
export type IpcResponse<T> = IpcOk<T> | IpcErr;

// ── Serialized EPG index (Map doesn't survive IPC) ────────────────────
export type SerializedEpgIndex = Record<string, Programme[]>;

export interface EpgLoadResult {
  channels: XmltvChannel[];
  programmes: Programme[];
  index: SerializedEpgIndex;
}

// ── DB row types returned by the persistence IPC ──────────────────────

export interface DbPlaylistRow {
  id: string;
  name: string;
  sourceType: "url" | "file";
  sourceValue: string;
  lastFetchedAt: number;
  channelCount: number;
}

export interface DbChannelRow {
  id: string;
  playlistId: string;
  tvgId: string;
  name: string;
  logo: string;
  groupTitle: string;
  streamUrl: string;
}

export interface DbEpgSourceRow {
  id: string;
  name: string;
  sourceType: "url" | "file";
  sourceValue: string;
  lastFetchedAt: number;
  programmeCount: number;
}

export interface DbProgrammeRow {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  subtitle: string;
  description: string;
  categories: string[];
  episodeNum: string;
  icon: string;
  rating: string;
}

export interface DbNowNextResult {
  now: DbProgrammeRow | null;
  next: DbProgrammeRow | null;
}

// ── Watch history row (F4) ────────────────────────────────────────────
export interface DbWatchHistoryRow {
  id: number;
  channelUrl: string;
  channelName: string;
  channelLogo: string;
  groupTitle: string;
  startedAt: number;
  stoppedAt: number;
  durationSec: number;
}

// ── Refresh status (F1) ──────────────────────────────────────────────
export interface RefreshStatus {
  enabled: boolean;
  intervalMin: number;
  lastRefreshAt: number;
  refreshing: boolean;
  playlistCount: number;
  epgSourceCount: number;
}

// ── window.shogun bridge ──────────────────────────────────────────────
export interface ShogunAPI {
  getAppInfo: () => Promise<{ name: string; version: string }>;
  ping: () => Promise<string>;
  loadPlaylistFromFile: (filePath: string) => Promise<IpcResponse<Playlist>>;
  loadPlaylistFromUrl: (url: string) => Promise<IpcResponse<Playlist>>;
  loadEpgFromFile: (filePath: string) => Promise<IpcResponse<EpgLoadResult>>;
  loadEpgFromUrl: (url: string) => Promise<IpcResponse<EpgLoadResult>>;

  // DB-backed persistence
  dbSavePlaylist: (args: {
    name: string;
    sourceType: string;
    sourceValue: string;
    channels: unknown[];
  }) => Promise<IpcResponse<DbPlaylistRow>>;
  dbListPlaylists: () => Promise<IpcResponse<DbPlaylistRow[]>>;
  dbRemovePlaylist: (id: string) => Promise<IpcResponse<null>>;
  dbListChannels: (playlistId?: string) => Promise<IpcResponse<DbChannelRow[]>>;
  dbSetFavorite: (args: { channelId: string; isFavorite: boolean }) => Promise<IpcResponse<null>>;
  dbListFavorites: () => Promise<IpcResponse<string[]>>;
  dbSaveEpgSource: (args: {
    name: string;
    sourceType: string;
    sourceValue: string;
    programmes: unknown[];
  }) => Promise<IpcResponse<DbEpgSourceRow>>;
  dbListEpgSources: () => Promise<IpcResponse<DbEpgSourceRow[]>>;
  dbRemoveEpgSource: (id: string) => Promise<IpcResponse<null>>;
  dbGetNowNext: (args: {
    channelId: string;
    now?: number;
  }) => Promise<IpcResponse<DbNowNextResult>>;
  dbGetEpgRange: (args: {
    channelId: string;
    start: number;
    stop: number;
  }) => Promise<IpcResponse<DbProgrammeRow[]>>;

  // Settings (F8)
  dbGetAllSettings: () => Promise<IpcResponse<Record<string, string>>>;
  dbSetSetting: (args: { key: string; value: string }) => Promise<IpcResponse<null>>;

  // Watch History (F4)
  dbSaveWatch: (args: {
    channelUrl: string;
    channelName: string;
    channelLogo: string;
    groupTitle: string;
    startedAt: number;
    stoppedAt: number;
    durationSec: number;
  }) => Promise<IpcResponse<DbWatchHistoryRow>>;
  dbListWatchHistory: (limit?: number) => Promise<IpcResponse<DbWatchHistoryRow[]>>;
  dbGetLastWatched: () => Promise<IpcResponse<DbWatchHistoryRow | null>>;
  dbClearWatchHistory: () => Promise<IpcResponse<null>>;

  // Auto Refresh (F1)
  refreshSetInterval: (args: { minutes: number; enabled: boolean }) => Promise<IpcResponse<null>>;
  refreshTrigger: () => Promise<IpcResponse<null>>;
  refreshGetStatus: () => Promise<IpcResponse<RefreshStatus>>;
  onRefreshCompleted: (callback: (payload: unknown) => void) => () => void;

  // Mini Player / PIP (F5)
  pipOpen: (args: { channelUrl: string; channelName: string }) => Promise<IpcResponse<null>>;
  pipClose: () => Promise<IpcResponse<null>>;
  pipIsOpen: () => Promise<IpcResponse<boolean>>;

  // Discord Rich Presence (F6)
  discordSetActivity: (args: {
    details: string;
    state?: string;
    startTimestamp?: number;
  }) => Promise<IpcResponse<null>>;
  discordClearActivity: () => Promise<IpcResponse<null>>;
}

// Legacy
export interface ElectronAPI {
  getAppInfo: () => Promise<{ name: string; version: string }>;
  ping: () => Promise<string>;
}

declare global {
  interface Window {
    shogun?: ShogunAPI;
    electronAPI?: ElectronAPI;
  }
}
