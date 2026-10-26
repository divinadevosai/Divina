// Build Divina for Mac:
//   build/mac/<arch>/Divina.app          the app, for Apple Silicon (arm64) and Intel (x64)
//   dist/Divina-<version>-mac-<arch>.zip  zipped, UNSIGNED: for testing only
//
//   npm run build:mac
//
// Works from Linux, macOS or Windows (needs `zip` and `tar`). Selling it
// needs it signed and notarized by Apple, which only a Mac can do: the
// Codemagic workflow "mac-release" in codemagic.yaml runs this build on a
// Mac, then scripts/mac/sign-and-package.sh makes the signed, notarized
// .dmg files. docs/RELEASE.md has the steps.
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root, version, NODE_VERSION, say, run, saleConfig, stageApp, fetchNode } from './desktop/stage.mjs';

const mac = join(root, 'scripts', 'mac');
const out = join(root, 'build', 'mac');
const stage = join(out, 'stage');
const cache = join(out, 'cache');
const dist = join(root, 'dist');
const ARCHS = (process.env.DIVINA_MAC_ARCHS ?? 'arm64,x64').split(',');

const sale = saleConfig();
stageApp(stage, { sale, platform: 'mac' });
mkdirSync(dist, { recursive: true });

for (const arch of ARCHS) {
  say(`Making Divina.app for ${arch === 'arm64' ? 'Apple Silicon' : 'Intel'} Macs…`);
  const tarName = `node-${NODE_VERSION}-darwin-${arch}.tar.gz`;
  const node = await fetchNode(cache, tarName);
  const unpack = join(cache, `node-${arch}`);
  rmSync(unpack, { recursive: true, force: true });
  mkdirSync(unpack, { recursive: true });
  const folder = `node-${NODE_VERSION}-darwin-${arch}`;
  run('tar', ['-xzf', node.file, '-C', unpack, `${folder}/bin/node`, `${folder}/LICENSE`]);

  const appDir = join(out, arch, 'Divina.app');
  rmSync(join(out, arch), { recursive: true, force: true });
  const contents = join(appDir, 'Contents');
  const res = join(contents, 'Resources');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  mkdirSync(join(res, 'node'), { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), readFileSync(join(mac, 'Info.plist'), 'utf8').replaceAll('__VERSION__', version));
  writeFileSync(join(contents, 'PkgInfo'), 'APPL????');
  cpSync(join(mac, 'Divina.sh'), join(contents, 'MacOS', 'Divina'));
  chmodSync(join(contents, 'MacOS', 'Divina'), 0o755);
  cpSync(join(mac, 'Divina.icns'), join(res, 'Divina.icns'));
  cpSync(stage, res, { recursive: true });
  cpSync(join(unpack, folder, 'bin', 'node'), join(res, 'node', 'node'));
  chmodSync(join(res, 'node', 'node'), 0o755);
  cpSync(join(unpack, folder, 'LICENSE'), join(res, 'node', 'LICENSE'));
  writeFileSync(join(res, 'node', 'VERSION'), NODE_VERSION);

  const zip = join(dist, `Divina-${version}-mac-${arch}.zip`);
  rmSync(zip, { force: true });
  // -y keeps symbolic links as links (the app has none today, but notarized apps must not change)
  run('zip', ['-q', '-r', '-y', '-9', zip, 'Divina.app'], { cwd: join(out, arch) });
  say(`Done: ${relative(root, zip)} (${(statSync(zip).size / 1048576).toFixed(1)} MB, ${sale.forSale ? 'for sale' : 'free'}, UNSIGNED)`);
}
