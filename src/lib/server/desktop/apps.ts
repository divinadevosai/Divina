/**
 * Applications resolve against a LIVE scan of the disk. An app that is not
 * installed cannot be named, so no string can reach `open -a` unless it is
 * the path of a bundle we just listed.
 */
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { norm, rankMatch } from '../../rank';

export interface InstalledApp {
  name: string;
  path: string;
}

const ROOTS = () => [
  '/Applications',
  '/Applications/Utilities',
  '/System/Applications',
  '/System/Applications/Utilities',
  '/System/Library/CoreServices/Applications',
  join(homedir(), 'Applications'),
];

let cache: { at: number; apps: InstalledApp[] } | null = null;

export async function scanApps(): Promise<InstalledApp[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.apps;
  const seen = new Map<string, InstalledApp>();
  for (const root of ROOTS()) {
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.endsWith('.app')) continue;
      const name = e.slice(0, -4);
      if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, path: join(root, e) });
    }
  }
  const apps = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), apps };
  return apps;
}

/** Common spoken names → bundle names. Only applied if that bundle exists. */
const SPOKEN: Record<string, string[]> = {
  chrome: ['Google Chrome'],
  browser: ['Google Chrome', 'Safari', 'Arc', 'Firefox'],
  vscode: ['Visual Studio Code'],
  'vs code': ['Visual Studio Code'],
  code: ['Visual Studio Code'],
  terminal: ['Terminal', 'iTerm', 'Warp'],
  settings: ['System Settings', 'System Preferences'],
  'system settings': ['System Settings', 'System Preferences'],
  music: ['Music', 'Spotify'],
  mail: ['Mail'],
  word: ['Microsoft Word'],
  excel: ['Microsoft Excel'],
  powerpoint: ['Microsoft PowerPoint'],
  teams: ['Microsoft Teams'],
  photoshop: ['Adobe Photoshop 2026', 'Adobe Photoshop 2025', 'Adobe Photoshop'],
};

/**
 * Resolve a spoken/typed name to an installed app, or null.
 * The query must MATCH an app name under the launcher ranking rules; a
 * query longer than every candidate cannot match — which is exactly why
 * "Safari; rm -rf ~" resolves to "no such application".
 */
export function resolveApp(query: string, apps: InstalledApp[]): InstalledApp | null {
  const q = norm(query);
  if (!q || q.length > 64) return null;
  const byName = new Map(apps.map((a) => [norm(a.name), a]));
  const exact = byName.get(q);
  if (exact) return exact;
  for (const alias of SPOKEN[q] ?? []) {
    const hit = byName.get(norm(alias));
    if (hit) return hit;
  }
  let best: { app: InstalledApp; score: number } | null = null;
  for (const app of apps) {
    const score = rankMatch(q, app.name);
    if (score > 0 && (!best || score > best.score)) best = { app, score };
  }
  // substring-only matches of very short queries are too loose to launch on
  if (best && best.score < 400 && q.length < 4) return null;
  return best?.app ?? null;
}
