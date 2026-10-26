/**
 * Runtime settings, editable from Divina's Settings panel.
 *
 * Stored in settings.local.json in the data folder on this machine
 * (data/ from source, %APPDATA%\Divina when installed; git-ignored). A value
 * saved there wins over .env.local, so changes apply without a restart.
 * Secrets are never sent back to the browser — only whether they are set
 * and their last four characters — and are never written to disk in the
 * clear: each is sealed with AES-256-GCM under a key Windows locks to this
 * account (see vault.ts). Keys saved in the clear by older versions are
 * sealed the first time they are read.
 *
 * Deliberately NOT editable from the page: DIVINA_DESKTOP_BRIDGE. Letting a
 * web page switch on desktop control would undo the point of it being off
 * unless the person running the server says so.
 */
import 'server-only';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userDataDir } from '@/lib/server/paths';
import { isSealed, seal, unseal } from '@/lib/server/vault';
import { SECRET, SETTING_KEYS, checkSetting, publicSetting, type PublicSetting, type SettingKey } from '@/lib/settingsSchema';

export { SETTING_KEYS, type SettingKey, type PublicSetting } from '@/lib/settingsSchema';

/** Replace any saved secret that appears in a message with "…", so errors never echo a key. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const k of SECRET) {
    const v = setting(k);
    if (v && v.length >= 6) out = out.split(v).join('…');
  }
  return out;
}

const file = () => join(userDataDir(), 'settings.local.json');
let cache: { mtime: number; values: Partial<Record<SettingKey, string>> } = { mtime: -1, values: {} };

function load(): Partial<Record<SettingKey, string>> {
  const f = file();
  if (!existsSync(f)) return (cache = { mtime: 0, values: {} }).values;
  const mtime = statSync(f).mtimeMs;
  if (mtime === cache.mtime) return cache.values;
  try {
    const raw = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
    const values: Partial<Record<SettingKey, string>> = {};
    let unsealed = false;
    for (const k of SETTING_KEYS) {
      const v = raw[k];
      if (typeof v !== 'string') continue;
      if (!SECRET.has(k)) values[k] = v;
      else if (isSealed(v)) {
        const plain = unseal(k, v);
        if (plain !== undefined) values[k] = plain; // else: can't be opened here, treated as not set
      } else {
        values[k] = v;
        unsealed = true;
      }
    }
    cache = { mtime, values };
    if (unsealed) write(values); // an older version saved it in the clear: seal it now
  } catch {
    cache = { mtime, values: {} };
  }
  return cache.values;
}

/** Write atomically, secrets sealed, readable only by this user. */
function write(values: Partial<Record<SettingKey, string>>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values) as [SettingKey, string][]) out[k] = SECRET.has(k) ? seal(k, v) : v;
  const f = file();
  mkdirSync(userDataDir(), { recursive: true });
  writeFileSync(`${f}.tmp`, JSON.stringify(out, null, 2), { mode: 0o600 });
  renameSync(`${f}.tmp`, f);
  cache = { mtime: statSync(f).mtimeMs, values: { ...values } };
}

/** The value in effect: Settings panel first, then .env.local / environment. */
export function setting(key: SettingKey | 'DIVINA_LEAGUES' | 'DIVINA_LAT' | 'DIVINA_LON' | 'INSTAGRAM_API_VERSION'): string | undefined {
  const saved = (SETTING_KEYS as readonly string[]).includes(key) ? load()[key as SettingKey] : undefined;
  const v = saved !== undefined ? saved : process.env[key];
  return v === '' ? undefined : v;
}

export function publicSettings(): Record<SettingKey, PublicSetting> {
  const saved = load();
  const out = {} as Record<SettingKey, PublicSetting>;
  for (const k of SETTING_KEYS) {
    const v = saved[k] !== undefined ? saved[k] : process.env[k];
    const from = saved[k] !== undefined ? 'panel' : process.env[k] ? 'env' : 'default';
    out[k] = publicSetting(k, v, from);
  }
  return out;
}

/**
 * Apply a patch. Unknown keys are rejected; an empty string clears a value
 * back to .env.local / the default. Written atomically.
 */
export function saveSettings(patch: Record<string, unknown>): { ok: true } | { ok: false; message: string } {
  const next = { ...load() };
  for (const [k, v] of Object.entries(patch)) {
    const problem = checkSetting(k, v);
    if (problem) return { ok: false, message: problem };
    const t = (v as string).trim();
    if (t === '') delete next[k as SettingKey];
    else next[k as SettingKey] = t;
  }
  write(next);
  return { ok: true };
}

/**
 * What's saved in the Settings panel, secrets included. Only for writing a
 * passphrase-sealed backup: never sent to the page as it is.
 */
export function savedSettings(includeSecrets: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(load()) as [SettingKey, string][]) if (includeSecrets || !SECRET.has(k)) out[k] = v;
  return out;
}
