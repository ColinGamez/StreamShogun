const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { electronArchiveName, expectedSha256, prepareElectronDist } = require('./prepare-electron-dist.cjs');

function fixture(t, mutate) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shogun-electron-test-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const githubEnv = path.join(tempRoot, 'github-env');
  fs.writeFileSync(githubEnv, 'EXISTING=1\n');
  const options = {
    version: '43.2.0', platform: 'win32', arch: 'x64', tempRoot, githubEnv,
    download: async ({ filename, directory, version }) => {
      assert.equal(version, '43.2.0');
      assert.equal(filename, 'electron-v43.2.0-win32-x64.zip');
      const bytes = Buffer.from('fixture archive');
      fs.writeFileSync(path.join(directory, filename), bytes);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      fs.writeFileSync(path.join(directory, 'SHASUMS256.txt'), `${hash} *${filename}\n`);
      mutate?.({ filename, directory });
    },
  };
  return { options, githubEnv, tempRoot };
}

test('names only supported official Electron versions, platforms and architectures', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    for (const arch of ['x64', 'arm64']) assert.equal(electronArchiveName('43.2.0', platform, arch), `electron-v43.2.0-${platform}-${arch}.zip`);
  }
  for (const args of [['../../bad', 'win32', 'x64'], ['43.2.0', 'windows', 'x64'], ['43.2.0', 'linux', '../x64']]) {
    assert.throws(() => electronArchiveName(...args));
  }
});

test('checksums require an exact unique filename', () => {
  const hash = 'a'.repeat(64);
  assert.equal(expectedSha256(`${hash}  archive.zip\n`, 'archive.zip'), hash);
  assert.throws(() => expectedSha256(`${hash}  other.zip`, 'archive.zip'));
  assert.throws(() => expectedSha256(`${hash}  archive.zip\n${hash}  archive.zip`, 'archive.zip'));
});

test('verifies downloaded archive and appends absolute path to existing GitHub environment', async (t) => {
  const f = fixture(t);
  const archive = await prepareElectronDist(f.options);
  assert.ok(path.isAbsolute(archive));
  assert.equal(fs.readFileSync(f.githubEnv, 'utf8'), `EXISTING=1\nSTREAMSHOGUN_ELECTRON_DIST=${archive}\n`);
  const second = await prepareElectronDist(f.options);
  assert.notEqual(path.dirname(archive), path.dirname(second));
});

for (const failure of ['tampered', 'empty', 'missing-checksums', 'wrong-checksum']) {
  test(`rejects ${failure} download without exporting environment`, async (t) => {
    const f = fixture(t, ({ directory, filename }) => {
      if (failure === 'tampered') fs.writeFileSync(path.join(directory, filename), 'tampered bytes');
      if (failure === 'empty') fs.writeFileSync(path.join(directory, filename), '');
      if (failure === 'missing-checksums') fs.unlinkSync(path.join(directory, 'SHASUMS256.txt'));
      if (failure === 'wrong-checksum') fs.writeFileSync(path.join(directory, 'SHASUMS256.txt'), `${'0'.repeat(64)}  ${filename}\n`);
    });
    await assert.rejects(prepareElectronDist(f.options));
    assert.equal(fs.readFileSync(f.githubEnv, 'utf8'), 'EXISTING=1\n');
    assert.deepEqual(fs.readdirSync(f.tempRoot), ['github-env']);
  });
}

test('download failure does not export or leave incomplete download', async (t) => {
  const f = fixture(t);
  f.options.download = async () => { throw new Error('download failed'); };
  await assert.rejects(prepareElectronDist(f.options), /download failed/);
  assert.deepEqual(fs.readdirSync(f.tempRoot), ['github-env']);
});

test('rejects newline environment injection before downloading', async (t) => {
  const f = fixture(t);
  let downloaded = false;
  f.options.download = async () => { downloaded = true; };
  await assert.rejects(prepareElectronDist({ ...f.options, tempRoot: f.tempRoot + '\nINJECTED=1' }), /single-line/);
  assert.equal(downloaded, false);
});
