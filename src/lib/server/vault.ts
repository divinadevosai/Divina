/**
 * Encryption for saved secrets (API keys, tokens, the email app password).
 *
 * Each secret is stored in settings.local.json as
 *   enc:v1:<base64 of iv · auth tag · ciphertext>
 * sealed with AES-256-GCM. The setting's name is bound in as associated data,
 * so a sealed value can't be moved to another setting, and any change to the
 * file is detected rather than decrypted into garbage.
 *
 * The 256-bit key itself lives in vault.key beside the settings, and is
 * never written in the clear:
 *   - Windows: locked with DPAPI to this Windows account. Another account,
 *     another PC, or a copy of the file (a backup, a stolen laptop's disk
 *     read elsewhere) can't unlock it. (If a PC's policy blocks PowerShell,
 *     it falls back to a file only this account can read, as below.)
 *   - Mac: kept in this user's login Keychain; vault.key only says so. The
 *     key goes to the `security` tool on its input, never its command line.
 *   - elsewhere (Linux, or if the Keychain refuses): readable only by this
 *     user (file mode 0600).
 *
 * What this can't stop: a program running as you, on your unlocked account,
 * can ask Windows to unlock it too — as it could with any browser's saved
 * passwords.
 */
import 'server-only';
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userDataDir } from '@/lib/server/paths';

export const SEALED = 'enc:v1:';
const keyFile = () => join(userDataDir(), 'vault.key');

// Divina's own DPAPI entropy: another program calling Unprotect on the file
// without it gets nothing.
const ENTROPY = Buffer.from('Divina vault v1').toString('base64');

function powershell(script: string, input: string): string {
  const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // The data goes in through this child's own environment, never its command line.
  return execFileSync(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, DIVINA_VAULT_IN: input, DIVINA_VAULT_ENTROPY: ENTROPY },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  }).trim();
}

// The Mac login Keychain item that holds the key.
const KC = ['-a', 'divina', '-s', 'Divina vault'];
const SECURITY = '/usr/bin/security';

export const macKeychain = {
  store(b64: string) {
    // `security -i` reads its commands from input, so the key never shows in a process list
    execFileSync(SECURITY, ['-i'], { input: `add-generic-password -U ${KC[0]} ${KC[1]} ${KC[2]} "${KC[3]}" -w ${b64}\n`, timeout: 20_000, stdio: ['pipe', 'ignore', 'ignore'] });
  },
  read(): string {
    return execFileSync(SECURITY, ['find-generic-password', ...KC, '-w'], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  },
  remove() {
    try {
      execFileSync(SECURITY, ['delete-generic-password', ...KC], { timeout: 20_000, stdio: 'ignore' });
    } catch {
      /* nothing there */
    }
  },
};

const DPAPI = (verb: 'Protect' | 'Unprotect') =>
  `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${verb}([Convert]::FromBase64String($env:DIVINA_VAULT_IN), [Convert]::FromBase64String($env:DIVINA_VAULT_ENTROPY), 'CurrentUser'))`;

/** How the key is kept on this platform. Swappable in tests. */
export const keeper = {
  lock(key: Buffer): string {
    if (process.platform === 'win32') {
      try {
        const locked = powershell(DPAPI('Protect'), key.toString('base64'));
        if (/^[A-Za-z0-9+/=]{40,}$/.test(locked)) return `dpapi:${locked}`;
      } catch {
        /* PowerShell blocked on this PC: fall back to a file only this account can open */
      }
    }
    if (process.platform === 'darwin') {
      try {
        macKeychain.store(key.toString('base64'));
        if (macKeychain.read() === key.toString('base64')) return 'keychain:v1';
      } catch {
        /* no Keychain (locked, or a sandboxed shell): the file below */
      }
    }
    return `file:${key.toString('base64')}`;
  },
  unlock(stored: string): Buffer {
    const [kind, data] = [stored.slice(0, stored.indexOf(':')), stored.slice(stored.indexOf(':') + 1)];
    if (kind === 'dpapi') {
      if (process.platform !== 'win32') throw new Error('this key was locked by Windows');
      return Buffer.from(powershell(DPAPI('Unprotect'), data), 'base64');
    }
    if (kind === 'keychain') {
      if (process.platform !== 'darwin') throw new Error('this key is in a Mac Keychain');
      return Buffer.from(macKeychain.read(), 'base64');
    }
    if (kind === 'file') return Buffer.from(data, 'base64');
    throw new Error('unknown key format');
  },
};

let master: Buffer | null = null;

function masterKey(create: boolean): Buffer | null {
  if (master) return master;
  const f = keyFile();
  if (existsSync(f)) {
    try {
      const k = keeper.unlock(readFileSync(f, 'utf8').trim());
      if (k.length !== 32) throw new Error('wrong key length');
      return (master = k);
    } catch {
      // Unreadable here (another account or PC). Secrets sealed with it are
      // lost either way; keep the file aside and start a new key only when
      // something new has to be saved.
      if (!create) return null;
      try {
        renameSync(f, `${f}.unreadable-${Date.now()}`);
      } catch {
        /* keep going: the new key replaces it */
      }
    }
  }
  if (!create) return null;
  const k = randomBytes(32);
  mkdirSync(userDataDir(), { recursive: true });
  writeFileSync(`${f}.tmp`, keeper.lock(k), { mode: 0o600 });
  renameSync(`${f}.tmp`, f);
  return (master = k);
}

export const isSealed = (v: string) => v.startsWith(SEALED);

export function seal(name: string, plain: string): string {
  const key = masterKey(true)!;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(name));
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return SEALED + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

/** The secret, or undefined if it can't be opened here or was tampered with. */
export function unseal(name: string, sealed: string): string | undefined {
  if (!isSealed(sealed)) return undefined;
  const key = masterKey(false);
  if (!key) return undefined;
  try {
    const raw = Buffer.from(sealed.slice(SEALED.length), 'base64');
    if (raw.length < 29) return undefined;
    const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAAD(Buffer.from(name));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

/** Tests only: forget the key held in memory. */
export function _forgetKey() {
  master = null;
}

/** After everything is deleted: forget the key too, so a new one is made for anything saved next. */
export function forgetKey(opts: { destroy?: boolean } = {}) {
  master = null;
  // Delete everything: the Mac Keychain item goes too (vault.key itself is deleted by the caller)
  if (opts.destroy && process.platform === 'darwin') macKeychain.remove();
}
