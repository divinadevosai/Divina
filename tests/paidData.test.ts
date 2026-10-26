// Paid copies get sports and stocks from Divina's data server, with their licence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-paid-'));
process.env.DIVINA_REQUIRE_LICENCE = '1';
process.env.DIVINA_LS_STORE_ID = '1111';
process.env.DIVINA_LS_PRODUCT_IDS = '2222';
process.env.DIVINA_DATA_URL = 'https://data.example/api/v1';

import { activateLicence, setLicenceFetch } from '../src/lib/server/licence';
import { getSports } from '../src/lib/server/providers/sports';
import { getStocks } from '../src/lib/server/providers/stocks';

const KEY = '38B1460A-5104-4067-A91D-77B872934D51';
setLicenceFetch((async () => new Response(JSON.stringify({ activated: true, instance: { id: 'inst-1234-abcd' }, meta: { store_id: 1111, product_id: 2222, customer_email: 'a@b.co' } }), { status: 200 })) as typeof fetch);

const asked: { url: string; headers: Record<string, string> }[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  asked.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
  const u = String(url);
  if (u.includes('/sports'))
    return new Response(JSON.stringify({ ok: true, leagues: [{ id: 'soccer/eng.1', name: 'Premier League', short: 'EPL', events: [{ id: 'x', name: 'A at B', home: { name: 'B', abbr: 'B', score: '1' }, away: { name: 'A', abbr: 'A', score: '0' }, state: 'in', detail: '50′', date: new Date().toISOString(), league: 'EPL' }], standings: [] }], failed: [] }), { status: 200 });
  if (u.includes('/quotes')) {
    const symbols = new URL(u).searchParams.get('symbols')!.split(',');
    return new Response(JSON.stringify({ ok: true, quotes: Object.fromEntries(symbols.map((s) => [s, { price: 110, prevClose: 100, currency: 'USD', name: s, history: [90, 100, 110], marketState: 'REGULAR' }])), failed: [] }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
}) as typeof fetch;

test('without a licence yet, a paid copy explains instead of calling anything', async () => {
  const s = await getSports();
  assert.equal(s.status, 'error');
  assert.match((s as { message: string }).message, /Activate Divina/);
  assert.equal(asked.length, 0);
});

test('with a licence: scores come from the data server, the licence goes with them', async () => {
  assert.ok((await activateLicence(KEY)).ok);
  const s = await getSports();
  assert.equal(s.status, 'ok');
  if (s.status !== 'ok') return;
  assert.equal(s.data.source, 'API-SPORTS');
  assert.equal(s.data.events[0].detail, '50′');
  const a = asked.at(-1)!;
  assert.match(a.url, /^https:\/\/data\.example\/api\/v1\/sports\?leagues=/);
  assert.equal(a.headers.authorization, `Licence ${KEY}`);
  assert.equal(a.headers['x-divina-instance'], 'inst-1234-abcd');
});

test('stocks: only ticker symbols go to the server, never how many shares you hold', async () => {
  const s = await getStocks();
  assert.equal(s.status, 'ok');
  if (s.status !== 'ok') return;
  assert.match(s.data.source, /^Twelve Data/);
  assert.ok(s.data.holdings.length > 0);
  assert.ok(s.data.holdings.every((h) => Math.abs(h.changePct - 10) < 1e-9));
  const a = asked.filter((x) => x.url.includes('/quotes'));
  assert.equal(a.length, 1, 'all symbols in one request');
  const q = new URL(a[0].url);
  assert.deepEqual([...q.searchParams.keys()], ['symbols']);
});
