import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-vault-'));
const dir = process.env.DIVINA_DATA_DIR;

import { seal, unseal, isSealed, _forgetKey } from '../src/lib/server/vault';
import { saveSettings, setting, publicSettings } from '../src/lib/server/settings';

const KEY = 'sk-ant-' + 'api03-TESTONLY_abcdefghijklmnopqrstuvwxyz0123456789';

test('a sealed secret opens again, and only under its own name', () => {
  const s = seal('ANTHROPIC_API_KEY', KEY);
  assert.ok(isSealed(s));
  assert.ok(!s.includes(KEY));
  assert.equal(unseal('ANTHROPIC_API_KEY', s), KEY);
  assert.equal(unseal('OPENAI_API_KEY', s), undefined, 'moved to another setting');
  assert.notEqual(seal('ANTHROPIC_API_KEY', KEY), s, 'a fresh IV every time');
});

test('any change to a sealed value is detected, not decrypted', () => {
  const s = seal('GEMINI_API_KEY', 'AIza' + 'TESTKEYtestkey0123456789abcdefghijk');
  const raw = Buffer.from(s.slice(7), 'base64');
  raw[raw.length - 1] ^= 1;
  assert.equal(unseal('GEMINI_API_KEY', 'enc:v1:' + raw.toString('base64')), undefined);
  assert.equal(unseal('GEMINI_API_KEY', 'enc:v1:AAAA'), undefined);
});

test('keys are never written to disk in the clear', () => {
  assert.equal(saveSettings({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: 'claude-opus-5-5', DIVINA_AI_PROVIDER: 'claude' }).ok, true);
  const text = readFileSync(join(dir, 'settings.local.json'), 'utf8');
  assert.ok(!text.includes(KEY));
  assert.ok(!text.includes('TESTONLY'));
  const f = JSON.parse(text);
  assert.ok(isSealed(f.ANTHROPIC_API_KEY));
  assert.equal(f.ANTHROPIC_MODEL, 'claude-opus-5-5', 'plain settings stay readable');
  assert.equal(setting('ANTHROPIC_API_KEY'), KEY);
  assert.equal(publicSettings().ANTHROPIC_API_KEY.hint, '…6789');
  // the key file holds no raw key on Windows (DPAPI); elsewhere it is 0600
  const vault = readFileSync(join(dir, 'vault.key'), 'utf8');
  assert.match(vault, /^(dpapi|file):/);
});

test('a key saved in the clear by an older version is sealed on first read', () => {
  const f = join(dir, 'settings.local.json');
  const old = JSON.parse(readFileSync(f, 'utf8'));
  old.OPENAI_API_KEY = 'sk-proj-' + 'TESTONLY_0123456789abcdefghijklmnopqrstuvwxyzABCD';
  writeFileSync(f, JSON.stringify(old));
  _forgetKey();
  assert.equal(setting('OPENAI_API_KEY'), old.OPENAI_API_KEY);
  const after = readFileSync(f, 'utf8');
  assert.ok(!after.includes('TESTONLY_0123'));
  assert.ok(isSealed(JSON.parse(after).OPENAI_API_KEY));
  assert.equal(setting('ANTHROPIC_API_KEY'), KEY, 'other secrets survive');
});

test('secrets from another PC (unreadable key) count as not set, never as garbage', () => {
  const f = join(dir, 'settings.local.json');
  const cur = JSON.parse(readFileSync(f, 'utf8'));
  writeFileSync(join(dir, 'vault.key'), 'file:' + Buffer.alloc(32, 7).toString('base64'));
  _forgetKey();
  writeFileSync(f, JSON.stringify({ ...cur, DIVINA_CITY: 'Leeds' }));
  assert.equal(setting('ANTHROPIC_API_KEY'), undefined);
  assert.equal(setting('DIVINA_CITY'), 'Leeds');
});
