// ── IPC Handlers ──────────────────────────────────────────────────────
//
// All file-system and network access lives here in the main process.
// The renderer never touches `fs` or `fetch` directly — it calls these
// handlers through the narrow preload bridge.

import { ipcMain, app, shell, dialog } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import { gunzip } from "zlib";
import { promisify } from "util";

const gunzipAsync = promisify(gunzip);
import { IpcChannels, parseM3U, parseXmltv, createEpgIndex } from "@stream-shogun/core";
import type { Playlist, XmltvParseResult, EpgIndex, Channel, Programme } from "@stream-shogun/core";
import {
  savePlaylist,
  listPlaylists,
  removePlaylist,
  listChannels,
  setFavorite,
  listFavorites,
  saveEpgSource,
  listEpgSources,
  removeEpgSource,
  getNowNext,
  getEpgRange,
  getAllSettings,
  setSetting,
  saveWatchSession,
  listWatchHistory,
  getLastWatched,
  clearWatchHistory,
  getLicenseStatus,
  setLicenseKey,
  setProEnabled,
} from "./db";
import {
  initScheduler,
  setRefreshInterval,
  triggerRefresh,
  getRefreshStatus,
} from "./scheduler";
import { openPipWindow, closePipWindow, isPipOpen } from "./pip";
import {
  setDiscordEnabled,
  setActivity as discordSetActivity,
  clearActivity as discordClearActivity,
} from "./discord";
import {
  apiRegister,
  apiLogin,
  apiLogout,
  apiGetFeatures,
  apiRefreshTokens,
  apiCloudSyncGet,
  apiCloudSyncPut,
  apiBillingCheckout,
  apiBillingPortal,
} from "./api-client";
import { loadTokens } from "./token-store";

// ── Security constants ────────────────────────────────────────────────

/** Maximum download size: 25 MB. */
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

/** Fetch timeout in milliseconds: 30 s. */
const FETCH_TIMEOUT_MS = 30_000;

/** Allowed local file extensions for playlists. */
const PLAYLIST_EXTENSIONS = new Set([".m3u", ".m3u8"]);

/** Allowed local file extensions for EPG data. */
const EPG_EXTENSIONS = new Set([".xml", ".xmltv", ".gz"]);

/** Maximum local file size: 50 MB (XML can be large). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// ── Validation helpers ────────────────────────────────────────────────

/** Ensure a URL is http or https. Throws on anything else. */
function validateUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("URL must be a non-empty string");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Disallowed protocol "${parsed.protocol}" — only http/https are permitted`);
  }

  return parsed;
}

/** Ensure a file path is absolute and has an allowed extension. */
function validateFilePath(raw: unknown, allowedExtensions: Set<string>): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("File path must be a non-empty string");
  }

  const resolved = path.resolve(raw);
  const ext = path.extname(resolved).toLowerCase();

  if (!allowedExtensions.has(ext)) {
    throw new Error(
      `Disallowed file extension "${ext}" — allowed: ${[...allowedExtensions].join(", ")}`,
    );
  }

  return resolved;
}

// ── Fetch with size + timeout enforcement ─────────────────────────────

async function secureFetchRaw(url: URL): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": `StreamShogun/${app.getVersion()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    // ── Check Content-Length if available ────────────────────────
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_DOWNLOAD_BYTES})`);
    }

    // ── Stream-read with running byte count ─────────────────────
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response has no readable body");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        reader.cancel();
        throw new Error(`Download exceeded ${MAX_DOWNLOAD_BYTES} bytes — aborted`);
      }

      chunks.push(value);
    }

    // Concatenate into a Buffer
    const merged = Buffer.alloc(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return merged;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a URL and decompress if gzip. */
async function secureFetchText(url: URL): Promise<string> {
  const raw = await secureFetchRaw(url);
  const isGz =
    url.pathname.endsWith(".gz") || (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);
  if (isGz) {
    const decompressed = await gunzipAsync(raw);
    return new TextDecoder("utf-8").decode(decompressed);
  }
  return new TextDecoder("utf-8").decode(raw);
}

// ── Safe file read with size check ────────────────────────────────────

async function secureReadFile(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_BYTES})`);
  }
  return fs.readFile(filePath, "utf-8");
}

/** Read a local file and decompress if gzip. */
async function secureReadFileGz(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_BYTES})`);
  }
  const raw = await fs.readFile(filePath);
  const isGz = filePath.endsWith(".gz") || (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);
  if (isGz) {
    const decompressed = await gunzipAsync(raw);
    return new TextDecoder("utf-8").decode(decompressed);
  }
  return new TextDecoder("utf-8").decode(raw);
}

// ── IPC result wrapper ────────────────────────────────────────────────

interface IpcResult<T> {
  ok: true;
  data: T;
}

interface IpcError {
  ok: false;
  error: string;
}

type IpcResponse<T> = IpcResult<T> | IpcError;

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(err: unknown): IpcError {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: message };
}

/** Validate that a value is a non-empty string. */
function requireString(val: unknown, label: string): string {
  if (typeof val !== "string" || val.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return val;
}

/** Validate that a value is a finite non-negative number. */
function requireFiniteNumber(val: unknown, label: string): number {
  if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return val;
}

// ── Register all IPC handlers ─────────────────────────────────────────

export function registerIpcHandlers(): void {
  // ── App info / ping (existing) ──────────────────────────────────
  ipcMain.handle(IpcChannels.GET_APP_INFO, () => ({
    name: app.getName(),
    version: app.getVersion(),
  }));

  ipcMain.handle(IpcChannels.PING, () => `pong @ ${new Date().toISOString()}`);

  // ── Playlist: load from local file ──────────────────────────────
  ipcMain.handle(
    IpcChannels.PLAYLIST_LOAD_FILE,
    async (_event, filePath: unknown): Promise<IpcResponse<Playlist>> => {
      try {
        const resolved = validateFilePath(filePath, PLAYLIST_EXTENSIONS);
        const text = await secureReadFile(resolved);
        return ok(parseM3U(text));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── Playlist: load from URL ─────────────────────────────────────
  ipcMain.handle(
    IpcChannels.PLAYLIST_LOAD_URL,
    async (_event, rawUrl: unknown): Promise<IpcResponse<Playlist>> => {
      try {
        const url = validateUrl(rawUrl);
        const text = await secureFetchText(url);
        return ok(parseM3U(text));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── EPG: load from local file ───────────────────────────────────
  ipcMain.handle(
    IpcChannels.EPG_LOAD_FILE,
    async (
      _event,
      filePath: unknown,
    ): Promise<IpcResponse<XmltvParseResult & { index: SerializedEpgIndex }>> => {
      try {
        const resolved = validateFilePath(filePath, EPG_EXTENSIONS);
        const text = await secureReadFileGz(resolved);
        const result = parseXmltv(text);
        const index = createEpgIndex(result.programmes);
        return ok({ ...result, index: serializeIndex(index) });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── EPG: load from URL ──────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.EPG_LOAD_URL,
    async (
      _event,
      rawUrl: unknown,
    ): Promise<IpcResponse<XmltvParseResult & { index: SerializedEpgIndex }>> => {
      try {
        const url = validateUrl(rawUrl);
        const text = await secureFetchText(url);
        const result = parseXmltv(text);
        const index = createEpgIndex(result.programmes);
        return ok({ ...result, index: serializeIndex(index) });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  //  DB-backed persistence handlers
  // ═══════════════════════════════════════════════════════════════════

  // ── savePlaylist ────────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.DB_SAVE_PLAYLIST,
    (
      _event,
      args: { name: string; sourceType: "url" | "file"; sourceValue: string; channels: unknown[] },
    ) => {
      try {
        const row = savePlaylist(
          args.name,
          args.sourceType,
          args.sourceValue,
          args.channels as Channel[],
        );
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── listPlaylists ──────────────────────────────────────────────
  ipcMain.handle(IpcChannels.DB_LIST_PLAYLISTS, () => {
    try {
      return ok(listPlaylists());
    } catch (err) {
      return fail(err);
    }
  });

  // ── removePlaylist ─────────────────────────────────────────────
  ipcMain.handle(IpcChannels.DB_REMOVE_PLAYLIST, (_event, id: string) => {
    try {
      removePlaylist(id);
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  // ── listChannels ───────────────────────────────────────────────
  ipcMain.handle(IpcChannels.DB_LIST_CHANNELS, (_event, playlistId?: string) => {
    try {
      return ok(listChannels(playlistId));
    } catch (err) {
      return fail(err);
    }
  });

  // ── setFavorite ────────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.DB_SET_FAVORITE,
    (_event, args: { channelId: string; isFavorite: boolean }) => {
      try {
        setFavorite(args.channelId, args.isFavorite);
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── listFavorites ──────────────────────────────────────────────
  ipcMain.handle(IpcChannels.DB_LIST_FAVORITES, () => {
    try {
      return ok(listFavorites());
    } catch (err) {
      return fail(err);
    }
  });

  // ── saveEpgSource ──────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.DB_SAVE_EPG_SOURCE,
    (
      _event,
      args: {
        name: string;
        sourceType: "url" | "file";
        sourceValue: string;
        programmes: unknown[];
      },
    ) => {
      try {
        const row = saveEpgSource(
          args.name,
          args.sourceType,
          args.sourceValue,
          args.programmes as Programme[],
        );
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── listEpgSources ────────────────────────────────────────────
  ipcMain.handle(IpcChannels.DB_LIST_EPG_SOURCES, () => {
    try {
      return ok(listEpgSources());
    } catch (err) {
      return fail(err);
    }
  });

  // ── removeEpgSource ───────────────────────────────────────────
  ipcMain.handle(IpcChannels.DB_REMOVE_EPG_SOURCE, (_event, id: string) => {
    try {
      removeEpgSource(id);
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  // ── getNowNext ─────────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.DB_GET_NOW_NEXT,
    (_event, args: { channelId: string; now?: number }) => {
      try {
        return ok(getNowNext(args.channelId, args.now));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── getEpgRange ────────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.DB_GET_EPG_RANGE,
    (_event, args: { channelId: string; start: number; stop: number }) => {
      try {
        return ok(getEpgRange(args.channelId, args.start, args.stop));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Settings (F8)
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(IpcChannels.DB_GET_ALL_SETTINGS, () => {
    try {
      return ok(getAllSettings());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    IpcChannels.DB_SET_SETTING,
    (_event, args: { key: string; value: string }) => {
      try {
        requireString(args.key, "settings key");
        if (typeof args.value !== "string") throw new Error("settings value must be a string");
        setSetting(args.key, args.value);
        // Side-effects for certain settings
        if (args.key === "discordRpcEnabled") {
          setDiscordEnabled(args.value === "true");
        }
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Watch History (F4)
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(
    IpcChannels.DB_SAVE_WATCH,
    (
      _event,
      args: {
        channelUrl: string;
        channelName: string;
        channelLogo: string;
        groupTitle: string;
        startedAt: number;
        stoppedAt: number;
        durationSec: number;
      },
    ) => {
      try {
        requireString(args.channelUrl, "channelUrl");
        requireString(args.channelName, "channelName");
        requireFiniteNumber(args.startedAt, "startedAt");
        requireFiniteNumber(args.stoppedAt, "stoppedAt");
        requireFiniteNumber(args.durationSec, "durationSec");
        const row = saveWatchSession(
          args.channelUrl,
          args.channelName,
          args.channelLogo || "",
          args.groupTitle || "",
          args.startedAt,
          args.stoppedAt,
          args.durationSec,
        );
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.DB_LIST_WATCH_HISTORY,
    (_event, limit?: number) => {
      try {
        return ok(listWatchHistory(limit));
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(IpcChannels.DB_GET_LAST_WATCHED, () => {
    try {
      return ok(getLastWatched());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(IpcChannels.DB_CLEAR_WATCH_HISTORY, () => {
    try {
      clearWatchHistory();
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Auto Refresh (F1)
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(
    IpcChannels.REFRESH_SET_INTERVAL,
    (_event, args: { minutes: number; enabled: boolean }) => {
      try {
        setRefreshInterval(args.minutes, args.enabled);
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(IpcChannels.REFRESH_TRIGGER, async () => {
    try {
      await triggerRefresh();
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(IpcChannels.REFRESH_GET_STATUS, () => {
    try {
      return ok(getRefreshStatus());
    } catch (err) {
      return fail(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Mini Player / PIP (F5)
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(
    IpcChannels.PIP_OPEN,
    (_event, args: { channelUrl: string; channelName: string }) => {
      try {
        openPipWindow(args.channelUrl, args.channelName);
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(IpcChannels.PIP_CLOSE, () => {
    try {
      closePipWindow();
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(IpcChannels.PIP_IS_OPEN, () => {
    try {
      return ok(isPipOpen());
    } catch (err) {
      return fail(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Discord Rich Presence (F6)
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(
    IpcChannels.DISCORD_SET_ACTIVITY,
    async (
      _event,
      args: {
        details: string;
        state?: string;
        startTimestamp?: number;
      },
    ) => {
      try {
        await discordSetActivity({
          details: args.details,
          state: args.state,
          timestamps: args.startTimestamp ? { start: args.startTimestamp } : undefined,
          assets: {
            large_image: "logo",
            large_text: "StreamShōgun",
          },
        });
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(IpcChannels.DISCORD_CLEAR_ACTIVITY, async () => {
    try {
      await discordClearActivity();
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  License / Pro (Monetization)
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(IpcChannels.LICENSE_GET_STATUS, () => {
    try {
      return ok(getLicenseStatus());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    IpcChannels.LICENSE_SET_KEY,
    (_event, args: { key: string }) => {
      try {
        requireString(args.key, "license key");
        return ok(setLicenseKey(args.key));
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.LICENSE_SET_PRO_ENABLED,
    (_event, args: { enabled: boolean }) => {
      try {
        return ok(setProEnabled(args.enabled));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Auth / SaaS
  // ═══════════════════════════════════════════════════════════════════

  ipcMain.handle(
    IpcChannels.AUTH_REGISTER,
    async (_event, args: { email: string; password: string; displayName?: string }) => {
      try {
        requireString(args.email, "email");
        requireString(args.password, "password");
        const result = await apiRegister(args.email, args.password, args.displayName);
        if (!result.ok) {
          const body = result.data as unknown as Record<string, unknown> | undefined;
          return fail(new Error((body && typeof body.message === "string" ? body.message : null) ?? "Registration failed"));
        }
        return ok(result.data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.AUTH_LOGIN,
    async (_event, args: { email: string; password: string }) => {
      try {
        requireString(args.email, "email");
        requireString(args.password, "password");
        const result = await apiLogin(args.email, args.password);
        if (!result.ok) {
          const body = result.data as unknown as Record<string, unknown> | undefined;
          return fail(new Error((body && typeof body.message === "string" ? body.message : null) ?? "Login failed"));
        }
        return ok(result.data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(IpcChannels.AUTH_LOGOUT, async () => {
    try {
      await apiLogout();
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(IpcChannels.AUTH_REFRESH, async () => {
    try {
      const tokens = await loadTokens();
      if (!tokens?.refreshToken) return fail(new Error("No refresh token"));
      // Actually attempt a token refresh against the API
      const refreshed = await apiRefreshTokens();
      if (!refreshed) return fail(new Error("Token refresh failed"));
      return ok({ hasTokens: true });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(IpcChannels.FEATURES_FETCH, async () => {
    try {
      const result = await apiGetFeatures();
      if (!result.ok) return fail(new Error("Failed to fetch features"));
      return ok(result.data);
    } catch (err) {
      return fail(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  Billing (opens Stripe in system browser)
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle(IpcChannels.BILLING_CHECKOUT, async (_event, args?: { interval?: string }) => {
    try {
      const interval = args?.interval === "yearly" ? "yearly" : "monthly";
      const result = await apiBillingCheckout(interval);
      if (!result.ok) return fail(new Error("Failed to create checkout session"));
      await shell.openExternal(result.data.url);
      return ok({ url: result.data.url });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(IpcChannels.BILLING_PORTAL, async () => {
    try {
      const result = await apiBillingPortal();
      if (!result.ok) return fail(new Error("Failed to create portal session"));
      await shell.openExternal(result.data.url);
      return ok({ url: result.data.url });
    } catch (err) {
      return fail(err);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  Cloud Sync v1
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle(IpcChannels.CLOUD_SYNC_PULL, async () => {
    try {
      const result = await apiCloudSyncGet();
      if (!result.ok) return fail(new Error("Failed to pull cloud sync"));
      return ok(result.data);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    IpcChannels.CLOUD_SYNC_PUSH,
    async (_event, args: {
      settings?: Record<string, string>;
      favorites?: string[];
      history?: Array<{ channelUrl: string; channelName: string; channelLogo?: string; groupTitle?: string; watchedAt: number }>;
      localUpdatedAt: string;
    }) => {
      try {
        const result = await apiCloudSyncPut(args);
        // 409 = conflict; still return the payload so the client can merge
        if (!result.ok && result.status !== 409) {
          return fail(new Error("Cloud sync push failed"));
        }
        return ok({ ...result.data, conflict: result.status === 409 });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  File save (Support Bundle)
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle(
    IpcChannels.SAVE_FILE,
    async (
      _event,
      args: { defaultName: string; content: string; title?: string },
    ): Promise<IpcResponse<{ filePath: string | null }>> => {
      try {
        requireString(args.defaultName, "defaultName");
        if (typeof args.content !== "string") throw new Error("content must be a string");
        const result = await dialog.showSaveDialog({
          title: args.title ?? "Save file",
          defaultPath: args.defaultName,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) {
          return ok({ filePath: null });
        }
        await fs.writeFile(result.filePath, args.content, "utf-8");
        return ok({ filePath: result.filePath });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // Initialise scheduler after all handlers are registered
  initScheduler();
}

// ── Index serialisation ───────────────────────────────────────────────
// EpgIndex is a Map, which doesn't survive Electron's structured-clone
// IPC. We convert to a plain object for transport.

type SerializedEpgIndex = Record<
  string,
  ReturnType<typeof createEpgIndex> extends Map<string, infer V> ? V : never
>;

function serializeIndex(index: EpgIndex): SerializedEpgIndex {
  const obj: SerializedEpgIndex = {};
  for (const [key, value] of index) {
    obj[key] = value;
  }
  return obj;
}
