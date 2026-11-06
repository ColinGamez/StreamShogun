const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'site', name), 'utf8');
function loadFunction(page, name, context) {
  const source = read(page);
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0);
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start);
  const end = source.indexOf('\n' + indent + '}', start);
  vm.runInNewContext(source.slice(start, end + indent.length + 2), context);
  return context[name];
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const page of ['login.html', 'register.html']) {
  test(page + ' restores an expired access session before redirecting', async () => {
    const calls = [];
    let destination;
    const context = {
      API_BASE: 'https://api.example.test',
      window: { location: { replace: (url) => { destination = url; } } },
      fetch: async (url, options) => {
        calls.push({ url, options });
        return calls.length === 1 ? { status: 401, ok: false } : { status: 200, ok: true };
      },
    };
    loadFunction(page, 'checkAuth', context)();
    await flush();
    assert.equal(calls[1].url, context.API_BASE + '/v1/auth/refresh');
    assert.equal(calls[1].options.body, '{}');
    assert.equal(calls[1].options.credentials, 'include');
    assert.equal(destination, '/account');
  });
}

test('account refresh sends JSON and retries the account request', async () => {
  const calls = [];
  const context = {
    API_BASE: 'https://api.example.test',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ user: { id: 'user' } }) };
    },
  };
  const result = await loadFunction('account.html', 'refreshAndRetry', context)();
  assert.equal(calls[0].options.body, '{}');
  assert.equal(calls[1].url, context.API_BASE + '/v1/me');
  assert.equal(result.user.id, 'user');
});

for (const outcome of ['success', 'http-error', 'network-error']) {
  test('logout handles ' + outcome, async () => {
    const button = { disabled: false };
    const removed = [];
    let error;
    const context = {
      API_BASE: 'https://api.example.test',
      document: { getElementById: () => button },
      window: { location: { href: '/account' } },
      sessionStorage: { removeItem: (key) => removed.push(key) },
      hideLogoutConfirm() {},
      showError(message) { error = message; },
      fetch: async (_url, options) => {
        assert.equal(options.body, '{}');
        if (outcome === 'network-error') throw new Error('offline');
        return { ok: outcome === 'success' };
      },
    };
    loadFunction('account.html', 'doLogout', context)();
    await flush();
    assert.equal(button.disabled, false);
    assert.equal(context.window.location.href, outcome === 'success' ? '/login' : '/account');
    assert.equal(removed.length, outcome === 'success' ? 2 : 0);
    assert.equal(Boolean(error), outcome !== 'success');
  });
}

test('site inline JavaScript parses', () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'site')).filter((f) => f.endsWith('.html'))) {
    for (const match of read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (!match[0].includes('application/ld+json')) new vm.Script(match[1], { filename: file });
    }
  }
});
