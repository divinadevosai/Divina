// Start Divina the fast way (production mode) and open it in the browser.
// Double-click Divina.cmd on Windows, or run `npm run launch` anywhere.
//   - installs dependencies on the very first run
//   - rebuilds only when source files changed since the last build
//   - if Divina is already running, just opens it
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 3000);
const URL_ = `http://localhost:${PORT}`;
// Checks go to the IPv4 loopback the server is bound to.
const LOCAL = `http://127.0.0.1:${PORT}`;
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const say = (m) => console.log(`\n  ${m}`);

function openBrowser() {
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [URL_]] : process.platform === 'darwin' ? ['open', [URL_]] : ['xdg-open', [URL_]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true, shell: false });
  child.on('error', () => say(`Open ${URL_} in Chrome or Edge.`));
  child.unref();
}

async function alreadyRunning() {
  try {
    const r = await fetch(`${LOCAL}/api/ai`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

function npmCli() {
  const bundled = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return existsSync(bundled) ? bundled : null;
}

if (await alreadyRunning()) {
  say('Divina is already running — opening it.');
  openBrowser();
  process.exit(0);
}

if (!existsSync(nextBin)) {
  const cli = npmCli();
  if (!cli) {
    say('First run: open a terminal in this folder and run  npm install  (or npm.cmd install on Windows), then try again.');
    process.exit(1);
  }
  say('First run: installing Divina’s parts. This takes a few minutes…');
  const r = spawnSync(process.execPath, [cli, 'install'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    say('The install didn’t finish. Copy the red text above and ask for help.');
    process.exit(1);
  }
}

const buildId = join(root, '.next', 'BUILD_ID');
const built = existsSync(buildId) ? statSync(buildId).mtimeMs : 0;
const changed = Math.max(newest(join(root, 'src')), ...['package.json', 'next.config.ts', 'tsconfig.json'].map((f) => statSync(join(root, f)).mtimeMs));
if (!built || changed > built) {
  say('Preparing Divina (only after an update — about a minute)…');
  const r = spawnSync(process.execPath, [nextBin, 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    say('The build failed. Copy the red text above and ask for help.');
    process.exit(1);
  }
}

say(`Starting Divina at ${URL_} — keep this window open while you use it. Close it to turn Divina off.`);
// -H 127.0.0.1: reachable from THIS computer only, never from the local network.
const server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: root, stdio: 'inherit' });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await alreadyRunning()) {
    openBrowser();
    break;
  }
}
server.on('exit', (code) => process.exit(code ?? 0));
