// Build Divina as a browser extension that replaces the new tab page.
//
//   npm run build:extension
//     → build/extension/: load it unpacked from chrome://extensions or edge://extensions
//     → dist/divina-extension-<version>.zip: upload to the Chrome Web Store and Edge Add-ons
//
// The same browser edition as the website, built with DIVINA_PLATFORM=extension, then made
// to fit the rules every Chromium extension store enforces:
//   - no inline scripts: Next.js's inline data scripts move into one file, in the same order
//   - no file or folder names starting with "_": _next becomes next, everywhere it's referenced
//   - the Content-Security-Policy lives in manifest.json, not in a header
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { csp } from '../csp.mjs';
import { assertNoSecrets, scrubBuildPaths } from './secret-scan.mjs';
import { writeLicenses } from './licenses.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'out');
const ext = join(root, 'build', 'extension');
const dist = join(root, 'dist');
const say = (m) => console.log(`\n▸ ${m}`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function walk(dir, fn) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

say('Building Divina for the new tab…');
rmSync(out, { recursive: true, force: true });
const r = spawnSync(npx, ['next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DIVINA_EDITION: 'web', DIVINA_PLATFORM: 'extension', DIVINA_BASE_PATH: '', NEXT_TELEMETRY_DISABLED: '1' },
  shell: process.platform === 'win32',
});
if (r.status !== 0) throw new Error('next build failed');
if (!existsSync(join(out, 'index.html'))) throw new Error('static export missing index.html');

// Chrome and Edge load the SIMD, non-module MediaPipe build; the other two only add size
for (const f of ['vision_wasm_module_internal', 'vision_wasm_nosimd_internal']) {
  for (const ext of ['.js', '.wasm']) rmSync(join(out, 'mediapipe', 'wasm', f + ext), { force: true });
}
rmSync(join(out, 'index.txt'), { force: true }); // the RSC payload for client-side navigation; the new tab is one page
writeLicenses(join(out, 'licenses.txt'));

const NOTICE = '/*! Divina © 2026 Sweeney Creative. Free software under the GNU AGPL-3.0. Source: https://github.com/divinadevosai/divina. Includes open-source components under their own licences: /licenses.txt */\n';
walk(join(out, '_next'), (p) => {
  if (p.endsWith('.js')) writeFileSync(p, NOTICE + readFileSync(p, 'utf8'));
});

say('Fitting the extension rules…');
// Extensions may not contain names starting with "_". Every reference to /_next/ is a plain
// string (HTML attributes, CSS urls, webpack's public path), so rename the folder and the strings.
renameSync(join(out, '_next'), join(out, 'next'));
walk(out, (p) => {
  if (!/\.(html|js|css|json|txt)$/.test(p)) return;
  const text = readFileSync(p, 'utf8');
  if (text.includes('/_next/')) writeFileSync(p, text.replaceAll('/_next/', '/next/'));
});
for (const name of readdirSync(out)) if (name.startsWith('_')) throw new Error(`${name}: extensions can't contain names starting with "_"`);

// Inline scripts are never allowed in extension pages. Next.js's are small data pushes that
// must run in order, so they go into one external script where the first one stood.
for (const f of readdirSync(out).filter((n) => n.endsWith('.html'))) {
  const html = readFileSync(join(out, f), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1].trim());
  if (!inline.length) continue;
  const file = `next/inline-${f.replace(/\.html$/, '')}.js`;
  writeFileSync(join(out, file), inline.map((m) => m[1].trim().replace(/;?$/, ';')).join('\n') + '\n');
  let first = true;
  const rewritten = html.replace(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g, (tag, body) => {
    if (!body.trim()) return tag;
    if (!first) return '';
    first = false;
    return `<script src="/${file}"></script>`;
  });
  if (/<script(?![^>]*\ssrc=)[^>]*>\s*\S/.test(rewritten)) throw new Error(`${f}: an inline script is left`);
  writeFileSync(join(out, f), rewritten);
}

say('Writing the manifest and icons…');
mkdirSync(join(out, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(join(root, 'src', 'app', 'icon.png')).resize(size, size).png().toFile(join(out, 'icons', `${size}.png`));
}
// The page's own policy, minus what only works as a header, with the inline-script hashes
// gone (there are none left) and nothing loaded from anywhere but the extension itself.
// Chrome also refuses blob: workers in extension pages.
const policy = csp({ web: true })
  .replace(" 'unsafe-inline'", '')
  .replace("worker-src 'self' blob:", "worker-src 'self'")
  .split('; ')
  .filter((d) => !d.startsWith('frame-ancestors'))
  .join('; ');
const manifest = {
  manifest_version: 3,
  name: 'Divina — New Tab',
  short_name: 'Divina',
  version,
  description: 'Your new tab as a spatial room: weather, news and your calendar on floating cards, a voice you can talk to, and hands-free control.',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  chrome_url_overrides: { newtab: 'index.html' },
  // searches from the new tab go to the browser's own search engine (chrome.search)
  permissions: ['search'],
  content_security_policy: { extension_pages: policy },
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

say('Checking for secrets…');
rmSync(ext, { recursive: true, force: true });
mkdirSync(dirname(ext), { recursive: true });
cpSync(out, ext, { recursive: true });
scrubBuildPaths(ext, root);
assertNoSecrets(ext, root);

say('Zipping…');
mkdirSync(dist, { recursive: true });
const zip = join(dist, `divina-extension-${version}.zip`);
rmSync(zip, { force: true });
const z = process.platform === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${ext}\\*' -DestinationPath '${zip}'`], { stdio: 'inherit' })
  : spawnSync('zip', ['-qr', zip, '.'], { cwd: ext, stdio: 'inherit' });
if (z.status !== 0) throw new Error('zip failed');
say(`Done: ${relative(root, ext)} (load unpacked) and ${relative(root, zip)} (upload to the stores)`);
