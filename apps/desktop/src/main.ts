import { app, BrowserWindow, session } from "electron";
import * as path from "path";
import { registerIpcHandlers } from "./ipc";
import { initDatabase, closeDatabase } from "./db";
import { stopScheduler } from "./scheduler";
import { disconnect as disconnectDiscord } from "./discord";

// ── Determine environment ─────────────────────────────────────────────
const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getRendererPath(): string {
  // In production, the UI build is copied to resources/renderer
  return path.join(process.resourcesPath, "renderer", "index.html");
}

// ── Window creation ───────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "StreamShōgun",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "bottom" });
  } else {
    win.loadFile(getRendererPath());
  }

  return win;
}

// ── Content Security Policy ───────────────────────────────────────────
function installCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      // In dev, allow Vite's HMR websocket + inline styles/scripts
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self'",
      isDev
        ? "style-src 'self' 'unsafe-inline'"
        : "style-src 'self' 'unsafe-inline'", // CSS-in-JS / inline SVG needs unsafe-inline
      "img-src 'self' data: https: http:",
      "media-src 'self' https: http: blob:",
      isDev
        ? "connect-src 'self' https: http: ws: wss:"
        : "connect-src 'self' https://api.streamshogun.com https://*.streamshogun.com https: blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  installCSP();
  initDatabase();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopScheduler();
    disconnectDiscord();
    closeDatabase();
    app.quit();
  }
});

// macOS: clean up DB when the user explicitly quits (Cmd+Q)
app.on("before-quit", () => {
  stopScheduler();
  disconnectDiscord();
  closeDatabase();
});
