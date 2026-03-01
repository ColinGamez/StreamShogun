/**
 * generate-icons.js
 * Converts assets/icon.svg → PNG (512×512) → ICO + ICNS placeholders.
 *
 * Requirements:  npm i -g sharp-cli   OR   pnpm add -D sharp
 *
 * For a full icon pipeline you'd use:
 *   - `sharp` (Node) to rasterise SVG → PNG
 *   - `png2icons` or `electron-icon-builder` to create .ico / .icns
 *
 * This script generates a 512×512 PNG from the SVG. electron-builder can
 * auto-convert a 512×512 PNG into .ico and .icns at build time if you
 * point it at the PNG via the "icon" field.
 *
 * Usage:  node scripts/generate-icons.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..", "..", "..");
const assetsDir = join(root, "assets");
const buildDir = join(root, "apps", "desktop", "build");

async function main() {
  // Ensure build dir exists
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
  }

  try {
    // Try to use sharp if available
    const sharp = (await import("sharp")).default;
    const svgPath = join(assetsDir, "icon.svg");
    const svg = readFileSync(svgPath);

    // 512×512 PNG (electron-builder auto-converts to ico/icns)
    await sharp(svg).resize(512, 512).png().toFile(join(buildDir, "icon.png"));

    // 256×256 for Windows ICO source
    await sharp(svg)
      .resize(256, 256)
      .png()
      .toFile(join(buildDir, "icon-256.png"));

    console.log("✅  Icons generated in apps/desktop/build/");
    console.log("   icon.png     (512×512)");
    console.log("   icon-256.png (256×256)");
    console.log(
      "\n   electron-builder will auto-convert icon.png → .ico / .icns"
    );
  } catch {
    console.log("⚠️  sharp not installed — creating placeholder PNG.");
    console.log("   Install sharp for proper SVG→PNG conversion:");
    console.log("   pnpm add -D sharp\n");

    // Write a minimal 1×1 PNG as placeholder so builds don't fail
    // electron-builder will produce a low-quality icon but won't error
    const minimalPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    writeFileSync(join(buildDir, "icon.png"), minimalPng);
    console.log("   Placeholder icon.png written to apps/desktop/build/");
  }
}

main();
