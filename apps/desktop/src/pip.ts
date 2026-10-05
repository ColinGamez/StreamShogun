// ── Mini Player / PIP Window (F5) ─────────────────────────────────────
//
// Creates a compact always-on-top BrowserWindow for picture-in-picture
// playback.  The PIP window loads the same renderer but with a query
// parameter `?pip=true` so the UI can render a minimal player view.

import { BrowserWindow, screen } from "electron";
import * as path from "path";
import { getSetting } from "./db";

// ── State ─────────────────────────────────────────────────────────────

let pipWindow: BrowserWindow | null = null;

const isDev = !!process.defaultApp;
const DEV_SERVER_URL = "http://localhost:5173";

// ── Public API ────────────────────────────────────────────────────────

function buildPipQuery(channelUrl: string, channelName: string): string {
  return `?pip=true&url=${encodeURIComponent(channelUrl)}&name=${encodeURIComponent(channelName)}`;
}

function loadPipChannel(win: BrowserWindow, channelUrl: string, channelName: string): void {
  // The PIP page reads its channel from the query string at load, so both
  // initial open and later zaps go through (re)load. (A previous
  // `pip:channel-update` event had no renderer listener, so zapping
  // silently did nothing.)
  const query = buildPipQuery(channelUrl, channelName);
  if (isDev) {
    void win.loadURL(`${DEV_SERVER_URL}${query}`).catch((err: unknown) => {
      console.error("[pip] channel load failed", err);
    });
  } else {
    const rendererPath = path.join(process.resourcesPath, "renderer", "index.html");
    void win.loadFile(rendererPath, { search: query.slice(1) }).catch((err: unknown) => {
      console.error("[pip] channel load failed", err);
    });
  }
}

/** Open the PIP window for a given channel URL. */
export function openPipWindow(channelUrl: string, channelName: string): void {
  if (!channelUrl || typeof channelUrl !== "string") {
    throw new Error("PIP channelUrl must be a non-empty string");
  }

  if (pipWindow && !pipWindow.isDestroyed()) {
    loadPipChannel(pipWindow, channelUrl, channelName);
    pipWindow.focus();
    return;
  }

  const safeName = channelName || "PIP";

  const alwaysOnTop = getSetting("pipAlwaysOnTop") !== "false";

  // Position in bottom-right corner
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const pipW = 420;
  const pipH = 280;

  pipWindow = new BrowserWindow({
    width: pipW,
    height: pipH,
    x: screenW - pipW - 20,
    y: screenH - pipH - 20,
    minWidth: 320,
    minHeight: 200,
    maxWidth: 800,
    maxHeight: 600,
    frame: false,
    transparent: false,
    alwaysOnTop,
    skipTaskbar: true,
    resizable: true,
    title: `PIP — ${safeName}`,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the same UI with PIP query params
  loadPipChannel(pipWindow, channelUrl, channelName);

  pipWindow.on("closed", () => {
    pipWindow = null;
  });
}

/** Close the PIP window if open. */
export function closePipWindow(): void {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close();
    // `pipWindow = null` is handled by the 'closed' event listener
  }
}

/** Check if PIP window is open. */
export function isPipOpen(): boolean {
  return pipWindow !== null && !pipWindow.isDestroyed();
}
