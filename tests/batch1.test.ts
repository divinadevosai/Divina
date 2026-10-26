import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-b1-'));
const dir = process.env.DIVINA_DATA_DIR;

import { memoryOp, routinesOp, routineFor, readRoutines, DEFAULT_ROUTINES } from '../src/lib/personal';
import { parseCommand } from '../src/ai/commands';
import { sealBackup, openBackup, type BackupPayload } from '../src/lib/backup';
import { changePersonal, loadPersonal, changeNotes, loadNotes } from '../src/lib/server/personal';
import { saveSettings, setting } from '../src/lib/server/settings';
import { POST as backupRoute } from '../src/app/api/backup/route';
import { readWorlds, worldsOp, findWorld } from '../src/lib/worlds';

const one = (s: string) => parseCommand(s)[0];
const pageReq = (body: unknown) =>
  new Request('http://127.0.0.1:3000/api/backup', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin', 'x-divina-bridge': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never;

test('memory: add, no duplicates, forget by words, clear', () => {
  let m = memoryOp([], { op: 'add', text: 'My sister is called Amy' });
  assert.ok(m.ok);
  const items = m.ok ? m.value : [];
  m = memoryOp(items, { op: 'add', text: 'my sister is called amy' });
  assert.ok(m.ok && m.value.length === 1);
  m = memoryOp(items, { op: 'remove', match: 'sister' });
  assert.ok(m.ok && m.value.length === 0);
  assert.equal(memoryOp(items, { op: 'remove', match: 'dog' }).ok, false);
  assert.ok(memoryOp(items, { op: 'clear' }).ok);
});

test('spoken memory commands; "remember to" is still a to-do', () => {
  assert.deepEqual(one('Divina remember that my sister is called Amy'), { kind: 'memory', op: 'add', text: 'My sister is called Amy' });
  assert.deepEqual(one("remember I'm vegetarian"), { kind: 'memory', op: 'add', text: "I'm vegetarian" });
  assert.deepEqual(one('what do you remember about me'), { kind: 'memory', op: 'list', text: '' });
  assert.deepEqual(one('forget my sister'), { kind: 'memory', op: 'forget', text: 'my sister' });
  assert.deepEqual(one('forget everything'), { kind: 'memory', op: 'clear', text: '' });
  assert.deepEqual(one('remember to book the MOT'), { kind: 'note', op: 'add', text: 'Book the MOT' });
});

test('timers and reminders', () => {
  assert.deepEqual(one('set a timer for 10 minutes'), { kind: 'timer', op: 'start', minutes: 10, label: 'Timer' });
  assert.deepEqual(one('timer for five minutes'), { kind: 'timer', op: 'start', minutes: 5, label: 'Timer' });
  assert.deepEqual(one('set a 25 minute timer for focus'), { kind: 'timer', op: 'start', minutes: 25, label: 'Focus' });
  assert.deepEqual(one('set a timer for half an hour'), { kind: 'timer', op: 'start', minutes: 30, label: 'Timer' });
  assert.deepEqual(one('remind me in 20 minutes to check the oven'), { kind: 'timer', op: 'start', minutes: 20, label: 'Check the oven' });
  assert.deepEqual(one('remind me to call mum in an hour'), { kind: 'timer', op: 'start', minutes: 60, label: 'Call mum' });
  assert.deepEqual(one('remind me to call mum'), { kind: 'note', op: 'add', text: 'Call mum' });
  assert.equal(one('cancel my timer').kind, 'timer');
  assert.deepEqual(one('how long is left on my timer'), { kind: 'timer', op: 'status', minutes: 0, label: '' });
});

test('routines: defaults, checked steps, start by name', () => {
  assert.equal(readRoutines(undefined).length, DEFAULT_ROUTINES.length, 'new installs get Good morning / Good night');
  assert.equal(readRoutines([]).length, 0, 'deleting them all sticks');
  const r = routinesOp([], { op: 'save', routine: { name: 'Work Mode', steps: [{ type: 'open', module: 'projects' }, { type: 'timer', minutes: 25, label: 'Focus' }, { type: 'shell', cmd: 'rm -rf /' }, { type: 'volume', level: 400 }], time: '09:00', days: 'weekdays' } });
  assert.ok(r.ok);
  const list = r.ok ? r.value : [];
  assert.equal(list[0].name, 'work mode');
  assert.deepEqual(list[0].steps.map((s) => s.type), ['open', 'timer'], 'unknown and out-of-range steps are dropped');
  assert.equal(routineFor(list, 'work mode')?.name, 'work mode');
  assert.equal(routineFor(list, 'start my work mode routine')?.name, 'work mode');
  assert.equal(routineFor(list, 'work'), null);
  assert.equal(routinesOp([], { op: 'save', routine: { name: 'x', steps: [] } }).ok, false);
});

test('custom worlds: colours and planets are checked; presets by name', () => {
  const r = worldsOp([], { op: 'save', world: { name: 'My Mars', sky: 'red; background:url(x)', glow: '#ff9a6a', planet: { type: 'gas', size: 99, moons: 7, rings: 'yes' } } });
  assert.ok(r.ok);
  const w = r.ok ? r.value[0] : null;
  assert.equal(w?.sky, '#05070d', 'a bad colour falls back');
  assert.equal(w?.planet.size, 2);
  assert.equal(w?.planet.moons, 3);
  assert.equal(w?.planet.rings, false);
  assert.equal(readWorlds([{ name: '<b>' }]).length, 0);
  assert.equal(findWorld([], 'mars')?.name, 'Mars');
});

test('backup: sealed with the passphrase; wrong passphrase or a changed file fails', async () => {
  const payload = { format: 'divina-backup', v: 1, created: new Date().toISOString(), edition: 'app', settings: { GEMINI_API_KEY: 'AIza' + 'TESTONLY0123456789abcdefghijklmnop' }, hasKeys: true, notes: [], agents: [], memory: [], routines: [], worlds: [], prefs: {} } as BackupPayload;
  const file = await sealBackup(payload, 'correct horse battery');
  assert.ok(!file.includes('TESTONLY'));
  assert.equal((await openBackup(file, 'correct horse battery')).settings.GEMINI_API_KEY, payload.settings.GEMINI_API_KEY);
  await assert.rejects(openBackup(file, 'wrong passphrase'), /Wrong passphrase/);
  const j = JSON.parse(file);
  j.data = j.data.slice(0, -8) + 'AAAAAAA=';
  await assert.rejects(openBackup(JSON.stringify(j), 'correct horse battery'), /Wrong passphrase|changed/);
  j.kdf.iterations = 1;
  await assert.rejects(openBackup(JSON.stringify(j), 'correct horse battery'), /doesn’t accept/);
  await assert.rejects(sealBackup(payload, 'short'), /at least 8/);
});

test('app: back up, wipe, restore — everything comes back, keys only when asked', async () => {
  saveSettings({ GEMINI_API_KEY: 'AIza' + 'TESTONLY0123456789abcdefghijklmnop', DIVINA_CITY: 'Leeds' });
  changeNotes({ op: 'add', text: 'Buy milk' });
  changePersonal('memory', { op: 'add', text: 'I am vegetarian' });
  const noKeys = (await (await backupRoute(pageReq({ op: 'export', passphrase: 'correct horse battery', includeKeys: false, prefs: { captionSize: 'large', agent: 'x' } }))).json()) as { file: string };
  const withKeys = (await (await backupRoute(pageReq({ op: 'export', passphrase: 'correct horse battery', includeKeys: true }))).json()) as { file: string };
  assert.ok(!(await openBackup(noKeys.file, 'correct horse battery')).settings.GEMINI_API_KEY);
  assert.deepEqual((await openBackup(noKeys.file, 'correct horse battery')).prefs, { captionSize: 'large' }, 'only display prefs travel');
  // wipe
  writeFileSync(join(dir, 'notes.local.json'), '');
  changePersonal('memory', { op: 'clear' });
  saveSettings({ GEMINI_API_KEY: '', DIVINA_CITY: '' });
  const r = (await (await backupRoute(pageReq({ op: 'import', file: withKeys.file, passphrase: 'correct horse battery' }))).json()) as { ok: boolean; message: string };
  assert.ok(r.ok, r.message);
  assert.equal(loadNotes()[0]?.text, 'Buy milk');
  assert.equal((loadPersonal('memory')[0] as { text: string }).text, 'I am vegetarian');
  assert.equal(setting('DIVINA_CITY'), 'Leeds');
  assert.equal(setting('GEMINI_API_KEY'), 'AIza' + 'TESTONLY0123456789abcdefghijklmnop');
  const bad = (await (await backupRoute(pageReq({ op: 'import', file: withKeys.file, passphrase: 'nope nope nope' }))).json()) as { ok: boolean };
  assert.equal(bad.ok, false);
  assert.ok(!readFileSync(join(dir, 'settings.local.json'), 'utf8').includes('TESTONLY'), 'restored keys are sealed again on disk');
});

test('app: a big backup (lots of notes) restores', async () => {
  for (let i = 0; i < 120; i++) changeNotes({ op: 'add', text: `Note number ${i} with a little more text to make the backup bigger than a small request` });
  const big = (await (await backupRoute(pageReq({ op: 'export', passphrase: 'correct horse battery', includeKeys: false }))).json()) as { file: string };
  assert.ok(big.file.length > 20_000, 'the backup is bigger than a normal request');
  const r = (await (await backupRoute(pageReq({ op: 'import', file: big.file, passphrase: 'correct horse battery' }))).json()) as { ok: boolean; message: string };
  assert.ok(r.ok, r.message);
});

test('a doctored backup can’t point the saved email password at another server', async () => {
  saveSettings({ DIVINA_EMAIL_ADDRESS: 'me@example.com', DIVINA_EMAIL_PASSWORD: 'abcd efgh ijkl mnop', DIVINA_EMAIL_HOST: '' });
  const evil = (host: string, hasKeys: boolean, settings: Record<string, string>) =>
    sealBackup({ format: 'divina-backup', v: 1, created: new Date().toISOString(), edition: 'app', settings: { DIVINA_EMAIL_HOST: host, ...settings }, hasKeys, notes: [], agents: [], memory: [], routines: [], worlds: [], prefs: {} }, 'correct horse battery');
  for (const file of [await evil('imap.evil.example', false, {}), await evil('imap.evil.example', true, {})]) {
    const r = (await (await backupRoute(pageReq({ op: 'import', file, passphrase: 'correct horse battery' }))).json()) as { ok: boolean };
    assert.ok(r.ok);
    assert.notEqual(setting('DIVINA_EMAIL_HOST'), 'imap.evil.example');
  }
  // with its own password, the server comes too (and the saved password is replaced, not sent)
  await backupRoute(pageReq({ op: 'import', file: await evil('imap.mine.example', true, { DIVINA_EMAIL_PASSWORD: 'wxyz wxyz wxyz wxyz' }), passphrase: 'correct horse battery' }));
  assert.equal(setting('DIVINA_EMAIL_HOST'), 'imap.mine.example');
  assert.equal(setting('DIVINA_EMAIL_PASSWORD'), 'wxyz wxyz wxyz wxyz');
});

test('backup route refuses other websites', async () => {
  const req = new Request('http://127.0.0.1:3000/api/backup', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"op":"export","passphrase":"correct horse battery","includeKeys":true}' });
  assert.equal((await backupRoute(req as never)).status, 403);
});

test('worlds by name, with or without "world"', () => {
  assert.equal(findWorld([], 'lava world')?.name, 'Lava world');
  assert.equal(findWorld([], 'my saturn world')?.name, 'Saturn');
  assert.equal(findWorld([], 'the ice moon')?.name, 'Ice moon');
  assert.equal(findWorld([], 'pluto'), null);
});
