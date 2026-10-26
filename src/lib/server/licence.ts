/**
 * Licence keys for the paid desktop editions (Windows and Mac).
 *
 * Keys are sold and issued by Lemon Squeezy, the shop (merchant of record).
 * Divina talks to Lemon Squeezy's public License API, which needs no secret
 * of ours: the buyer's key is the only credential, so nothing in this app can
 * leak access to the shop.
 *
 *   activate    the key + a made-up device name → an "instance" id
 *   validate    the key + that id, about once a week
 *   deactivate  frees the seat, to move Divina to another computer
 *
 * The answer must name our store and product, so a key from someone else's
 * Lemon Squeezy shop doesn't unlock Divina. If the computer is offline,
 * Divina keeps working for OFFLINE_GRACE after the last good check. The key
 * itself is kept sealed with the same vault as the API keys.
 *
 * Only builds made for sale require a licence (DIVINA_REQUIRE_LICENCE=1, set
 * by scripts/build-windows.mjs and build-mac.mjs). Running from source, and
 * the free browser edition, never ask.
 *
 * Honest limit: Divina runs on the buyer's own computer, so a determined
 * person could edit it to skip this check. It keeps honest people honest; it
 * is not DRM.
 */
import 'server-only';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userDataDir } from '@/lib/server/paths';
import { seal, unseal } from '@/lib/server/vault';

const API = 'https://api.lemonsqueezy.com/v1/licenses';
export const CHECK_EVERY = 7 * 24 * 3600e3;
export const OFFLINE_GRACE = 30 * 24 * 3600e3;
export const BUY_URL = 'https://divinaos.site/#buy';
const FILE = 'licence.local.json';

export interface LicenceConfig {
  required: boolean;
  storeId: string;
  productIds: string[];
}

export const licenceConfig = (): LicenceConfig => ({
  required: process.env.DIVINA_REQUIRE_LICENCE === '1',
  storeId: (process.env.DIVINA_LS_STORE_ID ?? '').trim(),
  productIds: (process.env.DIVINA_LS_PRODUCT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});

interface Stored {
  v: 1;
  key: string; // sealed
  instanceId: string;
  instanceName: string;
  email: string;
  product: string;
  activatedAt: number;
  checkedAt: number;
}

export type LicenceState = 'not-required' | 'none' | 'active' | 'offline' | 'revoked';

export interface LicenceStatus {
  ok: boolean;
  required: boolean;
  state: LicenceState;
  /** shown in Settings: "j•••@gmail.com" */
  email?: string;
  product?: string;
  activatedAt?: number;
  checkedAt?: number;
  message?: string;
  buyUrl: string;
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** For tests. */
export const setLicenceFetch = (f: Fetch) => (fetcher = f);

const file = () => join(userDataDir(), FILE);

function read(): Stored | null {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Stored;
    return s && s.v === 1 && typeof s.instanceId === 'string' ? s : null;
  } catch {
    return null;
  }
}

function write(s: Stored) {
  mkdirSync(userDataDir(), { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(s, null, 2), { mode: 0o600 });
  renameSync(`${file()}.tmp`, file());
}

export function forgetLicence() {
  rmSync(file(), { force: true });
  rmSync(`${file()}.tmp`, { force: true });
}

export const maskEmail = (e: string) => {
  const [user, domain] = e.split('@');
  if (!user || !domain) return '';
  return `${user[0]}•••@${domain}`;
};

/** Lemon Squeezy keys look like a UUID; accept anything key-shaped and let the shop decide. */
export const keyShaped = (k: string) => /^[A-Za-z0-9-]{16,64}$/.test(k);

interface LsReply {
  activated?: boolean;
  valid?: boolean;
  deactivated?: boolean;
  error?: string | null;
  license_key?: { status?: string; activation_limit?: number; activation_usage?: number; expires_at?: string | null };
  instance?: { id?: string; name?: string } | null;
  meta?: { store_id?: number | string; product_id?: number | string; product_name?: string; variant_name?: string; customer_email?: string };
}

async function call(path: 'activate' | 'validate' | 'deactivate', form: Record<string, string>): Promise<{ status: number; body: LsReply }> {
  const r = await fetcher(`${API}/${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await r.json().catch(() => ({}))) as LsReply;
  return { status: r.status, body };
}

/** Is this answer about OUR product? */
function ours(cfg: LicenceConfig, b: LsReply): boolean {
  const store = String(b.meta?.store_id ?? '');
  const product = String(b.meta?.product_id ?? '');
  return !!cfg.storeId && store === cfg.storeId && (cfg.productIds.length === 0 || cfg.productIds.includes(product));
}

const status = (cfg: LicenceConfig, s: Stored | null, state: LicenceState, message?: string): LicenceStatus => ({
  ok: !cfg.required || state === 'active' || state === 'offline',
  required: cfg.required,
  state,
  email: s ? maskEmail(s.email) : undefined,
  product: s?.product,
  activatedAt: s?.activatedAt,
  checkedAt: s?.checkedAt,
  message,
  buyUrl: BUY_URL,
});

/** The licence as it stands, checking with the shop when a check is due. */
export async function licenceStatus(opts: { now?: number; force?: boolean } = {}): Promise<LicenceStatus> {
  const cfg = licenceConfig();
  const s = read();
  if (!cfg.required && !s) return status(cfg, null, 'not-required');
  if (!s) return status(cfg, null, 'none');
  const now = opts.now ?? Date.now();
  if (!opts.force && now - s.checkedAt < CHECK_EVERY) return status(cfg, s, 'active');
  const key = unseal('licence', s.key);
  if (!key) {
    // the vault key changed (another account or computer): ask for the key again
    return status(cfg, s, 'none', 'Enter your licence key again to use Divina on this account.');
  }
  try {
    const { status: code, body } = await call('validate', { license_key: key, instance_id: s.instanceId });
    if (body.valid && ours(cfg, body)) {
      write({ ...s, checkedAt: now });
      return status(cfg, { ...s, checkedAt: now }, 'active');
    }
    // the shop answered and said no: refunded, disabled, or this computer was deactivated
    if (code < 500 && (body.valid === false || (body.valid && !ours(cfg, body)))) {
      const why = body.license_key?.status === 'disabled' ? 'This licence has been turned off (for example after a refund).' : body.license_key?.status === 'expired' ? 'This licence has expired.' : 'This computer is no longer activated for this licence.';
      return status(cfg, s, 'revoked', `${why} Enter a licence key to keep using Divina.`);
    }
    throw new Error(`HTTP ${code}`);
  } catch {
    // offline, or the shop is down: keep working for a while
    if (now - s.checkedAt < OFFLINE_GRACE) return status(cfg, s, 'offline');
    return status(cfg, s, 'revoked', 'Divina couldn’t check your licence for 30 days. Connect to the internet and open Divina again.');
  }
}

/** A device name for the shop's dashboard: the platform and a random tag, never the computer's own name. */
const instanceName = () => `Divina for ${process.platform === 'darwin' ? 'Mac' : process.platform === 'win32' ? 'Windows' : process.platform} · ${randomBytes(3).toString('hex')}`;

export async function activateLicence(rawKey: string, now = Date.now()): Promise<LicenceStatus> {
  const cfg = licenceConfig();
  const key = rawKey.trim();
  if (!keyShaped(key)) return status(cfg, null, 'none', 'That doesn’t look like a licence key. Copy it from your receipt email.');
  if (!cfg.storeId) return status(cfg, null, 'none', 'This copy of Divina isn’t set up to check licences. Please download it again from divinaos.site.');
  const name = instanceName();
  let reply: { status: number; body: LsReply };
  try {
    reply = await call('activate', { license_key: key, instance_name: name });
  } catch {
    return status(cfg, read(), read() ? 'offline' : 'none', 'Divina couldn’t reach the licence server. Check your internet connection and try again.');
  }
  const b = reply.body;
  // no answer from the shop itself (a proxy, a captive Wi-Fi page, an outage): say so, don't blame the key
  if (!b.activated && !b.error) return status(cfg, read(), read() ? 'active' : 'none', 'Divina couldn’t reach the licence server. Check your internet connection and try again.');
  if (!b.activated || !b.instance?.id) {
    const err = (b.error ?? '').toLowerCase();
    const msg = /limit/.test(err)
      ? `This key is already active on ${b.license_key?.activation_limit ?? 'its maximum number of'} computers. Deactivate it on one of them (Settings → Licence), or email dev@divinaos.site.`
      : /disabled|refund/.test(err) || b.license_key?.status === 'disabled'
        ? 'This licence has been turned off. If you think that’s wrong, email dev@divinaos.site.'
        : /expired/.test(err)
          ? 'This licence has expired.'
          : 'That key wasn’t recognised. Copy it exactly from your receipt email.';
    return status(cfg, read(), read() ? 'active' : 'none', msg);
  }
  if (!ours(cfg, b)) {
    // a real key, but for another shop's product: give the seat straight back
    await call('deactivate', { license_key: key, instance_id: b.instance.id }).catch(() => null);
    return status(cfg, read(), read() ? 'active' : 'none', 'That key is for a different product, not Divina.');
  }
  const old = read();
  const s: Stored = {
    v: 1,
    key: seal('licence', key),
    instanceId: b.instance.id,
    instanceName: name,
    email: b.meta?.customer_email ?? '',
    product: [b.meta?.product_name, b.meta?.variant_name].filter((x) => x && x !== 'Default').join(' · ') || 'Divina',
    activatedAt: now,
    checkedAt: now,
  };
  write(s);
  // replacing an older key on this computer: free its seat
  if (old && old.instanceId !== s.instanceId) {
    const oldKey = unseal('licence', old.key);
    if (oldKey) await call('deactivate', { license_key: oldKey, instance_id: old.instanceId }).catch(() => null);
  }
  return status(cfg, s, 'active', 'Thanks! Divina is activated on this computer.');
}

/** Frees this computer's seat. Keeps the licence here if the shop can't be reached, unless `force`. */
export async function deactivateLicence(opts: { force?: boolean } = {}): Promise<LicenceStatus & { deactivated: boolean }> {
  const cfg = licenceConfig();
  const s = read();
  if (!s) return { ...status(cfg, null, cfg.required ? 'none' : 'not-required'), deactivated: true };
  const key = unseal('licence', s.key);
  let freed = false;
  if (key) {
    try {
      const { body } = await call('deactivate', { license_key: key, instance_id: s.instanceId });
      freed = !!body.deactivated || /not found|does not exist/i.test(body.error ?? '');
    } catch {
      freed = false;
    }
  }
  if (!freed && !opts.force) {
    return { ...status(cfg, s, 'active', 'Divina couldn’t reach the licence server, so this computer is still activated. Try again when you’re online.'), deactivated: false };
  }
  forgetLicence();
  return { ...status(cfg, null, cfg.required ? 'none' : 'not-required', 'Divina is deactivated on this computer. You can activate it on another one now.'), deactivated: true };
}

export const hasLicenceFile = () => existsSync(file());

/** The key and activation id, for asking Divina's data server (server side only, never the page). */
export function licenceCredentials(): { key: string; instanceId: string } | null {
  const s = read();
  if (!s) return null;
  const key = unseal('licence', s.key);
  return key ? { key, instanceId: s.instanceId } : null;
}
