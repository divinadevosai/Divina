/**
 * Backups: everything personal in one file, sealed with a passphrase the
 * person chooses (PBKDF2-SHA-256, 600,000 rounds → AES-256-GCM). The device
 * vault can't be used here — a backup has to open on another computer — so
 * the passphrase is the key, and without it the file is unreadable.
 *
 * Same format in the app and the browser edition: a backup from one
 * restores into the other. Uses Web Crypto, present in browsers and Node.
 */
export interface BackupPayload {
  format: 'divina-backup';
  v: 1;
  created: string;
  edition: 'app' | 'browser';
  settings: Record<string, string>;
  hasKeys: boolean;
  notes: unknown[];
  agents: unknown[];
  memory: unknown[];
  routines: unknown[];
  worlds: unknown[];
  prefs: Record<string, unknown>;
}

interface Sealed {
  format: 'divina-backup';
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  data: string;
}

const ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function sealBackup(payload: BackupPayload, passphrase: string): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(passphrase, salt, ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('divina-backup v1') }, key, enc.encode(JSON.stringify(payload))));
  const sealed: Sealed = { format: 'divina-backup', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) }, iv: b64(iv), data: b64(data) };
  return JSON.stringify(sealed);
}

export async function openBackup(text: string, passphrase: string): Promise<BackupPayload> {
  let s: Sealed;
  try {
    s = JSON.parse(text) as Sealed;
  } catch {
    throw new Error('That isn’t a Divina backup file.');
  }
  if (s?.format !== 'divina-backup' || s.v !== 1 || s.kdf?.name !== 'PBKDF2' || typeof s.data !== 'string') throw new Error('That isn’t a Divina backup file.');
  // a file can't ask for a weaker or absurdly slow key derivation than Divina makes
  if (s.kdf.iterations !== ITERATIONS) throw new Error('This backup was made in a way Divina doesn’t accept.');
  let plain: ArrayBuffer;
  try {
    const key = await keyFrom(passphrase, unb64(s.kdf.salt), ITERATIONS);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv), additionalData: enc.encode('divina-backup v1') }, key, unb64(s.data));
  } catch {
    throw new Error('Wrong passphrase, or the file has been changed.');
  }
  const p = JSON.parse(new TextDecoder().decode(plain)) as BackupPayload;
  if (p?.format !== 'divina-backup' || p.v !== 1) throw new Error('That isn’t a Divina backup file.');
  return p;
}

/** Display preferences that may travel in a backup (nothing else from the page). */
export const BACKUP_PREFS = ['replyDisplay', 'interrupt', 'captionSize', 'headsMeetings', 'headsRain', 'quietFrom', 'quietTo'] as const;

/**
 * Whether a restored setting may be taken from the backup. Keys only travel
 * if the backup was made with them. The email server only comes with the
 * email password it belongs to: otherwise a doctored backup could point this
 * computer's saved password at someone else's server.
 */
export function restorable(key: string, p: Pick<BackupPayload, 'hasKeys' | 'settings'>, secret: ReadonlySet<string>): boolean {
  if (secret.has(key)) return p.hasKeys;
  if (key === 'DIVINA_EMAIL_HOST') return p.hasKeys && !!p.settings?.DIVINA_EMAIL_PASSWORD;
  return true;
}
