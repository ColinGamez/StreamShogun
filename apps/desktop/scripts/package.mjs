/**
 * Run electron-builder with environment fixes for pnpm on Windows.
 *
 * electron-builder 24 passes npm_execpath to app-builder's native rebuild
 * helper. pnpm sets npm_execpath to pnpm.cjs, which Windows cannot execute
 * directly, so native modules like better-sqlite3 fail to rebuild.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

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

function withExecutablePnpm(env) {
  if (!isWindows) return env;

  const npmExecPath = env.npm_execpath ?? env.NPM_CLI_JS ?? "";
  if (!npmExecPath.toLowerCase().endsWith(".cjs")) return env;

  const pnpmCommand = findOnPath("pnpm.cmd") ?? findOnPath("pnpm");
  if (!pnpmCommand) return env;

  return {
    ...env,
    npm_execpath: pnpmCommand,
    NPM_CLI_JS: pnpmCommand,
  };
}

const builderCli = require.resolve("electron-builder/out/cli/cli.js");
const electronVersion = electronPackage.version;

const result = spawnSync(
  process.execPath,
  [
    builderCli,
    "--config",
    "electron-builder.yml",
    "--config.electronVersion",
    electronVersion,
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    env: withExecutablePnpm(process.env),
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
