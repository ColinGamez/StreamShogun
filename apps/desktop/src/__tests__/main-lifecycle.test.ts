import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  class Window {
    static windows: Window[] = [];
    handlers = new Map<string, () => void>();
    destroyed = false;
    minimized = false;
    focus = vi.fn();
    show = vi.fn();
    restore = vi.fn(() => {
      this.minimized = false;
    });
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), openDevTools: vi.fn() };
    constructor(_options?: unknown) {
      Window.windows.push(this);
    }
    on(event: string, callback: () => void) {
      this.handlers.set(event, callback);
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return this.minimized;
    }
    loadFile() {
      return Promise.resolve();
    }
    loadURL() {
      return Promise.resolve();
    }
    maximize = vi.fn();
    static getAllWindows() {
      return Window.windows.filter((win) => !win.destroyed);
    }
  }
  return { handlers, Window, updater: vi.fn() };
});

vi.mock("electron", () => ({
  app: {
    requestSingleInstanceLock: () => true,
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    on: (event: string, callback: () => void) => fakes.handlers.set(event, callback),
    getPath: () => "/test",
    quit: vi.fn(),
  },
  BrowserWindow: fakes.Window,
  dialog: { showErrorBox: vi.fn() },
  screen: {
    getAllDisplays: () => [{ workArea: { x: 0, y: 24, width: 1440, height: 850 } }],
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 24, width: 1440, height: 850 } }),
  },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  shell: { openExternal: vi.fn() },
}));
vi.mock("fs", () => ({
  readFileSync: () => {
    throw new Error("No saved state");
  },
  writeFileSync: vi.fn(),
}));
vi.mock("../ipc", () => ({ registerIpcHandlers: vi.fn() }));
vi.mock("../db", () => ({ initDatabase: vi.fn(), closeDatabase: vi.fn() }));
vi.mock("../scheduler", () => ({ stopScheduler: vi.fn() }));
vi.mock("../pip", () => ({ closePipWindow: vi.fn() }));
vi.mock("../discord", () => ({ disconnect: vi.fn() }));
vi.mock("../updater", () => ({ initAutoUpdater: fakes.updater }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  fakes.handlers.clear();
  fakes.Window.windows = [];
  vi.spyOn(process, "on").mockImplementation(() => process);
  (process as unknown as { resourcesPath: string }).resourcesPath = "/resources";
  await import("../main");
});

afterEach(() => vi.restoreAllMocks());

describe("main window lifecycle", () => {
  it("reopens main from Dock activation while PiP remains and gives updater the main window", () => {
    const original = fakes.Window.windows[0];
    original.destroyed = true;
    original.handlers.get("closed")?.();
    const pip = new fakes.Window();
    fakes.handlers.get("activate")?.();
    const main = fakes.Window.windows[2];
    expect(main).toBeDefined();
    expect(main.focus).toHaveBeenCalledOnce();
    expect(pip.focus).not.toHaveBeenCalled();
    expect(fakes.updater.mock.calls[0][0]()).toBe(main);
  });
  it("restores and focuses the main window on a second launch instead of PiP", () => {
    const main = fakes.Window.windows[0];
    main.minimized = true;
    const pip = new fakes.Window();
    fakes.handlers.get("second-instance")?.();
    expect(main.restore).toHaveBeenCalledOnce();
    expect(main.show).toHaveBeenCalledOnce();
    expect(main.focus).toHaveBeenCalledOnce();
    expect(pip.focus).not.toHaveBeenCalled();
    expect(fakes.Window.windows).toHaveLength(2);
  });
});
