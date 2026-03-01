/**
 * Cross-platform clean script.
 * Removes dist/out/release dirs from all workspace packages.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dirs = [
  path.join(root, "packages", "core", "dist"),
  path.join(root, "apps", "ui", "dist"),
  path.join(root, "apps", "desktop", "dist"),
  path.join(root, "apps", "desktop", "out"),
  path.join(root, "apps", "desktop", "release"),
];

for (const dir of dirs) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  removed ${path.relative(root, dir)}`);
  }
}

console.log("Clean complete.");
