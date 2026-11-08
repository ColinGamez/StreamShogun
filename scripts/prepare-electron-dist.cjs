#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function electronArchiveName(version, platform, arch) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version || '')) {
    throw new Error('Invalid Electron version');
  }
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new Error('Unsupported Electron platform or architecture');
  }
  return `electron-v${version}-${platform}-${arch}.zip`;
}

function expectedSha256(checksums, filename) {
  const matches = checksums.split(/\r?\n/).map((line) => /^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)$/.exec(line))
    .filter((match) => match && match[2] === filename);
  if (matches.length !== 1) throw new Error('Official checksums must contain exactly one matching Electron archive');
  return matches[0][1].toLowerCase();
}

async function validateElectronArchive(filename, checksumsPath, expectedFilename) {
  if (path.basename(filename) !== expectedFilename || !/^electron-v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-(win32|darwin|linux)-(x64|arm64)\.zip$/.test(expectedFilename)) {
    throw new Error('Unexpected Electron archive filename');
  }
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.size === 0) throw new Error('Electron archive must be a nonempty regular file');
  const checksumsInfo = fs.lstatSync(checksumsPath);
  if (!checksumsInfo.isFile() || checksumsInfo.size === 0 || checksumsInfo.size > 1024 * 1024) {
    throw new Error('Invalid official checksum file');
  }
  const expected = expectedSha256(fs.readFileSync(checksumsPath, 'utf8'), expectedFilename);
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw new Error('Electron archive SHA256 does not match official checksums');
}

async function downloadOfficialElectron({ version, filename, directory }) {
  // Fixed official repository; no shell expansion and no alternate mirrors.
  const result = spawnSync(process.platform === 'win32' ? 'gh.exe' : 'gh', [
    'release', 'download', `v${version}`, '--repo', 'electron/electron',
    '--pattern', filename, '--pattern', 'SHASUMS256.txt', '--dir', directory,
  ], { shell: false, encoding: 'utf8', timeout: 180_000, maxBuffer: 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error('Official Electron API download failed or timed out');
  }
}

async function prepareElectronDist({
  version = require('electron/package.json').version,
  platform = process.platform,
  arch = process.arch,
  tempRoot = process.env.RUNNER_TEMP,
  githubEnv = process.env.GITHUB_ENV,
  download = downloadOfficialElectron,
} = {}) {
  const filename = electronArchiveName(version, platform, arch);
  if (!tempRoot || !githubEnv || /[\r\n]/.test(tempRoot) || /[\r\n]/.test(githubEnv)) {
    throw new Error('RUNNER_TEMP and GITHUB_ENV must be valid single-line paths');
  }
  const tempDirectory = fs.realpathSync(tempRoot);
  if (/[\r\n]/.test(tempDirectory)) throw new Error('Runner temp path must be a single line');
  const directory = fs.mkdtempSync(path.join(tempDirectory, 'streamshogun-electron-'));
  const archive = path.join(directory, filename);
  try {
    await download({ version, filename, directory });
    await validateElectronArchive(archive, path.join(directory, 'SHASUMS256.txt'), filename);
    fs.appendFileSync(githubEnv, `STREAMSHOGUN_ELECTRON_DIST=${archive}\n`);
    return archive;
  } catch (error) {
    // The unique directory was created above inside the resolved runner temp.
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { electronArchiveName, expectedSha256, validateElectronArchive, prepareElectronDist };

if (require.main === module) {
  prepareElectronDist().then((archive) => {
    console.log(`Verified official Electron distribution: ${path.basename(archive)}`);
  }).catch((error) => {
    console.error(`Electron distribution preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
