// Build the iPhone app's web content.
//
//   npm run build:ios
//     → build/ios-web/: the browser edition built for the iPhone app (no
//       Windows-only cards, iOS's own speech recogniser), plus the terms,
//       privacy page and licences, so they open without a connection
//     → copied into ios/ by Capacitor when the ios/ project exists
//
// The App Store build itself happens on a Mac (Codemagic in the cloud, see
// codemagic.yaml and docs/APP-STORE.md): Xcode turns ios/ into the app.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csp } from '../csp.mjs';
import { assertNoSecrets, scrubBuildPaths } from './secret-scan.mjs';
import { writeLicenses } from './licenses.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'out');
const web = join(root, 'build', 'ios-web');
const say = (m) => console.log(`\n▸ ${m}`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

say('Building Divina for iPhone…');
rmSync(out, { recursive: true, force: true });
const r = spawnSync(npx, ['next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DIVINA_EDITION: 'web', DIVINA_PLATFORM: 'ios', DIVINA_BASE_PATH: '', NEXT_TELEMETRY_DISABLED: '1' },
  shell: process.platform === 'win32',
});
if (r.status !== 0) throw new Error('next build failed');
if (!existsSync(join(out, 'index.html'))) throw new Error('static export missing index.html');

// Safari's engine loads the SIMD, non-module MediaPipe build; the other two only add size
for (const f of ['vision_wasm_module_internal', 'vision_wasm_nosimd_internal']) {
  for (const ext of ['.js', '.wasm']) rmSync(join(out, 'mediapipe', 'wasm', f + ext), { force: true });
}
writeLicenses(join(out, 'licenses.txt'));

const NOTICE = '/*! Divina © 2026 Sweeney Creative. Free software under the GNU AGPL-3.0. Source: https://github.com/divinadevosai/divina. Includes open-source components under their own licences: /licenses.txt */\n';
const stamp = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) stamp(p);
    else if (e.name.endsWith('.js')) writeFileSync(p, NOTICE + readFileSync(p, 'utf8'));
  }
};
stamp(join(out, '_next'));

say('Adding the terms, privacy page and licences…');
for (const f of ['terms.html', 'privacy.html', 'cookies.html', 'styles.css', 'favicon.svg']) {
  let text = readFileSync(join(root, 'legal', f), 'utf8');
  // in the app, Divina lives at the root and the licences sit beside it
  if (f.endsWith('.html')) text = text.replaceAll('href="/app/licenses.txt"', 'href="/licenses.txt"').replaceAll('href="/app/"', 'href="/"');
  writeFileSync(join(out, f), text);
}
mkdirSync(join(out, 'legal'), { recursive: true });
cpSync(join(root, 'EULA.txt'), join(out, 'legal', 'eula.txt'));

// No server sends headers inside an app: the policy travels in each page instead.
// (frame-ancestors only works as a header and nothing can frame an app's view anyway.)
const scriptHashes = new Set();
const pages = readdirSync(out).filter((n) => n.endsWith('.html') && !['terms.html', 'privacy.html', 'cookies.html'].includes(n));
for (const f of pages) {
  const html = readFileSync(join(out, f), 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1]) scriptHashes.add(`sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}`);
  }
}
const policy = csp({ web: true, scriptHashes: [...scriptHashes] })
  .split('; ')
  .filter((d) => !d.startsWith('frame-ancestors'))
  .join('; ');
const legal = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'";
for (const f of readdirSync(out).filter((n) => n.endsWith('.html'))) {
  const html = readFileSync(join(out, f), 'utf8');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${pages.includes(f) ? policy : legal}">`;
  writeFileSync(join(out, f), html.replace(/<head([^>]*)>/i, `<head$1>${meta}`));
}

say('Checking for secrets…');
rmSync(web, { recursive: true, force: true });
mkdirSync(dirname(web), { recursive: true });
cpSync(out, web, { recursive: true });
scrubBuildPaths(web, root);
assertNoSecrets(web, root);

if (existsSync(join(root, 'ios'))) {
  say('Copying into the Xcode project…');
  const s = spawnSync(npx, ['cap', 'sync', 'ios'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (s.status !== 0) throw new Error('cap sync failed');
}
say('Done: build/ios-web — the iPhone app is built from ios/ on a Mac (see docs/APP-STORE.md)');
