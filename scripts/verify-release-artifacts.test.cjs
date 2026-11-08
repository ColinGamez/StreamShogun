const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { verifyReleaseArtifacts } = require('./verify-release-artifacts.cjs');

function fixture(t, platform = 'win32', arch = 'x64') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shogun-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const version = '0.2.2';
  const config = {
    win32: ['win', 'latest.yml', '-setup.exe', '-portable.exe'],
    darwin: ['mac', 'latest-mac.yml', '.zip', '.dmg'],
    linux: ['linux', 'latest-linux.yml', '.AppImage', '.deb'],
  }[platform];
  const [targetOS, manifestName, ...suffixes] = config;
  const names = suffixes.map((suffix) => {
    const artifactArch = platform === 'linux' && arch === 'x64'
      ? (suffix === '.AppImage' ? 'x86_64' : 'amd64') : arch;
    return `StreamShogun-${version}-${targetOS}-${artifactArch}${suffix}`;
  });
  const files = names.map((url) => {
    const data = Buffer.from('test artifact: ' + url);
    fs.writeFileSync(path.join(directory, url), data);
    return { url, size: data.length, sha512: crypto.createHash('sha512').update(data).digest('base64') };
  });
  if (platform !== 'linux') fs.writeFileSync(path.join(directory, names[0] + '.blockmap'), 'blockmap fixture');
  const manifest = { version, files: [files[0]], path: files[0].url, sha512: files[0].sha512 };
  const writeManifest = () => fs.writeFileSync(path.join(directory, manifestName), yaml.dump(manifest));
  writeManifest();
  const verify = (extra = {}) => verifyReleaseArtifacts(directory, { expectedVersion: version, platform, arch, ...extra });
  return { directory, names, manifest, writeManifest, verify };
}

for (const platform of ['win32', 'darwin', 'linux']) {
  test(`accepts complete ${platform} artifacts`, async (t) => {
    assert.equal((await fixture(t, platform).verify()).platform, platform);
  });
}

test('accepts electron-builder Linux arm64 artifact names', async (t) => {
  const f = fixture(t, 'linux', 'arm64');
  assert.deepEqual(f.names, ['StreamShogun-0.2.2-linux-arm64.AppImage', 'StreamShogun-0.2.2-linux-arm64.deb']);
  await f.verify();
});

test('uses target-specific Linux x64 architecture names', async (t) => {
  const f = fixture(t, 'linux');
  assert.deepEqual(f.names, ['StreamShogun-0.2.2-linux-x86_64.AppImage', 'StreamShogun-0.2.2-linux-amd64.deb']);
  fs.renameSync(path.join(f.directory, f.names[0]), path.join(f.directory, 'StreamShogun-0.2.2-linux-x64.AppImage'));
  await assert.rejects(f.verify(), /ENOENT/);
});

test('rejects missing installer and blockmap', async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.directory, f.names[0] + '.blockmap'));
  await assert.rejects(f.verify(), /ENOENT/);
  fs.unlinkSync(path.join(f.directory, f.names[1]));
  await assert.rejects(f.verify(), /ENOENT/);
});

for (const field of ['size', 'sha512', 'version', 'path']) {
  test(`rejects incorrect ${field}`, async (t) => {
    const f = fixture(t);
    if (field === 'size') f.manifest.files[0].size++;
    else if (field === 'sha512') f.manifest.files[0].sha512 = 'wrong';
    else f.manifest[field] = 'wrong';
    f.writeManifest();
    await assert.rejects(f.verify());
  });
}

test('rejects altered installer bytes despite unchanged length', async (t) => {
  const f = fixture(t);
  const filename = path.join(f.directory, f.names[0]);
  const bytes = fs.readFileSync(filename);
  bytes[0] ^= 1;
  fs.writeFileSync(filename, bytes);
  await assert.rejects(f.verify(), /SHA512/);
});

test('rejects metadata references outside the expected release', async (t) => {
  const f = fixture(t);
  for (const name of ['../secret.exe', 'https://evil.example/a.exe', '%2e%2e%2fsecret', 'StreamShogun-0.1.0-win-x64-setup.exe']) {
    f.manifest.files[0].url = name;
    f.writeManifest();
    await assert.rejects(f.verify(), /Unexpected/);
  }
});

test('requires update target in manifest and rejects duplicates', async (t) => {
  const f = fixture(t);
  f.manifest.files.push(f.manifest.files[0]);
  f.writeManifest();
  await assert.rejects(f.verify(), /duplicate/);
  f.manifest.files = [];
  f.writeManifest();
  await assert.rejects(f.verify(), /missing/);
});

test('requires release tag to match package version', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.verify({ refType: 'tag', refName: 'v0.2.1' }), /Release tag/);
  await f.verify({ refType: 'tag', refName: 'v0.2.2' });
});
