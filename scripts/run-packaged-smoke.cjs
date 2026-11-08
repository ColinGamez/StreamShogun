'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = fs.realpathSync(process.argv[2] || 'apps/desktop/release');
const archives = [];
function findArchives(directory, depth = 0) {
  if (depth > 8) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) findArchives(filename, depth + 1);
    else if (entry.isFile() && entry.name === 'app.asar') archives.push(filename);
  }
}
findArchives(root);
if (archives.length !== 1) throw new Error('Expected exactly one freshly packaged app.asar');
const archive = archives[0];
const application = path.dirname(path.dirname(archive));
let executable;
if (process.platform === 'darwin') {
  const macOS = path.join(application, 'MacOS');
  const files = fs.readdirSync(macOS, { withFileTypes: true }).filter((entry) => entry.isFile());
  if (files.length !== 1) throw new Error('Expected exactly one packaged macOS executable');
  executable = path.join(macOS, files[0].name);
} else {
  executable = path.join(application, process.platform === 'win32' ? 'StreamShogun.exe' : 'StreamShogun');
}
const result = spawnSync(executable, [path.join(__dirname, 'smoke-packaged-db.cjs'), archive], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000,
});
if (result.error) throw result.error;
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error(`Packaged database smoke failed (${result.status})`);
