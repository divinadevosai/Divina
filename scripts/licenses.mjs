// Writes the full third-party licence file that ships with every build
// (the Windows installer and the browser edition). Open-source licences ask
// for their text to travel with the software; this collects all of it.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// image libraries the build removes (never shipped)
const NOT_SHIPPED = /^(sharp|@img\/)/;

function licenceText(dir) {
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(n));
  return f ? readFileSync(join(dir, f), 'utf8').trim() : null;
}

export function writeLicenses(file, { node = false } = {}) {
  const dirs = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8' }).trim().split('\n').slice(1);
  const seen = new Set();
  const packages = [];
  for (const d of dirs) {
    let p;
    try {
      p = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const id = `${p.name}@${p.version}`;
    if (seen.has(id) || NOT_SHIPPED.test(p.name)) continue;
    seen.add(id);
    const author = typeof p.author === 'string' ? p.author : p.author?.name;
    packages.push({ id, license: p.license ?? 'see text', text: licenceText(d) ?? `${p.license ?? ''} licence${author ? `, © ${author}` : ''}. ${p.homepage ?? p.repository?.url ?? ''}`.trim() });
  }
  packages.sort((a, b) => a.id.localeCompare(b.id));

  const lic = (n) => readFileSync(join(root, 'licenses', n), 'utf8').trim();
  const rule = '='.repeat(78);
  const parts = [
    'DIVINA — THIRD-PARTY NOTICES AND LICENCES',
    '',
    'Divina itself is free software: © 2026 Sweeney Creative, under the GNU Affero General',
    'Public License v3 or later (see LICENSE). It is built with the open-source components',
    'below, used under their own licences.',
    'Trademarks mentioned in Divina (Google, Gemini, Instagram, Windows, Spotify,',
    'ESPN and others) belong to their owners; Divina is not affiliated with or',
    'endorsed by them.',
    '',
    rule,
    'DATA SOURCES',
    rule,
    '- Weather: MET Norway (api.met.no), licensed under CC BY 4.0 and the',
    '  Norwegian Licence for Open Government Data (NLOD). "Data from MET Norway".',
    '- Place names: © OpenStreetMap contributors, Open Database Licence (ODbL),',
    '  via Nominatim, under the OSMF Nominatim usage policy.',
    '- News: Hacker News, via the HN Search API by Algolia.',
    '- Crypto: Data provided by CoinGecko (coingecko.com/en/api), with each',
    '  person’s own API key under CoinGecko’s terms.',
    '- AI: Google Gemini API, used with the person’s own API key under Google’s',
    '  terms (ai.google.dev/gemini-api/terms).',
    '',
    rule,
    'FONTS — SIL Open Font License 1.1',
    rule,
    'Inter — Copyright 2016 The Inter Project Authors (github.com/rsms/inter)',
    'JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors',
    '  (github.com/JetBrains/JetBrainsMono)',
    '',
    lic('OFL-1.1.txt'),
    '',
    rule,
    'MEDIAPIPE HAND LANDMARKER MODEL — Apache License 2.0',
    rule,
    'Copyright Google LLC. The hand-tracking model (hand_landmarker.task) and the',
    'MediaPipe Tasks runtime are used under the Apache License, Version 2.0,',
    'whose full text follows once, and applies to every component below marked',
    'Apache-2.0.',
    '',
    lic('Apache-2.0.txt'),
    '',
    ...(node
      ? [rule, 'NODE.JS', rule, 'Divina for Windows includes Node.js (nodejs.org). Its licence and the', 'licences of its bundled components are in node\\LICENSE in the install folder.', '']
      : []),
    rule,
    'OPEN-SOURCE PACKAGES',
    rule,
    '',
    ...packages.flatMap((p) => [`--- ${p.id} (${p.license}) ---`, '', p.text, '']),
  ];
  writeFileSync(file, parts.join('\n').replace(/\r\n/g, '\n'));
  return packages.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? join(root, 'THIRD_PARTY_LICENSES.txt');
  console.log(`${writeLicenses(out)} packages → ${out}`);
}
