// The new-tab extension's build: Windows-only cards left out, and a search box that only ever opens web pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_DIVINA_PLATFORM = 'extension';
process.env.NEXT_PUBLIC_DIVINA_EDITION = 'web';

test('the extension has no Windows-only cards', async () => {
  const { MODULE_IDS, isModuleId } = await import('../src/modules/ids');
  for (const id of ['stocks', 'sports', 'email', 'instagram', 'projects']) assert.ok(!MODULE_IDS.includes(id as never), id);
  for (const id of ['weather', 'notes', 'agents', 'crypto', 'calendar', 'news', 'music', 'ai', 'system']) assert.ok(isModuleId(id), id);
});

test('the new tab opens quickly', async () => {
  const { boot } = await import('../src/core/motion/vocabulary');
  assert.ok(boot.done <= 1.5, `boot takes ${boot.done}s`);
});

test('web addresses open, everything else is searched', async () => {
  const { addressFor } = await import('../src/hud/SearchBar');
  assert.equal(addressFor('example.com'), 'https://example.com');
  assert.equal(addressFor('  bbc.co.uk/news '), 'https://bbc.co.uk/news');
  assert.equal(addressFor('https://divinaos.site/#buy'), 'https://divinaos.site/#buy');
  assert.equal(addressFor('localhost:3000'), 'http://localhost:3000');
  for (const q of ['weather in leeds', 'divina', 'what is 2+2', 'node.js tutorial', '']) assert.equal(addressFor(q), null, q);
});

test('the search box never opens script, data or browser pages', async () => {
  const { addressFor } = await import('../src/hud/SearchBar');
  for (const q of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'chrome://settings', 'file:///etc/passwd', 'vbscript:x', 'https:// example.com']) {
    assert.equal(addressFor(q), null, q);
  }
});

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

test('with "essential only", the tour stays seen across new tabs but other preferences don’t', async () => {
  const g = globalThis as unknown as { localStorage: MemoryStorage; sessionStorage: MemoryStorage };
  g.localStorage = new MemoryStorage();
  g.sessionStorage = new MemoryStorage();
  const { setConsent, prefStorage, STORED } = await import('../src/lib/consent');
  setConsent('essential');
  prefStorage.set('divina.tour.done', '1');
  prefStorage.set('divina.hands', '1');
  g.sessionStorage = new MemoryStorage(); // a new tab is a new session
  assert.equal(prefStorage.get('divina.tour.done'), '1');
  assert.equal(prefStorage.get('divina.hands'), null);
  // and the privacy list says so
  assert.ok(STORED.some((s) => /tour/.test(s.what) && s.kind === 'essential'));
  assert.ok(STORED.some((s) => /Hand tracking/.test(s.what) && s.kind === 'preference'));
});
