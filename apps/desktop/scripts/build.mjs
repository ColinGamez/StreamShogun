/**
 * Build the Electron main process and preload with esbuild.
 *
 * Main process → ESM (.mjs): Electron 28+ supports ESM natively, and its
 * ESM import resolver correctly intercepts `import from "electron"` even
 * in pnpm workspaces where the CJS Module._load path is unreliable.
 *
 * Preload → CJS (.js): must be CJS because it runs in a sandboxed renderer
 * context that doesn't support top-level await or ESM.
 *
 * Both bundles inline workspace packages so Electron finds no workspace
 * symlinks at runtime. Native modules (electron, better-sqlite3, etc.)
 * are kept external.
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

// import.meta.dirname is Node 22+; keep the shim for portability.
const esmDirnameBanner = `
import { fileURLToPath as __fup } from "node:url";
import { dirname as __dn } from "node:path";
const __filename = __fup(import.meta.url);
const __dirname = __dn(__filename);
`.trim();

await Promise.all([
  // ── Main process (ESM) ────────────────────────────────────────────
  build({
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
    external,
    logLevel: "info",
    banner: { js: esmDirnameBanner },
    entryPoints: [resolve(root, "src/main.ts")],
    outfile: resolve(root, "dist/main.mjs"),
    tsconfig: resolve(root, "tsconfig.json"),
  }),

  // ── Preload (sandboxed, must be CJS) ─────────────────────────────
  build({
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    sourcemap: true,
    external,
    logLevel: "info",
    entryPoints: [resolve(root, "src/preload.ts")],
    outfile: resolve(root, "dist/preload.js"),
    tsconfig: resolve(root, "tsconfig.json"),
  }),
]);

console.log("[desktop] Build complete.");
