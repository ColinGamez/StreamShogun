// ── Auto-updates (electron-updater) ───────────────────────────────────
//
// Checks GitHub Releases for a newer version shortly after launch and,
// if one exists, downloads it in the background. When the download is
// ready the user gets a native Restart/Later dialog; "Later" installs on
// the next normal quit (autoInstallOnAppQuit).
//
// Update metadata comes from the latest*.yml files electron-builder
// emits next to the installers (see the `publish` block in
// electron-builder.yml and the artifact patterns in .github/workflows/
// release.yml — those files must end up attached to the GitHub Release).
//
// Dev and unpackaged builds never phone home: the updater is only wired
// up for packaged builds. Portable builds are skipped by electron-updater
// itself (no persistent install to update).

import { app, dialog, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

/** Delay before the launch-time check so startup stays snappy. */
const INITIAL_CHECK_DELAY_MS = 10_000;
/** Re-check cadence while the app stays open. */
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] update available: ${info.version} — downloading in background`);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] already up to date");
  });

  autoUpdater.on("error", (err) => {
    // Network hiccups and offline use land here; stay quiet for users.
    console.error("[updater] check failed:", err instanceof Error ? err.message : err);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const win = getWindow();
    const options = {
      type: "info" as const,
      title: "Update ready",
      message: `StreamShōgun ${info.version} is ready to install.`,
      detail: "Restart now to update, or it will be installed the next time you quit.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const ask = win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
    void ask.then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error("[updater] check error:", err instanceof Error ? err.message : err);
    });
  };

  setTimeout(check, INITIAL_CHECK_DELAY_MS);
  setInterval(check, RECHECK_INTERVAL_MS);
}
