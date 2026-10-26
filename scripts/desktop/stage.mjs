// The parts of the Windows and Mac builds that are the same: build Divina,
// stage it with its assets and legal pages, check nothing private slipped
// in, and fetch a checksum-verified Node.js.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoSecrets, scrubBuildPaths } from '../secret-scan.mjs';
import { writeLicenses } from '../licenses.mjs';

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const NODE_VERSION = process.env.DIVINA_NODE_VERSION ?? 'v22.22.2';
export const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
export const say = (m) => console.log(`\n▸ ${m}`);

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status}`);
}

/**
 * Licence settings for this build, from release.config.json (or the
 * environment). With a store id, the build is for sale and asks for a
 * licence key; without one it's a free preview build, and we say so loudly.
 */
export function saleConfig() {
  const cfg = JSON.parse(readFileSync(join(root, 'release.config.json'), 'utf8'));
  const storeId = String(process.env.DIVINA_LS_STORE_ID ?? cfg.lemonSqueezy?.storeId ?? '').trim();
  const productIds = String(process.env.DIVINA_LS_PRODUCT_IDS ?? (cfg.lemonSqueezy?.productIds ?? []).join(',')).trim();
  const forSale = !!storeId && process.env.DIVINA_PREVIEW !== '1';
  if (process.env.DIVINA_FOR_SALE === '1' && !forSale) throw new Error('DIVINA_FOR_SALE=1 but release.config.json has no Lemon Squeezy store id.');
  if (!forSale) console.log('\n  Free build: no Lemon Squeezy store id, so it never asks for a licence key (Divina is AGPL-3.0; this is the normal build).');
  return { forSale, env: forSale ? { DIVINA_REQUIRE_LICENCE: '1', DIVINA_LS_STORE_ID: storeId, DIVINA_LS_PRODUCT_IDS: productIds } : { DIVINA_REQUIRE_LICENCE: '' } };
}

/** next build (standalone) → stage/app, plus launcher, licences and legal pages. */
export function stageApp(stage, { sale, platform }) {
  say(`Building Divina (standalone, ${sale.forSale ? 'for sale' : 'free'})…`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  run(npx, ['next', 'build'], { cwd: root, env: { ...process.env, DIVINA_STANDALONE: '1', NEXT_TELEMETRY_DISABLED: '1', ...sale.env }, shell: process.platform === 'win32' });
  const standalone = join(root, '.next', 'standalone');
  if (!existsSync(join(standalone, 'server.js'))) throw new Error('standalone build missing server.js');

  say('Staging files…');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const app = join(stage, 'app');
  cpSync(standalone, app, { recursive: true });
  cpSync(join(root, '.next', 'static'), join(app, '.next', 'static'), { recursive: true });
  cpSync(join(root, 'public'), join(app, 'public'), { recursive: true });
  rmSync(join(app, 'data'), { recursive: true, force: true });
  mkdirSync(join(app, 'data'));
  for (const f of ['portfolio.example.json', 'projects.json']) cpSync(join(root, 'data', f), join(app, 'data', f));
  // native image libraries are built for this machine, not the target, and Divina doesn't use them
  // (TypeScript is only traced in for next.config.ts, which the standalone server doesn't load)
  for (const m of ['sharp', '@img', 'typescript']) rmSync(join(app, 'node_modules', m), { recursive: true, force: true });
  // Chromium browsers and Safari load the SIMD, non-module MediaPipe build; the other two only add size
  for (const f of ['vision_wasm_module_internal', 'vision_wasm_nosimd_internal']) {
    for (const ext of ['.js', '.wasm']) rmSync(join(app, 'public', 'mediapipe', 'wasm', f + ext), { force: true });
  }
  cpSync(join(root, 'scripts', 'desktop', 'launcher.cjs'), join(stage, 'launcher.cjs'));
  const eol = platform === 'win' ? '\r\n' : '\n';
  writeFileSync(join(stage, 'LICENSE.txt'), readFileSync(join(root, 'EULA.txt'), 'utf8').replace(/\r?\n/g, eol));
  cpSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(stage, 'THIRD_PARTY_NOTICES.md'));
  writeLicenses(join(stage, 'THIRD_PARTY_LICENSES.txt'), { node: true });
  // the privacy, cookie and terms pages, readable inside the app at /legal/
  const legalDir = join(app, 'public', 'legal');
  mkdirSync(legalDir, { recursive: true });
  for (const f of ['privacy.html', 'cookies.html', 'terms.html', 'styles.css', 'favicon.svg']) {
    let text = readFileSync(join(root, 'legal', f), 'utf8');
    if (f.endsWith('.html')) text = text.replaceAll('href="/app/licenses.txt"', 'href="/legal/licenses.txt"').replaceAll('href="/app/"', 'href="/"');
    writeFileSync(join(legalDir, f), text);
  }
  cpSync(join(stage, 'THIRD_PARTY_LICENSES.txt'), join(legalDir, 'licenses.txt'));
  cpSync(join(root, 'EULA.txt'), join(legalDir, 'eula.txt'));

  say('Checking for secrets…');
  scrubBuildPaths(stage, root);
  assertNoSecrets(stage, root);
  return app;
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Downloads a Node.js release file into cache, checked against nodejs.org's SHASUMS256. */
export async function fetchNode(cache, fileName) {
  mkdirSync(cache, { recursive: true });
  const base = `https://nodejs.org/dist/${NODE_VERSION}`;
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split('\n').find((l) => l.endsWith(`  ${fileName}`))?.split(/\s+/)[0];
  if (!expected) throw new Error(`no checksum for ${fileName}`);
  const file = join(cache, fileName);
  if (!existsSync(file) || sha(readFileSync(file)) !== expected) {
    const r = await fetch(`${base}/${fileName}`);
    if (!r.ok) throw new Error(`download failed: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  if (sha(readFileSync(file)) !== expected) throw new Error('Node.js download failed its checksum');
  return { file, url: `${base}/${fileName}`, sha256: expected };
}
