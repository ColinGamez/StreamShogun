/**
 * Dev script: compile TS then launch Electron, watching for changes.
 *
 * Waits 3 s for the Vite dev server (started by the UI workspace)
 * before spawning Electron.
 *
 * Uses createRequire to resolve the real electron.exe path from the npm
 * package, then spawns it directly (shell:false) to avoid cmd.exe
 * corrupting non-ASCII characters in the project path.
 */

import { execSync, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Resolve the actual electron.exe path without going through cmd.exe / shell.
// require("electron") in a plain Node process returns the binary path string.
const _require = createRequire(resolve(root, "package.json"));
const electronExe = _require("electron");

// 1. Bundle with esbuild (main process → ESM .mjs, preload → CJS .js)
console.log("[desktop] Building with esbuild…");
execSync("node scripts/build.mjs", { cwd: root, stdio: "inherit" });

// 2. Give Vite a moment to start (when launched via concurrently)
console.log("[desktop] Waiting for Vite dev server…");
await new Promise((r) => setTimeout(r, 3000));

// 3. Launch Electron directly (shell:false) so non-ASCII path chars are safe.
console.log("[desktop] Starting Electron…");

// Build the env, explicitly removing ELECTRON_RUN_AS_NODE which host tools
// (VSCode, Claude Code) set to 1 to use Electron as a plain Node runtime.
// If that flag is inherited the Chromium browser process never initialises
// and require("electron") returns the npm stub instead of the built-in API.
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
childEnv.STREAM_SHOGUN_API_URL ??= "http://localhost:8787";

const child = spawn(electronExe, [root], {
  cwd: root,
  env: childEnv,
  stdio: "inherit",
  shell: false,
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
