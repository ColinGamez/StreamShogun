#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { verifyReleaseArtifacts } = require('./verify-release-artifacts.cjs');

async function mergeMacUpdateInfo(directory, { expectedVersion } = {}) {
  const root = fs.realpathSync(directory);
  const inputs = [];
  for (const arch of ['arm64', 'x64']) {
    const { manifest } = await verifyReleaseArtifacts(root, {
      expectedVersion,
      platform: 'darwin',
      arch,
      manifestName: `latest-mac-${arch}.yml`,
    });
    for (const extension of ['zip', 'dmg']) {
      const name = `StreamShogun-${expectedVersion}-mac-${arch}.${extension}`;
      if (!manifest.files.some((entry) => entry.url === name)) {
        throw new Error(`Mac manifest is missing ${name}`);
      }
    }
    inputs.push(manifest);
  }
  const files = inputs.flatMap((manifest) => manifest.files);
  if (new Set(files.map((entry) => entry.url)).size !== files.length) {
    throw new Error('Mac update manifests contain colliding artifact names');
  }
  // Modern electron-updater filters files by native architecture before
  // selecting ZIP. Keep an arm64 ZIP as the legacy primary, independently
  // of input file ordering (electron-builder may list DMG first).
  const primary = files.find((entry) => entry.url === `StreamShogun-${expectedVersion}-mac-arm64.zip`);
  const merged = {
    version: expectedVersion,
    files,
    path: primary.url,
    sha512: primary.sha512,
  };
  const dates = inputs.map((manifest) => manifest.releaseDate).filter((date) => typeof date === 'string' && Number.isFinite(Date.parse(date)));
  if (dates.length) merged.releaseDate = dates.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
  const output = path.join(root, 'latest-mac.yml');
  // Refuse symlink outputs so writing metadata cannot escape the directory.
  if (fs.lstatSync(output, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('Refusing symlink output latest-mac.yml');
  }
  fs.writeFileSync(output, yaml.dump(merged, { lineWidth: -1 }));
  return merged;
}

module.exports = { mergeMacUpdateInfo };

if (require.main === module) {
  const directory = process.argv[2] || 'artifacts';
  const expectedVersion = require('../apps/desktop/package.json').version;
  mergeMacUpdateInfo(directory, { expectedVersion }).then((manifest) => {
    console.log(`Merged macOS ${manifest.version} update metadata: ${manifest.files.length} verified files`);
  }).catch((error) => {
    console.error(`macOS update metadata merge failed: ${error.message}`);
    process.exitCode = 1;
  });
}
