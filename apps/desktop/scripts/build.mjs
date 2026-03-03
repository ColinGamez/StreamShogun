/**
 * Build the Electron main process and preload with esbuild.
 *
 * Bundles workspace packages (@stream-shogun/core, @stream-shogun/shared)
 * into CJS so Electron 31 (Node 20) can load them.
 * Native modules (electron, better-sqlite3, etc.) are kept external.
 */

import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** Modules that must NOT be bundled (native / Electron built-ins). */
const external = [
  "electron",
  "better-sqlite3",
  "bcrypt",
  "node:*",
  "path",
  "fs",
  "os",
  "url",
  "crypto",
  "child_process",
  "events",
  "net",
  "http",
  "https",
  "stream",
  "util",
  "assert",
  "tty",
  "zlib",
  "buffer",
  "string_decoder",
  "querystring",
];

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external,
  logLevel: "info",
};

await Promise.all([
  // ── Main process ─────────────────────────────────────────────────
  build({
    ...shared,
    entryPoints: [resolve(root, "src/main.ts")],
    outfile: resolve(root, "dist/main.js"),
    tsconfig: resolve(root, "tsconfig.json"),
  }),

  // ── Preload (sandboxed, must be CJS) ─────────────────────────────
  build({
    ...shared,
    entryPoints: [resolve(root, "src/preload.ts")],
    outfile: resolve(root, "dist/preload.js"),
    tsconfig: resolve(root, "tsconfig.json"),
  }),
]);

console.log("[desktop] Build complete.");
