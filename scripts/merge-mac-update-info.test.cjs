const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { mergeMacUpdateInfo } = require('./merge-mac-update-info.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shogun-mac-merge-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manifests = {};
  for (const arch of ['arm64', 'x64']) {
    const files = ['dmg', 'zip'].map((ext) => {
      const url = `StreamShogun-0.2.2-mac-${arch}.${ext}`;
      const data = Buffer.from(`fixture ${url}`);
      fs.writeFileSync(path.join(directory, url), data);
      if (ext === 'zip') fs.writeFileSync(path.join(directory, url + '.blockmap'), 'blockmap');
      return { url, size: data.length, sha512: crypto.createHash('sha512').update(data).digest('base64') };
    });
    manifests[arch] = { version: '0.2.2', files, path: files[0].url, sha512: files[0].sha512, releaseDate: arch === 'arm64' ? '2026-11-08T01:00:00Z' : '2026-11-08T02:00:00Z' };
  }
  const write = () => {
    for (const [arch, manifest] of Object.entries(manifests)) {
      fs.writeFileSync(path.join(directory, `latest-mac-${arch}.yml`), yaml.dump(manifest));
    }
  };
  write();
  return { directory, manifests, write, merge: () => mergeMacUpdateInfo(directory, { expectedVersion: '0.2.2' }) };
}

test('merges both verified architectures and selects arm64 ZIP as legacy primary', async (t) => {
  const f = fixture(t);
  const merged = await f.merge();
  assert.equal(merged.files.length, 4);
  assert.equal(merged.path, 'StreamShogun-0.2.2-mac-arm64.zip');
  assert.equal(merged.releaseDate, '2026-11-08T02:00:00Z');
  assert.deepEqual(yaml.load(fs.readFileSync(path.join(f.directory, 'latest-mac.yml'), 'utf8')), merged);
  // Mirrors installed MacUpdater.filterFilesForArch, then its ZIP selection.
  for (const arch of ['arm64', 'x64']) {
    const candidates = merged.files.filter((file) => file.url.includes('arm64') === (arch === 'arm64'));
    assert.equal(candidates.find((file) => file.url.endsWith('.zip')).url, `StreamShogun-0.2.2-mac-${arch}.zip`);
  }
});

test('rejects mixed release versions without writing merged metadata', async (t) => {
  const f = fixture(t);
  f.manifests.x64.version = '0.2.1'; f.write();
  await assert.rejects(f.merge(), /version/);
  assert.equal(fs.existsSync(path.join(f.directory, 'latest-mac.yml')), false);
});

for (const failure of ['hash', 'size', 'path', 'duplicate', 'foreign-architecture', 'missing-dmg']) {
  test(`rejects ${failure} metadata`, async (t) => {
    const f = fixture(t);
    const manifest = f.manifests.x64;
    if (failure === 'hash') manifest.files[0].sha512 = 'bad';
    if (failure === 'size') manifest.files[0].size++;
    if (failure === 'path') manifest.path = '../outside.zip';
    if (failure === 'duplicate') manifest.files.push(manifest.files[0]);
    if (failure === 'foreign-architecture') manifest.files[0] = f.manifests.arm64.files[0];
    if (failure === 'missing-dmg') { manifest.files.shift(); manifest.path = manifest.files[0].url; manifest.sha512 = manifest.files[0].sha512; }
    f.write();
    await assert.rejects(f.merge());
  });
}

test('rejects missing ZIP blockmap', async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.directory, 'StreamShogun-0.2.2-mac-x64.zip.blockmap'));
  await assert.rejects(f.merge(), /ENOENT/);
});

test('rejects missing architecture manifest', async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.directory, 'latest-mac-x64.yml'));
  await assert.rejects(f.merge(), /ENOENT/);
});
