#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function requiredToolsets(platform = process.platform, arch = process.arch) {
  if (require('app-builder-lib/package.json').version !== '26.15.3') {
    throw new Error('Builder tool prefetch requires audited app-builder-lib 26.15.3');
  }
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported builder tool platform/architecture');
  const host = platform === 'win32' ? 'win' : platform;
  const toolArch = platform === 'darwin' && arch === 'x64' ? 'x86_64' : arch;
  const selected = [
    ['7zip@1.0.0', `7zip-${host}-${toolArch}.tar.gz`, '7zip.js'],
    ['icons@1.1.0', 'icons-bundle.tar.gz', 'icons.js'],
  ];
  if (platform === 'darwin') {
    if (require('dmg-builder/package.json').version !== '26.15.3') {
      throw new Error('DMG tool prefetch requires audited dmg-builder 26.15.3');
    }
    selected.push(['dmg-builder@1.2.5', `dmgbuild-bundle-${toolArch}-75c8a6c.tar.gz`, 'dmgUtil.js']);
  }
  if (platform === 'linux') selected.push(
    ['appimage-12.0.1', 'appimage-12.0.1.7z', 'linux.js'],
    ['fpm@2.1.4', `fpm-1.17.0-ruby-3.4.3-linux-${arch === 'x64' ? 'amd64' : 'arm64v8'}.7z`, 'linux.js'],
  );
  if (platform === 'win32') selected.push(
    ['winCodeSign-2.6.0', 'winCodeSign-2.6.0.7z', 'windows.js'],
    ['nsis-3.0.4.1', 'nsis-3.0.4.1.7z', 'windows.js'],
    ['nsis-resources-3.4.1', 'nsis-resources-3.4.1.7z', 'windows.js'],
  );
  const sourceRoot = path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'out', 'toolsets');
  return selected.map(([release, filename, sourceName]) => {
    const sourcePath = sourceName === 'dmgUtil.js'
      ? require.resolve('dmg-builder') : path.join(sourceRoot, sourceName);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`["']${escaped}["']\\s*\\]?\\s*[:,]\\s*["']([a-f0-9]{64})["']`, 'g');
    const hashes = [...source.matchAll(pattern)].map((match) => match[1]);
    if (!hashes.length || new Set(hashes).size !== 1) throw new Error(`Missing or conflicting installed builder checksum: ${filename}`);
    return { release, filename, sha256: hashes[0] };
  });
}

async function verifyToolArchive(filename, expected) {
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.size === 0) throw new Error('Tool archive must be a nonempty regular file');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw new Error(`Builder tool SHA256 mismatch: ${path.basename(filename)}`);
}

async function downloadTool({ release, filename, directory }) {
  const result = spawnSync(process.platform === 'win32' ? 'gh.exe' : 'gh', [
    'release', 'download', release, '--repo', 'electron-userland/electron-builder-binaries',
    '--pattern', filename, '--dir', directory,
  ], { shell: false, timeout: 180_000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Official builder tool API download failed: ${filename}`);
}

async function prepareBuilderTools({
  platform = process.platform, arch = process.arch,
  tempRoot = process.env.RUNNER_TEMP, githubEnv = process.env.GITHUB_ENV,
  download = downloadTool, resolveTools = requiredToolsets,
} = {}) {
  const tools = resolveTools(platform, arch);
  if (!tempRoot || !githubEnv || /[\r\n]/.test(tempRoot + githubEnv)) throw new Error('Runner paths must be single-line paths');
  for (const tool of tools) {
    if (!/^[A-Za-z0-9@.-]+$/.test(tool.release) || tool.release.includes('..') ||
        !/^[A-Za-z0-9._-]+$/.test(tool.filename) || tool.filename.includes('..') ||
        !/^[a-f0-9]{64}$/.test(tool.sha256)) throw new Error('Invalid pinned tool descriptor');
  }
  const root = fs.realpathSync(tempRoot);
  if (/[\r\n]/.test(root)) throw new Error('Runner temp path must be a single line');
  const cache = fs.mkdtempSync(path.join(root, 'streamshogun-builder-tools-'));
  try {
    for (const tool of tools) {
      const directory = path.join(cache, tool.release);
      fs.mkdirSync(directory, { recursive: true });
      await download({ ...tool, directory });
      await verifyToolArchive(path.join(directory, tool.filename), tool.sha256);
    }
    // electron-builder checks these archive-cache paths and performs its own
    // checksum validation and native extraction, including cache-state files.
    fs.appendFileSync(githubEnv, `ELECTRON_BUILDER_CACHE=${cache}\n`);
    return { cache, tools };
  } catch (error) {
    if (path.dirname(cache) !== root) throw new Error('Refusing cleanup outside runner temp');
    fs.rmSync(cache, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { requiredToolsets, verifyToolArchive, prepareBuilderTools };
if (require.main === module) {
  prepareBuilderTools().then(({ tools }) => console.log(`Verified ${tools.length} official builder tool archives`)).catch((error) => {
    console.error(`Builder tool preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
