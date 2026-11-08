const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { requiredToolsets, prepareBuilderTools } = require('./prepare-builder-tools.cjs');

for (const platform of ['win32', 'darwin', 'linux']) {
  for (const arch of ['x64', 'arm64']) {
    test(`resolves installed checksum pins for ${platform}/${arch}`, () => {
      const tools = requiredToolsets(platform, arch);
      assert.equal(tools.length, platform === 'win32' ? 5 : platform === 'linux' ? 4 : 3);
      assert.ok(tools.some((tool) => tool.filename === 'icons-bundle.tar.gz'));
      assert.ok(tools.every((tool) => /^[a-f0-9]{64}$/.test(tool.sha256)));
      const expectedReleases = ['7zip@1.0.0', 'icons@1.1.0'];
      if (platform === 'darwin') expectedReleases.push('dmg-builder@1.2.5');
      if (platform === 'linux') expectedReleases.push('appimage-12.0.1', 'fpm@2.1.4');
      if (platform === 'win32') expectedReleases.push('winCodeSign-2.6.0', 'nsis-3.0.4.1', 'nsis-resources-3.4.1');
      assert.deepEqual(tools.map((tool) => tool.release), expectedReleases);
      const host = platform === 'win32' ? 'win' : platform;
      const toolArch = platform === 'darwin' && arch === 'x64' ? 'x86_64' : arch;
      assert.equal(tools[0].filename, `7zip-${host}-${toolArch}.tar.gz`);
      if (platform === 'darwin') {
        assert.equal(tools[2].filename, `dmgbuild-bundle-${toolArch}-75c8a6c.tar.gz`);
        assert.equal(tools[2].sha256, arch === 'arm64'
          ? '793404d0c96687e27d5ee40a668d498c92e36a64d6c2906df511031adb33cbeb'
          : '1664972f9cc2d6e8fce3b63e42cd30078aff602669c5856939c4519921200433');
      }
      if (platform === 'linux') assert.ok(tools.some((tool) => tool.filename === 'appimage-12.0.1.7z'));
      if (platform === 'linux') assert.equal(tools[3].filename, `fpm-1.17.0-ruby-3.4.3-linux-${arch === 'x64' ? 'amd64' : 'arm64v8'}.7z`);
    });
  }
}

function fixture(t, download) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shogun-builder-fixture-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const githubEnv = path.join(tempRoot, 'github-env');
  fs.writeFileSync(githubEnv, 'EXISTING=1\n');
  const bytes = Buffer.from('fixture archive');
  const tool = { release: 'tool@1.0.0', filename: 'tool.7z', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  return {
    tempRoot, githubEnv, tool,
    options: { tempRoot, githubEnv, resolveTools: () => [tool], download: download || (async ({ directory, filename }) => fs.writeFileSync(path.join(directory, filename), bytes)) },
  };
}

test('populates builder native archive cache layout after independent hash verification', async (t) => {
  const f = fixture(t);
  const result = await prepareBuilderTools(f.options);
  assert.ok(fs.existsSync(path.join(result.cache, 'tool@1.0.0', 'tool.7z')));
  assert.equal(fs.readFileSync(f.githubEnv, 'utf8'), `EXISTING=1\nELECTRON_BUILDER_CACHE=${result.cache}\n`);
});

for (const failure of ['hash', 'empty', 'download']) {
  test(`rejects ${failure} without exporting partial cache`, async (t) => {
    const f = fixture(t, async ({ directory, filename }) => {
      if (failure === 'download') throw new Error('failed download');
      fs.writeFileSync(path.join(directory, filename), failure === 'empty' ? '' : 'wrong');
    });
    await assert.rejects(prepareBuilderTools(f.options));
    assert.deepEqual(fs.readdirSync(f.tempRoot), ['github-env']);
    assert.equal(fs.readFileSync(f.githubEnv, 'utf8'), 'EXISTING=1\n');
  });
}

test('rejects unsupported hosts and traversal descriptors', async (t) => {
  assert.throws(() => requiredToolsets('freebsd', 'x64'));
  const f = fixture(t);
  f.tool.filename = '../outside.7z';
  await assert.rejects(prepareBuilderTools(f.options), /Invalid pinned/);
});

for (const platform of ['win32', 'darwin', 'linux']) {
  for (const arch of ['x64', 'arm64']) {
    test(`accepts real ${platform}/${arch} descriptors through preparation`, async (t) => {
      const f = fixture(t);
      let reachedDownload = false;
      await assert.rejects(prepareBuilderTools({
        ...f.options,
        platform,
        arch,
        resolveTools: requiredToolsets,
        download: async () => {
          reachedDownload = true;
          throw new Error('fixture-download-reached');
        },
      }), /fixture-download-reached/);
      assert.equal(reachedDownload, true);
      assert.equal(fs.readFileSync(f.githubEnv, 'utf8'), 'EXISTING=1\n');
    });
  }
}
