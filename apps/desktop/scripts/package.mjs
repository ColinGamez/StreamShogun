/**
 * Run electron-builder programmatically with environment fixes for pnpm
 * on Windows.
 *
 * Two reasons this does NOT spawn the electron-builder CLI:
 *
 * 1. electron-builder 24 passes npm_execpath to app-builder's native
 *    rebuild helper. pnpm sets npm_execpath to pnpm.cjs, which Windows
 *    cannot execute directly, so native modules like better-sqlite3 fail
 *    to rebuild. (Fixed below by rewriting npm_execpath.)
 * 2. If this script runs under an Electron-bundled Node runtime
 *    (process.execPath is an Electron binary, e.g. inside some desktop
 *    AI tooling), a spawned "node cli.js" gets Electron argv semantics
 *    and yargs inside electron-builder fails with
 *    "Unknown argument: <cli.js path>". Calling the programmatic API
 *    in-process sidesteps that entirely.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, Platform } from "electron-builder";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const require = createRequire(import.meta.url);
const electronPackage = require("electron/package.json");

function findOnPath(command) {
  const result = spawnSync(isWindows ? "where.exe" : "which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) return undefined;

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

// pnpm on Windows sets npm_execpath to a .cjs file electron-builder cannot
// execute; point it at an executable pnpm shim instead (in-process, so the
// builder and anything it spawns inherit the fix).
if (isWindows) {
  const npmExecPath = process.env.npm_execpath ?? process.env.NPM_CLI_JS ?? "";
  if (npmExecPath.toLowerCase().endsWith(".cjs")) {
    const pnpmCommand = findOnPath("pnpm.cmd") ?? findOnPath("pnpm");
    if (pnpmCommand) {
      process.env.npm_execpath = pnpmCommand;
      process.env.NPM_CLI_JS = pnpmCommand;
    }
  }
}

// Fail fast when the bundles or renderer are missing: electron-builder
// would otherwise ship an installer that opens a blank window.
for (const required of ["dist/main.mjs", "dist/preload.js", "../ui/dist/index.html"]) {
  if (!existsSync(resolve(root, required))) {
    console.error(`[package] missing required build output: ${required} — run pnpm build first`);
    process.exit(1);
  }
}

// Map CLI-style platform flags to electron-builder targets. No flag means
// "build for the current platform", matching electron-builder's default.
const args = process.argv.slice(2);
let targets;
if (args.includes("--win")) targets = Platform.WINDOWS.createTarget();
else if (args.includes("--mac")) targets = Platform.MAC.createTarget();
else if (args.includes("--linux")) targets = Platform.LINUX.createTarget();

try {
  await build({
    projectDir: root,
    targets,
    // electron-builder.yml is auto-loaded from projectDir; this merges on top.
    config: { electronVersion: electronPackage.version },
    publish: "never",
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
