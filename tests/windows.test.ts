import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, type BridgeDeps } from '../src/lib/server/desktop/verbs';
import { encodePs, PS, winBoundsOn } from '../src/lib/server/desktop/windows';
import { spokenDisplay, type Display } from '../src/lib/server/desktop/displays';
import { translateWinError } from '../src/lib/server/desktop/permissions';

const APPS = [
  { name: 'Spotify', path: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' },
  { name: 'Google Chrome', path: 'Chrome' },
  { name: 'Visual Studio Code', path: 'Microsoft.VisualStudioCode' },
  { name: 'Notepad', path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Notepad.lnk' },
];

interface Call {
  kind: 'run' | 'launch';
  file: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  script?: string;
}

const decode = (args: readonly string[]) => {
  const i = args.indexOf('-EncodedCommand');
  return i >= 0 ? Buffer.from(args[i + 1], 'base64').toString('utf16le') : undefined;
};

function spy(responses: Record<string, string> = {}) {
  const calls: Call[] = [];
  const deps: BridgeDeps = {
    platform: 'win32',
    run: async (file, args, opts) => {
      const script = decode(args);
      calls.push({ kind: 'run', file, args, env: opts?.env, script });
      const key = Object.keys(responses).find((k) => script?.includes(k));
      return { stdout: key ? responses[key] : '', stderr: '' };
    },
    launch: (file, args) => void calls.push({ kind: 'launch', file, args }),
    scanApps: async () => APPS,
    exists: (p) => p === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    env: { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' } as unknown as NodeJS.ProcessEnv,
    sleep: async () => {},
  };
  return { deps, calls };
}

test('windows: injected strings resolve to "no such application" and nothing runs', async () => {
  for (const name of ['Spotify & del /s /q C:\\', 'notepad | powershell -c iex', '$(Remove-Item ~ -Recurse)', '"; Stop-Computer; "', 'calc`n shutdown /s', '..\\..\\Windows\\System32\\cmd.exe']) {
    const { deps, calls } = spy();
    const r = await dispatch('launch_app', { name }, deps);
    assert.equal(r.status, 404, name);
    assert.equal(calls.length, 0, name);
  }
});

test('windows: apps launch through explorer with the scanned id as ONE argument', async () => {
  const { deps, calls } = spy();
  assert.equal((await dispatch('launch_app', { name: 'spotify' }, deps)).ok, true);
  assert.deepEqual(calls[0], { kind: 'launch', file: 'explorer.exe', args: ['shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'] });
  const lnk = spy();
  await dispatch('launch_app', { name: 'notepad' }, lnk.deps);
  assert.deepEqual(lnk.calls[0].args, ['C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Notepad.lnk']);
});

test('windows: PowerShell scripts are constants; caller data travels only in DIVINA_* env', async () => {
  const { deps, calls } = spy();
  const evil = "'; Remove-Item -Recurse C:\\ ; '";
  await dispatch('clipboard_write', { text: evil }, deps);
  const c = calls[0];
  assert.equal(c.file, 'powershell.exe');
  assert.ok(c.args.includes('-EncodedCommand'));
  assert.ok(!c.args.some((a) => a.includes('Remove-Item')), 'data never on the command line');
  assert.ok(!c.script!.includes('Remove-Item'), 'data never in the script');
  assert.equal(c.env!.DIVINA_TEXT, evil);
  assert.ok(c.script!.endsWith(PS.clipWrite));
});

test('windows: open_url starts the browser directly with argv and diffs windows to place it', async () => {
  const displays = JSON.stringify([
    { name: 'Built-in', main: true, builtIn: true, frame: { x: 0, y: 0, w: 1920, h: 1080 }, visible: { x: 0, y: 0, w: 1920, h: 1040 } },
    { name: 'LG ULTRAWIDE', main: false, builtIn: false, frame: { x: 1920, y: 0, w: 3440, h: 1440 }, visible: { x: 1920, y: 0, w: 3440, h: 1400 } },
  ]);
  const { deps, calls } = spy({ WmiMonitorID: displays, 'Windows($env:DIVINA_PROC)) |': '[111,222]', DIVINA_BEFORE: '333' });
  const r = await dispatch('open_url', { url: 'example.com/a b"c' }, deps);
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /new Chrome window on your LG ULTRAWIDE/);
  const launch = calls.find((c) => c.kind === 'launch')!;
  assert.equal(launch.file, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.deepEqual(launch.args, ['--new-window', 'https://example.com/a%20b%22c']);
  const place = calls.find((c) => c.script?.includes('DIVINA_BEFORE'))!;
  assert.equal(place.env!.DIVINA_BEFORE, '111,222');
  assert.equal(place.env!.DIVINA_X, String(1920 + Math.round(3440 * 0.06)));
});

test('windows: quit resolves against running windows and closes gracefully', async () => {
  const running = JSON.stringify([
    { pid: 4242, name: 'Spotify', desc: 'Spotify', title: 'Spotify Premium' },
    { pid: 17, name: 'explorer', desc: 'Windows Explorer', title: 'Downloads' },
  ]);
  const { deps, calls } = spy({ MainWindowHandle: running, CloseMainWindow: 'ok' });
  const r = await dispatch('quit_app', { name: 'spotify' }, deps);
  assert.equal(r.ok, true, r.message);
  const q = calls.find((c) => c.script?.includes('CloseMainWindow'))!;
  assert.equal(q.env!.DIVINA_PID, '4242');
  assert.ok(!q.script!.includes('Stop-Process'), 'never kill');
  const nope = spy({ MainWindowHandle: running });
  assert.equal((await dispatch('quit_app', { name: 'photoshop' }, nope.deps)).status, 404);
  assert.equal((await dispatch('quit_app', { name: 'windows explorer' }, spy({ MainWindowHandle: running }).deps)).status, 422);
});

test('windows: refusals explain what to do instead', async () => {
  const { deps, calls } = spy();
  for (const v of ['dnd', 'create_note', 'create_reminder'] as const) {
    const r = await dispatch(v, v === 'dnd' ? { on: true } : { title: 'x', body: 'y' }, deps);
    assert.equal(r.status, 501);
    assert.ok(r.message.length > 30);
  }
  assert.equal(calls.length, 0);
});

test('windows: coordinates, display names, error translation', () => {
  const d: Display = { name: '\\\\.\\DISPLAY2', main: false, builtIn: false, frame: { x: -1920, y: 0, w: 1920, h: 1080 }, visible: { x: -1920, y: 0, w: 1920, h: 1040 } };
  assert.deepEqual(winBoundsOn(d), [-1920 + 115, 52, 1920 - 230, 1040 - 104]);
  assert.equal(spokenDisplay(d), 'on display 2');
  assert.match(translateWinError('Cannot add type. Definition of new types is not supported in this language mode.', { verb: 'media' }).message, /Constrained Language Mode/);
  assert.match(translateWinError('Access is denied', { verb: 'quit_app', app: 'Task Manager' }, { WT_SESSION: 'x' } as unknown as NodeJS.ProcessEnv).message, /Windows Terminal as administrator/);
  // -EncodedCommand is UTF-16LE base64 of the constant script
  assert.ok(Buffer.from(encodePs('x'), 'base64').toString('utf16le').endsWith('x'));
});

test('windows: "play X on Spotify" opens the Spotify app on its search, as one argument', async () => {
  const { deps, calls } = spy();
  const r = await dispatch('play_search', { service: 'spotify', query: 'drake & del C:\\ "x"' }, deps);
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0], { kind: 'launch', file: 'explorer.exe', args: [`spotify:search:${encodeURIComponent('drake & del C:\\ "x"')}`] });
});

test('windows: other services (or no Spotify app) open the website search in the browser', async () => {
  const { deps, calls } = spy();
  const r = await dispatch('play_search', { service: 'apple_music', query: 'jazz' }, deps);
  assert.equal(r.ok, true, r.message);
  const chrome = calls.find((c) => c.kind === 'launch');
  assert.equal(chrome?.file, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.deepEqual(chrome?.args, ['--new-window', 'https://music.apple.com/search?term=jazz']);
  const noApp = spy();
  noApp.deps.scanApps = async () => [];
  await dispatch('play_search', { service: 'spotify', query: 'jazz' }, noApp.deps);
  assert.deepEqual(noApp.calls.find((c) => c.kind === 'launch')?.args, ['--new-window', 'https://open.spotify.com/search/jazz']);
});
