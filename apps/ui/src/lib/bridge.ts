// ── Bridge – thin wrapper over window.shogun / fallbacks ─────────────
//
// In Electron the real IPC bridge is used.
// In browser-dev mode we provide stubs that return mock data.

import type {
  IpcResponse,
  EpgLoadResult,
  DbPlaylistRow,
  DbChannelRow,
  DbEpgSourceRow,
  DbProgrammeRow,
  DbNowNextResult,
  DbWatchHistoryRow,
  RefreshStatus,
} from "../vite-env";
import type { Playlist, Channel, Programme, LicenseStatus } from "@stream-shogun/core";

function hasBridge(): boolean {
  return typeof window !== "undefined" && !!window.shogun;
}

const NO_BRIDGE: IpcResponse<never> = {
  ok: false,
  error: "No Electron bridge — run inside the desktop app",
};

// ── Original load-and-parse endpoints ─────────────────────────────────

export async function loadPlaylistFromUrl(url: string): Promise<IpcResponse<Playlist>> {
  if (hasBridge()) return window.shogun!.loadPlaylistFromUrl(url);
  return NO_BRIDGE;
}

export async function loadPlaylistFromFile(path: string): Promise<IpcResponse<Playlist>> {
  if (hasBridge()) return window.shogun!.loadPlaylistFromFile(path);
  return NO_BRIDGE;
}

export async function loadEpgFromUrl(url: string): Promise<IpcResponse<EpgLoadResult>> {
  if (hasBridge()) return window.shogun!.loadEpgFromUrl(url);
  return NO_BRIDGE;
}

export async function loadEpgFromFile(path: string): Promise<IpcResponse<EpgLoadResult>> {
  if (hasBridge()) return window.shogun!.loadEpgFromFile(path);
  return NO_BRIDGE;
}

export async function getAppInfo(): Promise<{ name: string; version: string }> {
  if (hasBridge()) return window.shogun!.getAppInfo();
  return { name: "StreamShōgun", version: "0.1.0-dev" };
}

// ── DB-backed persistence endpoints ───────────────────────────────────

export async function dbSavePlaylist(
  name: string,
  sourceType: "url" | "file",
  sourceValue: string,
  channels: Channel[],
): Promise<IpcResponse<DbPlaylistRow>> {
  if (hasBridge())
    return window.shogun!.dbSavePlaylist({ name, sourceType, sourceValue, channels });
  return NO_BRIDGE;
}

export async function dbListPlaylists(): Promise<IpcResponse<DbPlaylistRow[]>> {
  if (hasBridge()) return window.shogun!.dbListPlaylists();
  return NO_BRIDGE;
}

export async function dbRemovePlaylist(id: string): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.dbRemovePlaylist(id);
  return NO_BRIDGE;
}

export async function dbListChannels(playlistId?: string): Promise<IpcResponse<DbChannelRow[]>> {
  if (hasBridge()) return window.shogun!.dbListChannels(playlistId);
  return NO_BRIDGE;
}

export async function dbSetFavorite(
  channelId: string,
  isFavorite: boolean,
): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.dbSetFavorite({ channelId, isFavorite });
  return NO_BRIDGE;
}

export async function dbListFavorites(): Promise<IpcResponse<string[]>> {
  if (hasBridge()) return window.shogun!.dbListFavorites();
  return NO_BRIDGE;
}

export async function dbSaveEpgSource(
  name: string,
  sourceType: "url" | "file",
  sourceValue: string,
  programmes: Programme[],
): Promise<IpcResponse<DbEpgSourceRow>> {
  if (hasBridge())
    return window.shogun!.dbSaveEpgSource({ name, sourceType, sourceValue, programmes });
  return NO_BRIDGE;
}

export async function dbListEpgSources(): Promise<IpcResponse<DbEpgSourceRow[]>> {
  if (hasBridge()) return window.shogun!.dbListEpgSources();
  return NO_BRIDGE;
}

export async function dbRemoveEpgSource(id: string): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.dbRemoveEpgSource(id);
  return NO_BRIDGE;
}

export async function dbGetNowNext(
  channelId: string,
  now?: number,
): Promise<IpcResponse<DbNowNextResult>> {
  if (hasBridge()) return window.shogun!.dbGetNowNext({ channelId, now });
  return NO_BRIDGE;
}

export async function dbGetEpgRange(
  channelId: string,
  start: number,
  stop: number,
): Promise<IpcResponse<DbProgrammeRow[]>> {
  if (hasBridge()) return window.shogun!.dbGetEpgRange({ channelId, start, stop });
  return NO_BRIDGE;
}

// ── Settings (F8) ─────────────────────────────────────────────────────

export async function dbGetAllSettings(): Promise<IpcResponse<Record<string, string>>> {
  if (hasBridge()) return window.shogun!.dbGetAllSettings();
  return NO_BRIDGE;
}

export async function dbSetSetting(
  key: string,
  value: string,
): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.dbSetSetting({ key, value });
  return NO_BRIDGE;
}

// ── Watch History (F4) ────────────────────────────────────────────────

export async function dbSaveWatch(
  channelUrl: string,
  channelName: string,
  channelLogo: string,
  groupTitle: string,
  startedAt: number,
  stoppedAt: number,
  durationSec: number,
): Promise<IpcResponse<DbWatchHistoryRow>> {
  if (hasBridge())
    return window.shogun!.dbSaveWatch({
      channelUrl,
      channelName,
      channelLogo,
      groupTitle,
      startedAt,
      stoppedAt,
      durationSec,
    });
  return NO_BRIDGE;
}

export async function dbListWatchHistory(
  limit?: number,
): Promise<IpcResponse<DbWatchHistoryRow[]>> {
  if (hasBridge()) return window.shogun!.dbListWatchHistory(limit);
  return NO_BRIDGE;
}

export async function dbGetLastWatched(): Promise<IpcResponse<DbWatchHistoryRow | null>> {
  if (hasBridge()) return window.shogun!.dbGetLastWatched();
  return NO_BRIDGE;
}

export async function dbClearWatchHistory(): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.dbClearWatchHistory();
  return NO_BRIDGE;
}

// ── Auto Refresh (F1) ────────────────────────────────────────────────

export async function refreshSetInterval(
  minutes: number,
  enabled: boolean,
): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.refreshSetInterval({ minutes, enabled });
  return NO_BRIDGE;
}

export async function refreshTrigger(): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.refreshTrigger();
  return NO_BRIDGE;
}

export async function refreshGetStatus(): Promise<IpcResponse<RefreshStatus>> {
  if (hasBridge()) return window.shogun!.refreshGetStatus();
  return NO_BRIDGE;
}

export function onRefreshCompleted(
  callback: (payload: unknown) => void,
): () => void {
  if (hasBridge()) return window.shogun!.onRefreshCompleted(callback);
  return () => { /* noop */ };
}

// ── Mini Player / PIP (F5) ───────────────────────────────────────────

export async function pipOpen(
  channelUrl: string,
  channelName: string,
): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.pipOpen({ channelUrl, channelName });
  return NO_BRIDGE;
}

export async function pipClose(): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.pipClose();
  return NO_BRIDGE;
}

export async function pipIsOpen(): Promise<IpcResponse<boolean>> {
  if (hasBridge()) return window.shogun!.pipIsOpen();
  return NO_BRIDGE;
}

// ── Discord Rich Presence (F6) ───────────────────────────────────────

export async function discordSetActivity(
  details: string,
  state?: string,
  startTimestamp?: number,
): Promise<IpcResponse<null>> {
  if (hasBridge())
    return window.shogun!.discordSetActivity({ details, state, startTimestamp });
  return NO_BRIDGE;
}

export async function discordClearActivity(): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.discordClearActivity();
  return NO_BRIDGE;
}

// ── License / Pro (Monetization) ─────────────────────────────────────

export async function licenseGetStatus(): Promise<IpcResponse<LicenseStatus>> {
  if (hasBridge()) return window.shogun!.licenseGetStatus();
  return NO_BRIDGE;
}

export async function licenseSetKey(key: string): Promise<IpcResponse<LicenseStatus>> {
  if (hasBridge()) return window.shogun!.licenseSetKey({ key });
  return NO_BRIDGE;
}

export async function licenseSetProEnabled(enabled: boolean): Promise<IpcResponse<LicenseStatus>> {
  if (hasBridge()) return window.shogun!.licenseSetProEnabled({ enabled });
  return NO_BRIDGE;
}

// ── Auth / SaaS ──────────────────────────────────────────────────────

export interface AuthResponseData {
  user: { id: string; email: string; displayName?: string; createdAt: string };
  subscription: { plan: string; status: string; currentPeriodEnd?: string };
  accessToken: string;
  refreshToken: string;
}

export async function authRegister(
  email: string,
  password: string,
  displayName?: string
): Promise<IpcResponse<AuthResponseData>> {
  if (hasBridge()) return window.shogun!.authRegister({ email, password, displayName });
  return NO_BRIDGE;
}

export async function authLogin(
  email: string,
  password: string
): Promise<IpcResponse<AuthResponseData>> {
  if (hasBridge()) return window.shogun!.authLogin({ email, password });
  return NO_BRIDGE;
}

export async function authLogout(): Promise<IpcResponse<null>> {
  if (hasBridge()) return window.shogun!.authLogout();
  return NO_BRIDGE;
}

export async function authRefresh(): Promise<IpcResponse<{ hasTokens: boolean }>> {
  if (hasBridge()) return window.shogun!.authRefresh();
  return NO_BRIDGE;
}

export async function featuresFetch(): Promise<IpcResponse<{ plan: string; flags: Record<string, boolean> }>> {
  if (hasBridge()) return window.shogun!.featuresFetch();
  return NO_BRIDGE;
}

// ── Cloud Sync v1 ────────────────────────────────────────────────────

import type { CloudSyncPayload, CloudHistoryItem } from "@stream-shogun/shared";

export async function cloudSyncPull(): Promise<IpcResponse<CloudSyncPayload>> {
  if (hasBridge()) return window.shogun!.cloudSyncPull();
  return NO_BRIDGE;
}

export type CloudSyncPushResult = CloudSyncPayload & { conflict: boolean };

export async function cloudSyncPush(args: {
  settings?: Record<string, string>;
  favorites?: string[];
  history?: CloudHistoryItem[];
  localUpdatedAt: string;
}): Promise<IpcResponse<CloudSyncPushResult>> {
  if (hasBridge()) return window.shogun!.cloudSyncPush(args);
  return NO_BRIDGE;
}
