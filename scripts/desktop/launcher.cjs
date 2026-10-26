// Divina for Windows and Mac: starts the local server and opens Divina in its own window.
//
// Windows: the installer puts this next to a private copy of Node.js:
//   <install>\node\node.exe
//   <install>\app\server.js          (Next.js standalone build)
//   <install>\launcher.cjs           (this file)
// Divina.exe runs `node\node.exe launcher.cjs` with no console window.
// Mac: Divina.app/Contents/Resources holds the same three things, and
// Contents/MacOS/Divina runs `node/node launcher.cjs`.
//
// What it does:
//   - if Divina is already running, it just opens another window
//   - otherwise starts the server on 127.0.0.1 only (never the network)
//   - opens Edge or Chrome (Mac: also Brave or Chromium) as an app window
//     with its own profile, so camera and microphone permissions are
//     remembered; without one, the default browser
//   - when that window closes, stops the server
// Anything it prints on failure is shown to the person in a message box
// (Windows: by Divina.exe; Mac: by this file, with a system alert).
// `launcher.cjs --stop` stops a running Divina (used by the installer).
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const os = require('node:os');
const MAC = process.platform === 'darwin';
const ROOT = __dirname;
const APP = path.join(ROOT, 'app');
const DATA =
  process.env.DIVINA_DATA_DIR ||
  (MAC ? path.join(os.homedir(), 'Library', 'Application Support', 'Divina') : path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'Divina'));
const PIDS = path.join(DATA, 'running.json');
const LOG = path.join(DATA, 'divina.log');
const PORTS = [47800, 47801, 47802, 47803, 47804, 47805];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
  // Divina.exe shows whatever is on stdout in a message box when we exit non-zero.
  process.stdout.write(message);
  if (MAC && !process.env.DIVINA_NO_ALERT) {
    // the message goes in as an argument, so nothing in it is read as AppleScript
    require('node:child_process').spawnSync('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'display alert "Divina" message (item 1 of argv) as warning', '-e', 'end run', message], { stdio: 'ignore' });
  }
  process.exit(1);
}

/** 'divina' if Divina answers on this port, 'other' if something else does, 'free' if nothing. */
async function probe(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ai`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json().catch(() => null);
    return j && typeof j === 'object' && 'studioVoice' in j ? 'divina' : 'other';
  } catch (e) {
    return e && e.name === 'TimeoutError' ? 'other' : 'free';
  }
}

function readPids() {
  try {
    return JSON.parse(fs.readFileSync(PIDS, 'utf8'));
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stop() {
  const p = readPids();
  // After a crash or power cut this file is stale and Windows may have given
  // those process numbers to other programs: only stop them if Divina is
  // really still answering on the recorded port.
  if (p && p.port && (await probe(p.port)) === 'divina') {
    for (const pid of [p.server, p.launcher]) {
      if (pid && pid !== process.pid && alive(pid)) {
        try {
          process.kill(pid);
        } catch {
          /* already gone */
        }
      }
    }
  }
  try {
    fs.rmSync(PIDS, { force: true });
  } catch {
    /* fine */
  }
}

function findBrowser() {
  if (process.env.DIVINA_BROWSER) return process.env.DIVINA_BROWSER; // for testing
  if (MAC) {
    const apps = [
      ['Google Chrome', 'Google Chrome'],
      ['Microsoft Edge', 'Microsoft Edge'],
      ['Brave Browser', 'Brave Browser'],
      ['Chromium', 'Chromium'],
    ];
    const places = ['/Applications', path.join(os.homedir(), 'Applications')];
    for (const [bundle, exe] of apps) for (const dir of places) {
      const p = path.join(dir, `${bundle}.app`, 'Contents', 'MacOS', exe);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [];
  for (const base of pf) candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  for (const base of pf) candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  return candidates.find((c) => fs.existsSync(c)) || null;
}

/** Opens Divina. Resolves when the window is closed (or at once if it can't tell). */
function openWindow(url) {
  const browser = findBrowser();
  if (!browser) {
    // no Chromium browser: the default one (Safari on most Macs)
    spawn(MAC ? '/usr/bin/open' : 'explorer.exe', [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return null;
  }
  const args = [
    `--app=${url}`,
    `--user-data-dir=${path.join(DATA, 'window')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    '--autoplay-policy=no-user-gesture-required',
  ];
  const child = spawn(browser, args, { stdio: 'ignore', windowsHide: false });
  const started = Date.now();
  return new Promise((resolve) => {
    child.on('error', () => resolve({ quick: true }));
    // A browser that hands off to an already-open window exits straight away.
    child.on('exit', () => resolve({ quick: Date.now() - started < 5000 }));
  });
}

function tail(file, lines = 12) {
  try {
    return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  if (process.argv.includes('--stop')) return await stop();

  // Already running? Just open a window.
  const running = readPids();
  if (running && running.port && (await probe(running.port)) === 'divina') {
    await openWindow(`http://127.0.0.1:${running.port}`);
    return;
  }

  let port = 0;
  for (const p of PORTS) {
    const state = await probe(p);
    if (state === 'divina') {
      await openWindow(`http://127.0.0.1:${p}`);
      return;
    }
    if (state === 'free') {
      port = p;
      break;
    }
  }
  if (!port) fail(`Divina couldn’t find a free port (tried ${PORTS[0]}–${PORTS[PORTS.length - 1]}). Restart your computer and try again.`);

  const server = path.join(APP, 'server.js');
  if (!fs.existsSync(server)) fail(MAC ? 'Divina’s files are missing. Please download Divina again and drag it to Applications.' : 'Divina’s files are missing. Please reinstall Divina.');

  const log = fs.openSync(LOG, 'w');
  const child = spawn(process.execPath, [server], {
    cwd: APP,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1', // this computer only
      DIVINA_DATA_DIR: DATA,
      DIVINA_DESKTOP_BRIDGE: process.env.DIVINA_DESKTOP_BRIDGE ?? '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  let exited = false;
  child.on('exit', () => (exited = true));
  fs.writeFileSync(PIDS, JSON.stringify({ port, server: child.pid, launcher: process.pid }));
  const quit = () => {
    if (!exited) child.kill();
    try {
      fs.rmSync(PIDS, { force: true });
    } catch {
      /* fine */
    }
  };
  process.on('SIGTERM', () => (quit(), process.exit(0)));
  process.on('SIGINT', () => (quit(), process.exit(0)));

  // Wait for it to answer.
  const deadline = Date.now() + 60_000;
  while ((await probe(port)) !== 'divina') {
    if (exited) {
      quit();
      fail(`Divina stopped while starting.\n\n${tail(LOG)}\n\nFull log: ${LOG}`);
    }
    if (Date.now() > deadline) {
      quit();
      fail(`Divina took too long to start.\n\nFull log: ${LOG}`);
    }
    await sleep(250);
  }

  const closed = await openWindow(`http://127.0.0.1:${port}`);
  if (closed && !closed.quick) {
    quit();
    return;
  }
  // No window we can watch (no Edge/Chrome, or it joined an open window):
  // keep serving until the server stops or Divina is stopped from the
  // installer (Windows) or quit from the Dock (Mac).
  await new Promise((r) => child.on('exit', r));
  quit();
}

main().catch((e) => fail(`Divina couldn’t start: ${e && e.message ? e.message : e}`));
