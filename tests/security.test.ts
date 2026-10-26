import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { saveSettings, redactSecrets, publicSettings } from '../src/lib/server/settings';
import { webUrl } from '../src/lib/client/desktop';

// the settings file path is read on each call, so this applies before any save
process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-sec-'));

test('settings refuse values that could steer where the server sends requests', () => {
  assert.equal(saveSettings({ GEMINI_MODEL: '../../v1/files' }).ok, false);
  assert.equal(saveSettings({ GEMINI_MODEL: 'gemini-3.8-flash?x=1' }).ok, false);
  assert.equal(saveSettings({ DIVINA_LEAGUE: 'soccer/../../x' }).ok, false);
  assert.equal(saveSettings({ DIVINA_CALENDAR_ICS: 'file:///etc/passwd' }).ok, false);
  assert.equal(saveSettings({ DIVINA_CALENDAR_ICS: 'https://user:pw@example.com/a.ics' }).ok, false);
  assert.equal(saveSettings({ GEMINI_API_KEY: 'key with spaces' }).ok, false);
  assert.equal(saveSettings({ DIVINA_VOICE_MODE: 'loud' }).ok, false);
  assert.equal(saveSettings({ IG_BUSINESS_ACCOUNT_ID: '17841;drop' }).ok, false);
  assert.equal(saveSettings({ NOT_A_SETTING: 'x' }).ok, false);
});

test('ordinary values are accepted', () => {
  const r = saveSettings({
    GEMINI_MODEL: 'gemini-3.8-flash',
    GEMINI_VOICE: 'Kore',
    DIVINA_LEAGUE: 'football/nfl, soccer/sco.1, basketball/nba',
    DIVINA_CITY: 'St Andrews, GB',
    DIVINA_CALENDAR_ICS: 'webcal://calendar.example.com/private/basic.ics',
    GEMINI_API_KEY: 'AIza' + 'TESTKEYtestkey0123456789abcdefghijk',
    GITHUB_TOKEN: 'github_pat_11AAAAAAA0123456789abcdef',
  });
  assert.equal(r.ok, true);
  const f = JSON.parse(readFileSync(join(process.env.DIVINA_DATA_DIR!, 'settings.local.json'), 'utf8'));
  assert.equal(f.DIVINA_CITY, 'St Andrews, GB');
});

test('secrets never come back out, not even inside an error message', () => {
  const pub = publicSettings();
  assert.equal(pub.GEMINI_API_KEY.value, undefined);
  assert.equal(pub.GEMINI_API_KEY.hint, '…hijk');
  const msg = redactSecrets('upstream said: bad key AIza' + 'TESTKEYtestkey0123456789abcdefghijk (400)');
  assert.ok(!msg.includes('AIzaTESTKEY'));
  assert.ok(msg.includes('(400)'));
});

test('links only open ordinary web addresses', () => {
  assert.equal(webUrl('javascript:alert(1)'), null);
  assert.equal(webUrl('JavaScript:alert(1)'), null);
  assert.equal(webUrl('data:text/html,<script>1</script>'), null);
  assert.equal(webUrl('file:///C:/Windows'), null);
  assert.equal(webUrl('https://a:b@example.com'), null);
  assert.equal(webUrl('https://www.instagram.com/sweeneycreative_co/'), 'https://www.instagram.com/sweeneycreative_co/');
  assert.equal(webUrl('github.com'), 'https://github.com/');
});

test('unlicensed sports and stock feeds stay off until switched on for personal use', async () => {
  const { getSports } = await import('../src/lib/server/providers/sports');
  const { getStocks } = await import('../src/lib/server/providers/stocks');
  saveSettings({ DIVINA_UNOFFICIAL_FEEDS: '' });
  const s = await getSports();
  const k = await getStocks();
  assert.equal(s.status, 'unconfigured');
  assert.equal(k.status, 'unconfigured');
  assert.match((s as { message: string }).message, /isn’t licensed/);
  assert.equal(saveSettings({ DIVINA_UNOFFICIAL_FEEDS: 'yes please' }).ok, false);
  assert.equal(saveSettings({ DIVINA_UNOFFICIAL_FEEDS: 'on' }).ok, true);
});
