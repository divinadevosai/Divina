// Build the Windows installers:
//   dist/Divina-Setup-<version>.exe      everything inside (~34 MB), works offline
//   dist/Divina-Setup-<version>-web.exe  small (~13 MB); downloads Node.js from
//                                        nodejs.org while installing, checksum-verified
//
//   npm run build:windows
//   npm run build:windows -- --obstat   the edition Obstat installs for free:
//                                        dist/Divina-Obstat-Setup-<version>-x64.exe, never
//                                        asks for a licence, plus SHA256SUMS.txt and a
//                                        .json with its size and SHA-256 for Obstat to pin
//
// Needs NSIS (makensis) on PATH — `apt install nsis`, `brew install makensis`,
// or NSIS for Windows. Works from Linux, macOS or Windows.
//
// Signing: set DIVINA_WIN_SIGN (see scripts/windows/sign.mjs) so every .exe is
// signed. docs/RELEASE.md has the steps.
//
// Steps:
//   1. Next.js standalone build, staged with assets and legal pages, checked for secrets
//   2. a checksum-verified Node.js for Windows x64
//   3. makensis → Divina.exe (starter, signed) → both installers (signed, uninstaller too)
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, version, NODE_VERSION, say, run, saleConfig, stageApp, fetchNode } from './desktop/stage.mjs';

const win = join(root, 'scripts', 'windows');
const out = join(root, 'build', 'windows');
const stage = join(out, 'stage');
const cache = join(out, 'cache');
const dist = join(root, 'dist');

if (spawnSync('makensis', ['-VERSION']).status !== 0) {
  throw new Error('makensis not found. Install NSIS first (apt install nsis / brew install makensis / nsis.sourceforge.io).');
}
const signed = !!process.env.DIVINA_WIN_SIGN;
if (!signed) console.warn('\n  ! UNSIGNED: DIVINA_WIN_SIGN is not set, so Windows will warn about an unknown publisher (people click More info → Run anyway).');
const sign = (f) => run(process.execPath, [join(win, 'sign.mjs'), f]);

// The Obstat edition is free by design: it must never pick up the shop's
// licence settings, whatever release.config.json says.
const obstat = process.argv.includes('--obstat');
if (obstat) process.env.DIVINA_PREVIEW = '1';

// 1. build and stage
const sale = saleConfig();
stageApp(stage, { sale, platform: 'win' });
cpSync(join(win, 'divina.ico'), join(stage, 'divina.ico'));

// 2. Node.js for Windows
say(`Adding Node.js ${NODE_VERSION} for Windows…`);
const zipName = `node-${NODE_VERSION}-win-x64.zip`;
const node = await fetchNode(cache, zipName);
const nodeDir = join(out, 'node');
const unz = join(cache, 'node');
rmSync(unz, { recursive: true, force: true });
run('unzip', ['-q', '-o', node.file, `node-${NODE_VERSION}-win-x64/node.exe`, `node-${NODE_VERSION}-win-x64/LICENSE`, '-d', unz]);
rmSync(nodeDir, { recursive: true, force: true });
mkdirSync(nodeDir, { recursive: true });
cpSync(join(unz, `node-${NODE_VERSION}-win-x64`, 'node.exe'), join(nodeDir, 'node.exe'));
cpSync(join(unz, `node-${NODE_VERSION}-win-x64`, 'LICENSE'), join(nodeDir, 'LICENSE'));
writeFileSync(join(nodeDir, 'VERSION'), NODE_VERSION);

// 3. installers
say('Building Divina.exe…');
run('makensis', ['-V2', `-DVERSION=${version}`, `-DOUT=${join(stage, 'Divina.exe')}`, 'divina-exe.nsi'], { cwd: win });
sign(join(stage, 'Divina.exe'));
say('Building the installer…');
mkdirSync(dist, { recursive: true });
const common = [`-DVERSION=${version}`, `-DSTAGE=${stage}`, `-DNODE_VERSION=${NODE_VERSION}`, `-DSIGN_NODE=${process.execPath}`, `-DSIGN_SCRIPT=${join(win, 'sign.mjs')}`];
const full = join(dist, obstat ? `Divina-Obstat-Setup-${version}-x64.exe` : `Divina-Setup-${version}.exe`);
run('makensis', ['-V2', ...common, `-DNODE_DIR=${nodeDir}`, `-DOUT=${full}`, 'installer.nsi'], { cwd: win });
if (obstat) {
  // Obstat pins the exact file: a new version always gets a new name, size and hash
  const bytes = readFileSync(full);
  const pin = { app: 'Divina', edition: 'obstat', version, file: relative(dist, full), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), silent: '/S', perUser: true, selfUpdates: false };
  writeFileSync(join(dist, `Divina-Obstat-Setup-${version}-x64.json`), JSON.stringify(pin, null, 2) + '\n');
  writeFileSync(join(dist, 'SHA256SUMS.txt'), `${pin.sha256}  ${pin.file}\n`);
  say(`Done: ${pin.file} (${(pin.size / 1048576).toFixed(1)} MB, Obstat edition, ${signed ? 'signed' : 'UNSIGNED'})\n  size   ${pin.size}\n  sha256 ${pin.sha256}`);
  process.exit(0);
}
const web = join(dist, `Divina-Setup-${version}-web.exe`);
run('makensis', ['-V2', ...common, `-DNODE_URL=${node.url}`, `-DNODE_SHA256=${node.sha256}`, `-DOUT=${web}`, 'installer.nsi'], { cwd: win });
for (const f of [full, web]) say(`Done: ${relative(root, f)} (${(statSync(f).size / 1048576).toFixed(1)} MB, ${sale.forSale ? 'for sale' : 'free'}, ${signed ? 'signed' : 'UNSIGNED'})`);
