import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIVINA_DATA_DIR = mkdtempSync(join(tmpdir(), 'divina-phone-'));

import { saveSettings, publicSettings } from '../src/lib/server/settings';
import { callMe, callScript, cleanCallText, phoneConfigured, MAX_CALL_TEXT } from '../src/lib/server/phone';
import { routinesOp } from '../src/lib/personal';

// built at runtime so the made-up value doesn't look like a real Twilio ID to secret scanners
const SID = 'AC' + '0123456789abcdef'.repeat(2);
const TOKEN = 'TESTONLYtoken0123456789abcdefABC';
const FROM = '+447700900000';
const ME = '+447700900123';

test('phone settings only accept real-looking values', () => {
  assert.equal(saveSettings({ TWILIO_ACCOUNT_SID: 'SK' + '0123456789abcdef0123456789abcdef' }).ok, false);
  assert.equal(saveSettings({ TWILIO_AUTH_TOKEN: 'short' }).ok, false);
  assert.equal(saveSettings({ DIVINA_CALL_ME: '07700 900123' }).ok, false);
  assert.equal(saveSettings({ DIVINA_CALL_ME: '+44770090012&To=+1555' }).ok, false);
  assert.equal(saveSettings({ TWILIO_FROM: 'tel:+447700900000' }).ok, false);
});

test('without every detail saved, nothing is called', async () => {
  let called = false;
  globalThis.fetch = (async () => ((called = true), new Response('{}'))) as typeof fetch;
  assert.equal(phoneConfigured(), false);
  const r = await callMe('hello');
  assert.equal(r.ok, false);
  assert.equal(called, false);
});

test('a call goes to your own number only, with the message escaped', async () => {
  assert.equal(saveSettings({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: FROM, DIVINA_CALL_ME: ME }).ok, true);
  assert.equal(phoneConfigured(), true);
  // the token and your number are secrets: they never come back to the page
  const pub = publicSettings();
  assert.equal(pub.TWILIO_AUTH_TOKEN.value, undefined);
  assert.equal(pub.DIVINA_CALL_ME.value, undefined);
  let seen: { url: string; body: URLSearchParams; auth: string } | null = null;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    seen = { url: String(url), body: new URLSearchParams(String(init?.body)), auth: String((init?.headers as Record<string, string>).authorization) };
    return new Response('{"sid":"CA1"}', { status: 201 });
  }) as typeof fetch;
  const r = await callMe('Meeting <now> & "soon"');
  assert.equal(r.ok, true);
  assert.ok(seen);
  const s = seen as { url: string; body: URLSearchParams; auth: string };
  assert.equal(s.url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`);
  assert.equal(s.body.get('To'), ME);
  assert.equal(s.body.get('From'), FROM);
  assert.equal(s.auth, `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`);
  const twiml = s.body.get('Twiml')!;
  assert.ok(twiml.includes('Meeting &lt;now&gt; &amp; &quot;soon&quot;'));
  assert.ok(!twiml.includes('<now>'));
});

test('a Twilio error comes back readable, without the token in it', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: `Authenticate failed for ${TOKEN}` }), { status: 401 })) as typeof fetch;
  const r = await callMe('hello');
  assert.equal(r.ok, false);
  assert.ok(!('message' in r) || !r.message.includes(TOKEN));
});

test('call text is cleaned and kept short', () => {
  assert.equal(cleanCallText('  hi\u0000 there\u202e  '), 'hi there');
  assert.equal(cleanCallText('x'.repeat(5000)).length, MAX_CALL_TEXT);
  assert.equal(cleanCallText(42), '');
  assert.ok(callScript('a').startsWith('<Response>'));
});

test('routines keep a "phone me" step, with or without text', () => {
  const r = routinesOp([], { op: 'save', routine: { name: 'wake up', steps: [{ type: 'brief', module: 'weather' }, { type: 'call', text: '' }, { type: 'call', text: 'Up you get', to: '+15550000000' }] } });
  assert.ok(r.ok);
  const steps = r.ok ? r.value[0].steps : [];
  assert.deepEqual(steps[1], { type: 'call', text: '' });
  // there is no "to" on a step: a routine can't choose who gets rung
  assert.deepEqual(steps[2], { type: 'call', text: 'Up you get' });
});
