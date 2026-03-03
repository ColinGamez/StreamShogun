// ── Mini Player / PIP Window (F5) ─────────────────────────────────────
//
// Creates a compact always-on-top BrowserWindow for picture-in-picture
// playback.  The PIP window loads the same renderer but with a query
// parameter `?pip=true` so the UI can render a minimal player view.

import { BrowserWindow, screen } from "electron";
import * as path from "path";
import { app } from "electron";
import { getSetting } from "./db";

// ── State ─────────────────────────────────────────────────────────────

let pipWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

// ── Public API ────────────────────────────────────────────────────────

/** Open the PIP window for a given channel URL. */
export function openPipWindow(channelUrl: string, channelName: string): void {
  if (!channelUrl || typeof channelUrl !== "string") {
    throw new Error("PIP channelUrl must be a non-empty string");
  }

  if (pipWindow && !pipWindow.isDestroyed()) {
    // Already open — just update the channel
    pipWindow.webContents.send("pip:channel-update", { channelUrl, channelName });
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
  const query = `?pip=true&url=${encodeURIComponent(channelUrl)}&name=${encodeURIComponent(channelName)}`;

  if (isDev) {
    pipWindow.loadURL(`${DEV_SERVER_URL}${query}`);
  } else {
    const rendererPath = path.join(process.resourcesPath, "renderer", "index.html");
    pipWindow.loadFile(rendererPath, {
      search: query.slice(1), // remove leading '?'
    });
  }

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
