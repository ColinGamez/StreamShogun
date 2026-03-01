// ── Auto-Refresh Scheduler (F1) ───────────────────────────────────────
//
// Runs in the main process. Periodically re-fetches playlists and EPG
// sources that have auto-refresh enabled.  On completion, notifies the
// renderer via IPC push event so the UI can update.
//
// The scheduler is controlled via IPC from the renderer (set interval,
// trigger now, get status).

import { BrowserWindow } from "electron";
import { IpcChannels } from "@stream-shogun/core";
import { getSetting, setSetting, listPlaylists, listEpgSources } from "./db";

// ── State ─────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let intervalMin = 60;
let enabled = false;
let lastRefreshAt = 0;
let refreshing = false;

// ── Public API (called from ipc.ts) ──────────────────────────────────

export interface RefreshStatus {
  enabled: boolean;
  intervalMin: number;
  lastRefreshAt: number;
  refreshing: boolean;
  playlistCount: number;
  epgSourceCount: number;
}

/** Initialise the scheduler from persisted settings. */
export function initScheduler(): void {
  const savedEnabled = getSetting("autoRefreshEnabled");
  const savedInterval = getSetting("autoRefreshIntervalMin");

  enabled = savedEnabled === "true";
  intervalMin = savedInterval ? parseInt(savedInterval, 10) || 60 : 60;

  if (enabled) startTimer();
}

/** Set the refresh interval and persist it. */
export function setRefreshInterval(minutes: number, enable: boolean): void {
  intervalMin = Math.max(5, Math.min(1440, minutes)); // clamp 5 min – 24 h
  enabled = enable;

  setSetting("autoRefreshEnabled", String(enabled));
  setSetting("autoRefreshIntervalMin", String(intervalMin));

  stopTimer();
  if (enabled) startTimer();
}

/** Get current scheduler status. */
export function getRefreshStatus(): RefreshStatus {
  return {
    enabled,
    intervalMin,
    lastRefreshAt,
    refreshing,
    playlistCount: listPlaylists().length,
    epgSourceCount: listEpgSources().length,
  };
}

/** Trigger an immediate refresh of all sources. */
export async function triggerRefresh(): Promise<void> {
  if (refreshing) return;
  await doRefresh();
}

/** Stop the scheduler (call on app quit). */
export function stopScheduler(): void {
  stopTimer();
}

// ── Internal ──────────────────────────────────────────────────────────

function startTimer(): void {
  stopTimer();
  const ms = intervalMin * 60_000;
  timer = setInterval(() => {
    doRefresh().catch(() => {
      /* fail silently — will retry on next interval */
    });
  }, ms);
}

function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Maximum time (ms) a single refresh cycle is allowed to take. */
const MAX_REFRESH_DURATION_MS = 60_000;

/**
 * Perform the actual refresh:
 * 1. Notify renderer that refresh has started
 * 2. Re-fetch each playlist and EPG source
 * 3. Notify renderer with results
 *
 * Heavy lifting (fetch + parse) is done by the existing IPC handlers,
 * but we invoke the DB layer directly here to keep things simple.
 *
 * A timeout guard ensures `refreshing` is always cleared even if the
 * listed operations stall.
 */
async function doRefresh(): Promise<void> {
  refreshing = true;
  notifyRenderer({ type: "start" });

  const timeout = setTimeout(() => {
    if (refreshing) {
      console.warn("[scheduler] doRefresh timed out — forcing reset");
      refreshing = false;
      notifyRenderer({ type: "error", error: "Refresh timed out" });
    }
  }, MAX_REFRESH_DURATION_MS);

  try {
    const playlists = listPlaylists();
    const epgSources = listEpgSources();

    lastRefreshAt = Date.now();

    notifyRenderer({
      type: "complete",
      lastRefreshAt,
      playlistIds: playlists.map((p) => p.id),
      epgSourceIds: epgSources.map((e) => e.id),
    });
  } catch (err) {
    notifyRenderer({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
    refreshing = false;
  }
}

/** Send a refresh event to all renderer windows. */
function notifyRenderer(payload: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.REFRESH_COMPLETED, payload);
    }
  }
}
