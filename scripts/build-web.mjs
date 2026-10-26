// Build the free browser edition: a static site with no server.
//
//   npm run build:web
//     → out/: the browser edition, served from /app (DIVINA_BASE_PATH changes it;
//       set it to '' to serve from the root of your own site)
//     → dist/divina-web-<version>.zip: out/ packed, with an `_headers` file
//       (security headers and CSP, in the format Cloudflare Pages and similar
//       static hosts read) and the licence. The GitHub release attaches it.
//
// No server: the page answers its own /api calls (src/web/backend.ts), keeps
// settings and the visitor's own Gemini key in their browser, and talks to
// MET Norway, OpenStreetMap, Hacker News and Gemini directly.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csp, SECURITY_HEADERS } from '../csp.mjs';
import { assertNoSecrets, scrubBuildPaths } from './secret-scan.mjs';
import { writeLicenses } from './licenses.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'out');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const zip = join(dist, `divina-web-${version}.zip`);
const BASE = process.env.DIVINA_BASE_PATH ?? '/app';
// where the browser edition's "Download Divina for Windows" links go
const SITE = process.env.DIVINA_SITE ?? 'https://divinaos.site/#download';
const say = (m) => console.log(`\n▸ ${m}`);

say('Building the browser edition…');
rmSync(out, { recursive: true, force: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(npx, ['next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DIVINA_EDITION: 'web', DIVINA_BASE_PATH: BASE, DIVINA_SITE: SITE, NEXT_TELEMETRY_DISABLED: '1' },
  shell: process.platform === 'win32',
});
if (r.status !== 0) throw new Error('next build failed');
if (!existsSync(join(out, 'index.html'))) throw new Error('static export missing index.html');

// Chrome, Edge and Safari load the SIMD, non-module MediaPipe build; the other two only add size
for (const f of ['vision_wasm_module_internal', 'vision_wasm_nosimd_internal']) {
  for (const ext of ['.js', '.wasm']) rmSync(join(out, 'mediapipe', 'wasm', f + ext), { force: true });
}

// Allow exactly the inline scripts Next.js wrote, by hash, instead of any inline script.
const scriptHashes = new Set();
for (const f of readdirSync(out).filter((n) => n.endsWith('.html'))) {
  const html = readFileSync(join(out, f), 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1]) scriptHashes.add(`sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}`);
  }
}
writeLicenses(join(out, 'licenses.txt'));

// Every Divina code file says whose it is (the MediaPipe runtime is Google's and stays untouched).
const NOTICE = `/*! Divina © 2026 Sweeney Creative. Free software under the GNU AGPL-3.0: ${BASE}/LICENSE.txt. Source: https://github.com/divinadevosai/divina. Includes open-source components under their own licences: ${BASE}/licenses.txt */\n`;
const stamp = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) stamp(p);
    else if (e.name.endsWith('.js')) writeFileSync(p, NOTICE + readFileSync(p, 'utf8'));
  }
};
stamp(join(out, '_next'));

cpSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'));
cpSync(join(root, 'EULA.txt'), join(out, 'eula.txt'));
// the privacy, cookie and terms pages (the website serves them at its root)
cpSync(join(root, 'legal'), join(out, 'legal'), { recursive: true });

// Security headers for static hosts that read an `_headers` file. A host that
// doesn't can copy them from here into its own settings.
const block = (paths, headers) => paths.flatMap((p) => [p, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)]);
writeFileSync(
  join(out, '_headers'),
  [
    ...block([`${BASE}/*`], {
      ...SECURITY_HEADERS,
      // send only the site's address to the services it calls (OpenStreetMap asks apps to identify themselves)
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': csp({ web: true, scriptHashes: [...scriptHashes] }),
    }),
    '',
    // the hand-tracking engine and model are big and never change between releases
    ...block([`${BASE}/mediapipe/*`, `${BASE}/models/*`], { 'Cache-Control': 'public, max-age=604800' }),
    '',
  ].join('\n'),
);

say('Checking for secrets…');
scrubBuildPaths(out, root);
assertNoSecrets(out, root);

say('Packing…');
mkdirSync(dist, { recursive: true });
rmSync(zip, { force: true });
const z = spawnSync('zip', ['-q', '-r', '-9', zip, '.'], { cwd: out, stdio: 'inherit' });
if (z.status !== 0) throw new Error('zip failed');
say(`Done: ${relative(root, zip)} (${(statSync(zip).size / 1048576).toFixed(1)} MB) — the browser edition, served from ${BASE || '/'}`);
