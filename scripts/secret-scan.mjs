// Refuse to package anything private: .env files, saved settings, personal
// data files, key-shaped strings in Divina's own output, or any value saved in
// this machine's settings. Used by the Windows and browser builds.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

function walk(dir, fn) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

/** The ways a folder path can be written inside built files (plain, JSON-escaped, forward slashes). */
function spellings(dir) {
  return [...new Set([dir, dir.replace(/\\/g, '\\\\'), dir.replace(/\\/g, '/')])].filter((s) => s.length > 3);
}

const TEXT = /\.(js|json|html|txt|md|cjs|mjs|map|rsc|body|meta|css)$/;

/**
 * Next.js writes the build folder's absolute path into server files (as
 * labels only). On a personal PC that path contains the Windows user name,
 * so replace it with a neutral one before packaging.
 */
export function scrubBuildPaths(stage, root) {
  const from = spellings(root);
  walk(stage, (p) => {
    if (!TEXT.test(p) || statSync(p).size > 16 * 1024 * 1024) return;
    const text = readFileSync(p, 'utf8');
    let next = text;
    for (const s of from) next = next.split(s).join('/divina');
    if (next !== text) writeFileSync(p, next);
  });
}

export function assertNoSecrets(stage, root) {
  const forbidden = [/(^|[\\/])\.env(\.|$)/, /settings\.local\.json$/, /portfolio\.json$/, /calendar\.ics$/, /\.pem$/, /\.key$/];
  const found = [];
  walk(stage, (p) => {
    const rel = relative(stage, p);
    if (forbidden.some((re) => re.test(rel))) found.push(rel);
  });
  // a key starts a token of its own; inside base64 (embedded images) it's just noise
  const secretPattern = /(?<![A-Za-z0-9+/_-])(?:AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_-]{20,}|IGAA[0-9A-Za-z]{20,}|EAA[0-9A-Za-z]{30,}|gh[pousr]_[0-9A-Za-z]{30,}|sk-ant-[0-9A-Za-z_-]{30,}|sk-(?:proj-|svcacct-|admin-)?[0-9A-Za-z_-]{40,}|sk_[0-9a-f]{40,}|CG-[0-9A-Za-z]{20,})/;
  const localSettings = join(root, 'data', 'settings.local.json');
  const ownValues = existsSync(localSettings)
    ? Object.values(JSON.parse(readFileSync(localSettings, 'utf8'))).filter((v) => typeof v === 'string' && v.length >= 12)
    : [];
  const personal = [...spellings(root), ...spellings(homedir())].filter((s) => s !== '/root' && s !== '/');
  walk(stage, (p) => {
    if (statSync(p).size > 8 * 1024 * 1024 || !/\.(js|json|html|txt|md|cjs|mjs|map|rsc|body|meta)$/.test(p)) return;
    const text = readFileSync(p, 'utf8');
    // key-shaped strings: only in Divina's own output (library blobs are full of look-alikes);
    // this machine's real saved keys: everywhere
    const ours = !relative(stage, p).split(/[\\/]/).includes('node_modules');
    if ((ours && secretPattern.test(text)) || ownValues.some((v) => text.includes(v))) found.push(`${relative(stage, p)} (contains a key)`);
    // nothing may point back at the machine it was built on (user name, folders)
    if (personal.some((s) => text.includes(s))) found.push(`${relative(stage, p)} (contains this computer's folder path)`);
  });
  if (found.length) throw new Error(`Refusing to build — private files would ship:\n  ${found.join('\n  ')}`);
}
