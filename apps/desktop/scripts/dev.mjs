/**
 * Dev script: compile TS then launch Electron, watching for changes.
 *
 * Waits 2 s for the Vite dev server (started by the UI workspace)
 * before spawning Electron.
 */

import { execSync, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// 1. Bundle with esbuild (ESM workspace packages → CJS for Electron)
console.log("[desktop] Building with esbuild…");
execSync("node scripts/build.mjs", { cwd: root, stdio: "inherit" });

// 2. Give Vite a moment to start (when launched via concurrently)
console.log("[desktop] Waiting for Vite dev server…");
await new Promise((r) => setTimeout(r, 3000));

// 3. Launch Electron
console.log("[desktop] Starting Electron…");
const electronBin = resolve(root, "node_modules", ".bin", "electron");
const mainEntry = resolve(root, "dist", "main.js");

const child = spawn(electronBin, [mainEntry], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
