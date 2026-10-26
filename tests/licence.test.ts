// Licence keys for the paid desktop editions, against a fake Lemon Squeezy.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-licence-'));
const dir = process.env.DIVINA_DATA_DIR;
process.env.DIVINA_REQUIRE_LICENCE = '1';
process.env.DIVINA_LS_STORE_ID = '1111';
process.env.DIVINA_LS_PRODUCT_IDS = '2222';

import { activateLicence, deactivateLicence, forgetLicence, licenceStatus, setLicenceFetch, CHECK_EVERY, OFFLINE_GRACE } from '../src/lib/server/licence';
import { GET, POST } from '../src/app/api/licence/route';

const KEY = '38B1460A-5104-4067-A91D-77B872934D51';
type Call = { path: string; form: Record<string, string> };
let calls: Call[] = [];
let shop: (c: Call) => { status?: number; body: object } | 'offline';

const meta = (over: object = {}) => ({ store_id: 1111, product_id: 2222, product_name: 'Divina', variant_name: 'Default', customer_email: 'buyer@example.com', ...over });
const goodShop = (c: Call) => {
  if (c.path === 'activate') return { body: { activated: true, error: null, license_key: { status: 'active', activation_limit: 3, activation_usage: 1 }, instance: { id: 'inst-1', name: c.form.instance_name }, meta: meta() } };
  if (c.path === 'validate') return { body: { valid: true, error: null, license_key: { status: 'active' }, instance: { id: c.form.instance_id }, meta: meta() } };
  return { body: { deactivated: true, error: null, meta: meta() } };
};

setLicenceFetch((async (url: string | URL, init?: RequestInit) => {
  const c = { path: String(url).split('/').pop()!, form: Object.fromEntries(new URLSearchParams(String(init?.body))) };
  calls.push(c);
  const r = shop(c);
  if (r === 'offline') throw new TypeError('fetch failed');
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch);

beforeEach(() => {
  forgetLicence();
  calls = [];
  shop = goodShop;
});

test('a sale build asks for a licence until one is activated', async () => {
  const s = await licenceStatus();
  assert.equal(s.required, true);
  assert.equal(s.ok, false);
  assert.equal(s.state, 'none');
  assert.equal(calls.length, 0);
});

test('activating sends only the key and a random device name, and keeps the key sealed', async () => {
  const s = await activateLicence(`  ${KEY} `);
  assert.ok(s.ok);
  assert.equal(s.state, 'active');
  assert.equal(s.email, 'b•••@example.com');
  assert.equal(calls[0].path, 'activate');
  assert.deepEqual(Object.keys(calls[0].form).sort(), ['instance_name', 'license_key']);
  assert.equal(calls[0].form.license_key, KEY);
  assert.match(calls[0].form.instance_name, /^Divina for \w+ · [0-9a-f]{6}$/);
  const stored = readFileSync(join(dir, 'licence.local.json'), 'utf8');
  assert.ok(!stored.includes(KEY), 'the key must not be stored in the clear');
  // within a week, no calls to the shop at all
  calls = [];
  assert.ok((await licenceStatus()).ok);
  assert.equal(calls.length, 0);
});

test('a real key from someone else’s store is refused and its seat given back', async () => {
  shop = (c) => (c.path === 'activate' ? { body: { activated: true, instance: { id: 'x' }, meta: meta({ store_id: 9999 }) } } : { body: { deactivated: true } });
  const s = await activateLicence(KEY);
  assert.equal(s.ok, false);
  assert.match(s.message!, /different product/);
  assert.deepEqual(calls.map((c) => c.path), ['activate', 'deactivate']);
  assert.ok(!existsSync(join(dir, 'licence.local.json')));
});

test('another product in our own store is refused too', async () => {
  shop = (c) => (c.path === 'activate' ? { body: { activated: true, instance: { id: 'x' }, meta: meta({ product_id: 3333 }) } } : { body: { deactivated: true } });
  assert.equal((await activateLicence(KEY)).ok, false);
});

test('clear messages for a used-up, refunded or mistyped key', async () => {
  shop = () => ({ status: 400, body: { activated: false, error: 'This license key has reached the activation limit.', license_key: { activation_limit: 3 } } });
  assert.match((await activateLicence(KEY)).message!, /already active on 3 computers/);
  shop = () => ({ status: 400, body: { activated: false, error: 'This license key is disabled.', license_key: { status: 'disabled' } } });
  assert.match((await activateLicence(KEY)).message!, /turned off/);
  shop = () => ({ status: 404, body: { activated: false, error: 'license_key not found.' } });
  assert.match((await activateLicence(KEY)).message!, /wasn’t recognised/);
  assert.match((await activateLicence('not a key')).message!, /doesn’t look like/);
});

test('weekly check: a refund locks it, being offline does not (for 30 days)', async () => {
  const t0 = Date.now();
  await activateLicence(KEY, t0);
  // offline after a week: still works
  shop = () => 'offline';
  let s = await licenceStatus({ now: t0 + CHECK_EVERY + 1000 });
  assert.equal(s.state, 'offline');
  assert.ok(s.ok);
  // offline for more than 30 days: asks to connect
  s = await licenceStatus({ now: t0 + OFFLINE_GRACE + 1000 });
  assert.equal(s.ok, false);
  assert.match(s.message!, /30 days/);
  // online again, but refunded
  shop = () => ({ status: 400, body: { valid: false, error: 'disabled', license_key: { status: 'disabled' }, meta: meta() } });
  s = await licenceStatus({ now: t0 + CHECK_EVERY + 1000 });
  assert.equal(s.ok, false);
  assert.equal(s.state, 'revoked');
  assert.match(s.message!, /refund/);
  // and fine again when the shop says so
  shop = goodShop;
  s = await licenceStatus({ now: t0 + CHECK_EVERY + 1000 });
  assert.ok(s.ok);
  assert.equal(calls.at(-1)!.form.instance_id, 'inst-1');
});

test('the shop answering for a different store during a check counts as revoked', async () => {
  const t0 = Date.now();
  await activateLicence(KEY, t0);
  shop = () => ({ body: { valid: true, meta: meta({ store_id: 5 }) } });
  assert.equal((await licenceStatus({ now: t0 + CHECK_EVERY + 1 })).ok, false);
});

test('deactivating frees the seat; offline it keeps the licence unless forced', async () => {
  await activateLicence(KEY);
  shop = () => 'offline';
  let d = await deactivateLicence();
  assert.equal(d.deactivated, false);
  assert.ok(existsSync(join(dir, 'licence.local.json')));
  shop = goodShop;
  d = await deactivateLicence();
  assert.equal(d.deactivated, true);
  assert.equal(calls.at(-1)!.path, 'deactivate');
  assert.ok(!existsSync(join(dir, 'licence.local.json')));
  assert.equal((await licenceStatus()).ok, false);
});

const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:47800/api/licence', { method, headers: { host: '127.0.0.1:47800', origin: 'http://127.0.0.1:47800', 'sec-fetch-site': 'same-origin', 'x-divina-bridge': '1', 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;

test('the route answers only Divina’s own page', async () => {
  assert.equal((await GET(req('GET', undefined, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal((await POST(req('POST', { op: 'activate', key: KEY }, { 'x-divina-bridge': '' }))).status, 403);
  const r = (await (await POST(req('POST', { op: 'activate', key: KEY }))).json()) as { ok: boolean };
  assert.ok(r.ok);
  const g = (await (await GET(req('GET'))).json()) as { ok: boolean; email: string };
  assert.ok(g.ok);
  assert.ok(!JSON.stringify(g).includes(KEY), 'the key is never sent back to the page');
});

test('without the sale switch (running from source) nothing is asked', async () => {
  process.env.DIVINA_REQUIRE_LICENCE = '';
  try {
    const s = await licenceStatus();
    assert.ok(s.ok);
    assert.equal(s.state, 'not-required');
  } finally {
    process.env.DIVINA_REQUIRE_LICENCE = '1';
  }
});
