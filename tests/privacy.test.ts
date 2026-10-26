// Delete everything (Settings → Privacy & cookies) in the Windows app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-privacy-'));
const dir = process.env.DIVINA_DATA_DIR;

import { saveSettings, setting } from '../src/lib/server/settings';
import { changeNotes, changePersonal, loadNotes, loadPersonal } from '../src/lib/server/personal';
import { POST as eraseRoute } from '../src/app/api/erase/route';

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:3000/api/erase', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin', 'x-divina-bridge': '1', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }) as never;

test('delete everything removes every personal file, keys included, and leaves nothing readable', async () => {
  saveSettings({ GEMINI_API_KEY: 'AIza' + 'TESTONLYerase0123456789abcdefghijk', DIVINA_CITY: 'Leeds' });
  changeNotes({ op: 'add', text: 'Private note' });
  changePersonal('memory', { op: 'add', text: 'Private memory' });
  writeFileSync(join(dir, 'running.json'), '{}'); // the launcher's, not personal
  assert.ok(existsSync(join(dir, 'vault.key')));
  const r = (await (await eraseRoute(req({ confirm: 'erase' }))).json()) as { ok: boolean };
  assert.ok(r.ok);
  assert.deepEqual(readdirSync(dir), ['running.json']);
  assert.equal(setting('GEMINI_API_KEY'), undefined);
  assert.equal(setting('DIVINA_CITY'), undefined);
  assert.deepEqual(loadNotes(), []);
  assert.deepEqual(loadPersonal('memory'), []);
  // Divina keeps working afterwards, with a new key
  saveSettings({ DIVINA_CITY: 'York', GEMINI_API_KEY: 'AIza' + 'TESTONLYafter0123456789abcdefghijkl' });
  assert.equal(setting('GEMINI_API_KEY'), 'AIza' + 'TESTONLYafter0123456789abcdefghijkl');
});

test('delete everything needs the page, its header and an explicit confirm', async () => {
  saveSettings({ DIVINA_CITY: 'Bath' });
  assert.equal((await eraseRoute(req({}))).status, 400);
  assert.equal((await eraseRoute(req({ confirm: 'erase' }, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await eraseRoute(req({ confirm: 'erase' }, { 'x-divina-bridge': '' }))).status, 403);
  assert.equal(setting('DIVINA_CITY'), 'Bath');
});
