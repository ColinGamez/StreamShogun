import { app, BrowserWindow, dialog, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import { registerIpcHandlers } from "./ipc";
import { initDatabase, closeDatabase } from "./db";
import { stopScheduler } from "./scheduler";
import { closePipWindow } from "./pip";
import { disconnect as disconnectDiscord } from "./discord";

// ── Determine environment ─────────────────────────────────────────────
// process.defaultApp is set by Electron when launched in dev mode (electron .)
// and is safe to read at module scope, unlike app.isPackaged which requires
// full Electron main-process initialization.
const isDev = !!process.defaultApp;
const DEV_SERVER_URL = "http://localhost:5173";

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getRendererPath(): string {
  // In production, the UI build is copied to resources/renderer
  return path.join(process.resourcesPath, "renderer", "index.html");
}

// ── Window state persistence ──────────────────────────────────────────
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function windowStatePath(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(windowStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    // A corrupt/hand-edited file must not produce an off-screen or
    // zero-size window: validate numbers and clamp to sane minimums.
    const width =
      typeof parsed.width === "number" && Number.isFinite(parsed.width)
        ? Math.max(800, Math.min(7680, Math.floor(parsed.width)))
        : 1200;
    const height =
      typeof parsed.height === "number" && Number.isFinite(parsed.height)
        ? Math.max(600, Math.min(4320, Math.floor(parsed.height)))
        : 800;
    const state: WindowState = { width, height };
    if (
      typeof parsed.x === "number" &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.y)
    ) {
      state.x = Math.max(-8000, Math.min(8000, Math.floor(parsed.x)));
      state.y = Math.max(-8000, Math.min(8000, Math.floor(parsed.y)));
    }
    if (parsed.maximized === true) state.maximized = true;
    return state;
  } catch {
    return { width: 1200, height: 800 };
  }
}

function saveWindowState(win: BrowserWindow, restoreBounds: Electron.Rectangle | null): void {
  const maximized = win.isMaximized();
  const bounds = maximized ? (restoreBounds ?? win.getBounds()) : win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized,
  };
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(state));
  } catch {
    /* */
  }
}

// ── Window creation ───────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const saved = loadWindowState();
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
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

  if (saved.maximized) win.maximize();

  // Track restore bounds for save when maximized
  let restoreBounds: Electron.Rectangle | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // The timer can fire after the window was destroyed — guard it.
      if (!win.isDestroyed()) saveWindowState(win, restoreBounds);
    }, 500);
  };

  win.on("resize", () => {
    if (!win.isMaximized()) restoreBounds = win.getBounds();
    debouncedSave();
  });
  win.on("move", () => {
    if (!win.isMaximized()) restoreBounds = win.getBounds();
    debouncedSave();
  });
  win.on("close", () => saveWindowState(win, restoreBounds));
  win.on("closed", () => {
    if (saveTimer) clearTimeout(saveTimer);
  });

  if (isDev) {
    win.loadURL(DEV_SERVER_URL).catch((err: unknown) => {
      console.error("[main] dev server load failed", err);
    });
    win.webContents.openDevTools({ mode: "bottom" });
  } else {
    win.loadFile(getRendererPath()).catch((err: unknown) => {
      console.error("[main] renderer load failed", err);
    });
  }

  return win;
}

// ── Content Security Policy ───────────────────────────────────────────
function installCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      // In dev, allow Vite's HMR websocket + inline styles/scripts
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
      isDev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self' 'unsafe-inline'", // CSS-in-JS / inline SVG needs unsafe-inline
      "img-src 'self' data: https: http:",
      "media-src 'self' https: http: blob:",
      // connect-src needs https: because the app fetches from arbitrary
      // user-provided M3U, XMLTV, and HLS stream URLs on any domain.
      isDev ? "connect-src 'self' https: http: ws: wss:" : "connect-src 'self' https: blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
        "Permissions-Policy": [
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
        ],
      },
    });
  });
}

// ── Single-instance lock ──────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ── Process-level error guards ─────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[main:uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[main:unhandledRejection]", reason);
});

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  try {
    installCSP();
    initDatabase();
    registerIpcHandlers();
    createMainWindow();
  } catch (err) {
    // A corrupt/locked DB or window failure previously killed startup
    // silently (only the process guards logged). Surface it loudly.
    console.error("[main] startup failed", err);
    dialog.showErrorBox(
      "StreamShogun failed to start",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    closePipWindow();
    stopScheduler();
    disconnectDiscord();
    closeDatabase();
    app.quit();
  }
});

// macOS: clean up DB when the user explicitly quits (Cmd+Q)
app.on("before-quit", () => {
  closePipWindow();
  stopScheduler();
  disconnectDiscord();
  closeDatabase();
});
