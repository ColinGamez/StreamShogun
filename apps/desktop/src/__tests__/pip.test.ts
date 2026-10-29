import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fakes ─────────────────────────────────────────────────────────────
// pip.ts pulls electron's BrowserWindow/screen and ./db at module scope.

const fakes = vi.hoisted(() => {
  const state = {
    settings: {} as Record<string, string>,
    windows: [] as FakeWindow[],
  };

  class FakeWindow {
    static lastCreated: FakeWindow | null = null;
    options: Record<string, unknown>;
    destroyed = false;
    focused = false;
    loadedFiles: { file: string; options?: { search?: string } }[] = [];
    loadedUrls: string[] = [];
    private handlers = new Map<string, () => void>();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeWindow.lastCreated = this;
      state.windows.push(this);
    }
    loadFile(file: string, options?: { search?: string }) {
      this.loadedFiles.push({ file, options });
      return Promise.resolve();
    }
    loadURL(url: string) {
      this.loadedUrls.push(url);
      return Promise.resolve();
    }
    focus() {
      this.focused = true;
    }
    close() {
      this.handlers.get("closed")?.();
    }
    isDestroyed() {
      return this.destroyed;
    }
    on(event: string, cb: () => void) {
      this.handlers.set(event, cb);
    }
  }

  return { settings: state.settings, windows: state.windows, FakeWindow, state };
});

const FakeWindow = fakes.FakeWindow;

vi.mock("electron", () => ({
  BrowserWindow: fakes.FakeWindow,
  screen: {
    getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
  },
}));

vi.mock("../db", () => ({
  getSetting: (key: string) => fakes.settings[key],
}));

import { closePipWindow, isPipOpen, openPipWindow } from "../pip";

// pip.ts is on the packaged path in tests (process.defaultApp is unset),
// which reads process.resourcesPath — provide one.
(process as unknown as { resourcesPath: string }).resourcesPath = "/resources";

beforeEach(() => {
  fakes.settings = {};
  fakes.state.windows.length = 0;
  FakeWindow.lastCreated = null;
  // Reset module-level pipWindow between tests by closing any open one.
  closePipWindow();
});

describe("openPipWindow", () => {
  it("rejects an empty channel URL", () => {
    expect(() => openPipWindow("", "x")).toThrow(/non-empty string/);
  });

  it("opens a bottom-right window sized 420x280 with safe webPreferences", () => {
    openPipWindow("https://example.com/ch.m3u8", "Channel 1");
    const win = FakeWindow.lastCreated!;
    expect(win.options).toMatchObject({
      width: 420,
      height: 280,
      x: 1920 - 420 - 20,
      y: 1080 - 280 - 20,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "PIP — Channel 1",
    });
    expect(win.options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it("defaults alwaysOnTop to true and honors the pipAlwaysOnTop setting", () => {
    openPipWindow("https://example.com/a.m3u8", "A");
    expect(FakeWindow.lastCreated!.options.alwaysOnTop).toBe(true);

    closePipWindow();
    fakes.settings.pipAlwaysOnTop = "false";
    openPipWindow("https://example.com/b.m3u8", "B");
    expect(FakeWindow.lastCreated!.options.alwaysOnTop).toBe(false);
  });

  it("loads the renderer with an encoded pip query string", () => {
    openPipWindow("https://example.com/ch.m3u8?token=a&b=c", "Ch 5");
    const { file, options } = FakeWindow.lastCreated!.loadedFiles[0];
    expect(file).toBe(path_join("/resources", "renderer", "index.html"));
    expect(options?.search).toContain("pip=true");
    expect(options?.search).toContain(
      `url=${encodeURIComponent("https://example.com/ch.m3u8?token=a&b=c")}`,
    );
    expect(options?.search).toContain(`name=${encodeURIComponent("Ch 5")}`);
  });

  it("reuses the open window on zap: reloads and focuses instead of creating a new one", () => {
    openPipWindow("https://example.com/1.m3u8", "One");
    const first = FakeWindow.lastCreated!;
    openPipWindow("https://example.com/2.m3u8", "Two");

    expect(fakes.state.windows).toHaveLength(1);
    expect(first.loadedFiles).toHaveLength(2);
    expect(first.loadedFiles[1].options?.search).toContain(
      encodeURIComponent("https://example.com/2.m3u8"),
    );
    expect(first.focused).toBe(true);
  });
});

describe("closePipWindow / isPipOpen", () => {
  it("reports closed before anything opens", () => {
    expect(isPipOpen()).toBe(false);
    expect(() => closePipWindow()).not.toThrow();
  });

  it("reports open after opening and closed after close", () => {
    openPipWindow("https://example.com/1.m3u8", "One");
    expect(isPipOpen()).toBe(true);
    closePipWindow();
    expect(isPipOpen()).toBe(false);
  });

  it("a fresh open after close creates a new window", () => {
    openPipWindow("https://example.com/1.m3u8", "One");
    closePipWindow();
    openPipWindow("https://example.com/2.m3u8", "Two");
    expect(fakes.state.windows).toHaveLength(2);
  });
});

// helper keeps the assertion readable cross-platform
function path_join(...parts: string[]): string {
  return parts.join("/").replace(/\//g, process.platform === "win32" ? "\\" : "/");
}
