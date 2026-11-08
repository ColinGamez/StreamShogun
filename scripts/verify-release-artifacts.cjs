#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

async function verifyReleaseArtifacts(directory, {
  expectedVersion,
  platform = process.platform,
  arch = process.arch,
  refType,
  refName,
  manifestName,
} = {}) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion || '')) {
    throw new Error('A valid expectedVersion is required');
  }
  if (refType === 'tag' && refName !== `v${expectedVersion}`) {
    throw new Error(`Release tag must be v${expectedVersion}; got ${refName}`);
  }
  const aliases = { windows: 'win32', macos: 'darwin', mac: 'darwin' };
  platform = aliases[platform] || platform;
  const targets = {
    win32: { os: 'win', manifest: 'latest.yml', suffixes: ['-setup.exe', '-portable.exe'], update: '-setup.exe', blockmap: '-setup.exe' },
    darwin: { os: 'mac', manifest: 'latest-mac.yml', suffixes: ['.dmg', '.zip'], update: '.zip', blockmap: '.zip' },
    linux: { os: 'linux', manifest: 'latest-linux.yml', suffixes: ['.AppImage', '.deb'], update: '.AppImage' },
  };
  const target = targets[platform];
  if (!target || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported release platform or architecture');
  const root = fs.realpathSync(directory);
  const safeFile = (name) => {
    if (typeof name !== 'string' || !name || /[/\\:%]/.test(name) || name === '.' || name === '..') {
      throw new Error(`Unsafe artifact filename: ${name}`);
    }
    const resolved = fs.realpathSync(path.join(root, name));
    if (path.dirname(resolved) !== root || !fs.statSync(resolved).isFile()) {
      throw new Error(`Artifact must be a regular file inside the release directory: ${name}`);
    }
    if (fs.statSync(resolved).size === 0) throw new Error(`Empty artifact: ${name}`);
    return resolved;
  };
  // electron-builder's getArtifactArchName maps Linux x64 per target:
  // AppImage uses x86_64, while Debian packages use amd64.
  const artifactName = (suffix) => {
    const artifactArch = platform === 'linux' && arch === 'x64'
      ? (suffix === '.AppImage' ? 'x86_64' : 'amd64') : arch;
    return `StreamShogun-${expectedVersion}-${target.os}-${artifactArch}${suffix}`;
  };
  const expected = target.suffixes.map(artifactName);
  for (const name of expected) safeFile(name);
  if (target.blockmap) safeFile(artifactName(target.blockmap) + '.blockmap');
  const metadataName = manifestName || target.manifest;
  const manifest = yaml.load(fs.readFileSync(safeFile(metadataName), 'utf8'), { schema: yaml.JSON_SCHEMA });
  if (!manifest || manifest.version !== expectedVersion) throw new Error('Update manifest version does not match expectedVersion');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Update manifest files are missing');
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || !expected.includes(entry.url) || seen.has(entry.url)) {
      throw new Error(`Unexpected or duplicate update artifact: ${entry?.url}`);
    }
    seen.add(entry.url);
    const filename = safeFile(entry.url);
    const size = fs.statSync(filename).size;
    if (!Number.isSafeInteger(entry.size) || entry.size !== size) throw new Error(`Size mismatch: ${entry.url}`);
    const hash = crypto.createHash('sha512');
    for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
    if (entry.sha512 !== hash.digest('base64')) throw new Error(`SHA512 mismatch: ${entry.url}`);
  }
  const updateName = artifactName(target.update);
  if (!seen.has(updateName)) throw new Error(`Update manifest is missing ${updateName}`);
  const primary = manifest.files.find((entry) => entry.url === manifest.path);
  if (!primary || manifest.sha512 !== primary.sha512) throw new Error('Legacy manifest path/sha512 does not match a verified file');
  return { version: expectedVersion, platform, arch, files: [...expected, metadataName], manifest };
}

module.exports = { verifyReleaseArtifacts };

if (require.main === module) {
  const [directory = 'apps/desktop/release', platform = process.platform] = process.argv.slice(2);
  const expectedVersion = require('../apps/desktop/package.json').version;
  verifyReleaseArtifacts(directory, {
    expectedVersion,
    platform,
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME,
  }).then((result) => {
    console.log(`Verified release ${result.version} for ${result.platform}/${result.arch}`);
  }).catch((error) => {
    console.error(`Release verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
