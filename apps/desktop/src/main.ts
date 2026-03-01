import { app, BrowserWindow } from "electron";
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

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
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
