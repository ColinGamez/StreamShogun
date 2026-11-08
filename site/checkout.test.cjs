const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'site.js'), 'utf8');

async function run({ account = 200, billing = 200, payload = { url: 'https://checkout.stripe.com/test' }, network = false, interval = 'monthly' } = {}) {
  let click, assigned, requests = 0;
  const error = { hidden: true };
  const checkout = { dataset: { interval }, addEventListener(_, fn) { click = fn; }, setAttribute() {}, removeAttribute() {} };
  const links = ['/login', '/register'].map((href) => ({ href, getAttribute() { return this.href; }, setAttribute(_, value) { this.href = value; } }));
  const modal = { hidden: true, querySelectorAll() { return links; }, querySelector() { return { focus() {}, addEventListener() {} }; }, addEventListener() {} };
  const document = { documentElement: { classList: { add() {} } }, cookie: '', querySelectorAll() { return []; }, addEventListener() {}, querySelector(selector) { return ({ '[data-checkout]': checkout, '[data-checkout-error]': error, '[data-login-modal]': modal })[selector] || null; } };
  vm.runInNewContext(source, {
    document, navigator: { userAgent: '', platform: '' }, window: {},
    location: { hostname: 'localhost', origin: 'http://localhost:8080', assign(url) { assigned = url; } },
    fetch: async (url, options) => {
      assert.ok(url.startsWith('http://localhost:8080/api/'));
      if (url.endsWith('/checkout')) {
        requests++;
        assert.equal(JSON.parse(options.body).interval, interval);
        if (network) throw Error('offline');
        return { ok: billing === 200, status: billing, json: async () => payload };
      }
      return { status: account, ok: account === 200 };
    },
  });
  const first = click();
  await click();
  await first;
  assert.equal(checkout.disabled, false);
  return { error, modal, links, assigned, requests };
}

test('checkout redirects once and retains annual billing', async () => {
  const result = await run({ interval: 'yearly' });
  assert.equal(result.assigned, 'https://checkout.stripe.com/test');
  assert.equal(result.requests, 1);
});

test('billing errors are shown without asking a signed-in customer to sign in', async () => {
  const result = await run({ billing: 503, payload: { message: 'Billing is temporarily disabled' } });
  assert.equal(result.error.textContent, 'Billing is temporarily disabled');
  assert.equal(result.error.hidden, false);
  assert.equal(result.modal.hidden, true);
});

test('unauthenticated checkout preserves annual intent on both auth links', async () => {
  const result = await run({ account: 401, interval: 'yearly' });
  assert.equal(result.modal.hidden, false);
  assert.equal(result.requests, 0);
  assert.deepEqual(result.links.map((link) => link.href), ['/login?plan=yearly', '/register?plan=yearly']);
});

test('session expiry during checkout requests login', async () => {
  assert.equal((await run({ billing: 401 })).modal.hidden, false);
});

for (const options of [{ account: 500 }, { network: true }]) {
  test('connection failure recovers without opening the login modal ' + JSON.stringify(options), async () => {
    const result = await run(options);
    assert.equal(result.modal.hidden, true);
    assert.equal(result.error.hidden, false);
  });
}

for (const page of ['login.html', 'register.html']) {
  test(page + ' preserves only supported plans through authentication', () => {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
    const start = html.indexOf('    var selectedPlan =');
    const end = html.indexOf("    var googleClientId", start);
    for (const [plan, expected] of [['yearly', '/account?plan=yearly'], ['monthly', '/account?plan=monthly'], ['https://evil.example', '/account']]) {
      const context = { URLSearchParams, window: { location: { search: '?plan=' + encodeURIComponent(plan) } }, document: { querySelectorAll: () => [] } };
      vm.runInNewContext(html.slice(start, end), context);
      assert.equal(context.accountDestination, expected);
    }
  });
}

test('account confirms the annual price and sends annual checkout without starting automatically', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'account.html'), 'utf8');
  const button = {};
  let handler, posted;
  const context = {
    URLSearchParams,
    API_BASE: 'https://api.example.test',
    window: { location: { search: '?plan=yearly' } },
    document: { getElementById() { return button; } },
    authHeaders: () => ({}),
    showError() {},
    fetch: async (_url, options) => {
      posted = JSON.parse(options.body);
      return { json: async () => ({ url: 'https://checkout.stripe.com/test' }) };
    },
  };
  const start = html.indexOf('  var checkoutInterval =');
  const end = html.indexOf('  var loadingEl', start);
  vm.runInNewContext(html.slice(start, end), context);
  assert.equal(button.textContent, 'Upgrade to Pro - $69.99 / year');
  assert.equal(posted, undefined);
  button.addEventListener = (_, fn) => { handler = fn; };
  const handlerStart = html.indexOf("  document.getElementById('upgrade-btn').addEventListener");
  const handlerEnd = html.indexOf('\n  });', handlerStart) + '\n  });'.length;
  vm.runInNewContext(html.slice(handlerStart, handlerEnd), context);
  handler.call(button);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posted.interval, 'yearly');
  assert.equal(context.window.location.href, 'https://checkout.stripe.com/test');
});
