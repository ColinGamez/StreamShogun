// ── Auto-Refresh Scheduler (F1) ───────────────────────────────────────
//
// Runs in the main process. Periodically re-fetches playlists and EPG
// sources that have auto-refresh enabled.  On completion, notifies the
// renderer via IPC push event so the UI can update.
//
// The scheduler is controlled via IPC from the renderer (set interval,
// trigger now, get status).

import { BrowserWindow, app } from "electron";
import { IpcChannels, parseM3U, parseXmltv } from "@stream-shogun/core";
import { fetchText as fetchNetworkText } from "./network-fetch";
import {
  getSetting,
  setSetting,
  listPlaylists,
  listEpgSources,
  savePlaylist,
  saveEpgSource,
} from "./db";

// ── State ─────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let intervalMin = 60;
let enabled = false;
let lastRefreshAt = 0;
let refreshing = false;
/** Set when the watchdog fires while a run is still in flight. */
let timedOut = false;

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
  // Defense in depth: the IPC handler validates first, but never let a NaN
  // or out-of-range value drive setInterval (NaN fires immediately).
  if (!Number.isFinite(minutes)) {
    throw new Error("refresh interval must be a finite number");
  }
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
 * 2. Re-fetch each URL-based playlist and EPG source
 * 3. Re-parse and persist updated data
 * 4. Notify renderer with results
 */
async function doRefresh(): Promise<void> {
  refreshing = true;
  timedOut = false;
  notifyRenderer({ type: "start" });

  const timeout = setTimeout(() => {
    if (refreshing) {
      // Flag the timeout but KEEP the guard set: the run is still in flight
      // and must not be overlapped by a second cycle, nor may its late
      // completion overwrite the timeout error already reported.
      console.warn("[scheduler] doRefresh timed out — forcing reset");
      timedOut = true;
      notifyRenderer({ type: "error", error: "Refresh timed out" });
    }
  }, MAX_REFRESH_DURATION_MS);

  try {
    const playlists = listPlaylists();
    const epgSources = listEpgSources();

    let playlistOk = 0;
    let playlistFail = 0;
    let epgOk = 0;
    let epgFail = 0;

    // ── Re-fetch URL-based playlists ──────────────────────────────
    for (const pl of playlists) {
      if (pl.sourceType !== "url") continue;
      try {
        const text = await fetchText(pl.sourceValue);
        const parsed = parseM3U(text);
        savePlaylist(pl.name, "url", pl.sourceValue, parsed.channels);
        playlistOk++;
      } catch (err) {
        playlistFail++;
        console.warn(`[scheduler] playlist refresh failed: ${pl.sourceValue}`, err);
      }
    }

    // ── Re-fetch URL-based EPG sources ────────────────────────────
    for (const ep of epgSources) {
      if (ep.sourceType !== "url") continue;
      try {
        const text = await fetchText(ep.sourceValue);
        const result = parseXmltv(text);
        saveEpgSource(ep.name, "url", ep.sourceValue, result.programmes);
        epgOk++;
      } catch (err) {
        epgFail++;
        console.warn(`[scheduler] EPG refresh failed: ${ep.sourceValue}`, err);
      }
    }

    lastRefreshAt = Date.now();

    if (!timedOut) {
      notifyRenderer({
        type: "complete",
        lastRefreshAt,
        playlistIds: playlists.map((p) => p.id),
        epgSourceIds: epgSources.map((e) => e.id),
        stats: { playlistOk, playlistFail, epgOk, epgFail },
      });
    }
  } catch (err) {
    if (!timedOut) {
      notifyRenderer({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    clearTimeout(timeout);
    refreshing = false;
  }
}

/** Fetch a URL with size + timeout enforcement, auto-decompress gzip. */
async function fetchText(rawUrl: string): Promise<string> {
  return fetchNetworkText(rawUrl, { userAgent: `StreamShogun/${app.getVersion()}` });
}

/** Send a refresh event to all renderer windows. */
function notifyRenderer(payload: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.REFRESH_COMPLETED, payload);
    }
  }
}
