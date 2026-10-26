/**
 * Request guard for the desktop bridge. The bridge is a remote-code-execution
 * surface; these checks run before any verb is even parsed.
 *
 *   1. Off unless DIVINA_DESKTOP_BRIDGE=1.
 *   2. Loopback only: the Host header must name a loopback address.
 *      (Also defeats DNS-rebinding: a rebound hostname is not "localhost".)
 *   3. Same-origin only: a cross-origin page CAN reach a loopback server, so
 *      Origin must equal this server's own origin, Sec-Fetch-Site (when sent)
 *      must be same-origin, and a custom header is required so any
 *      cross-origin attempt needs a CORS preflight we never grant.
 *   4. macOS and Windows only: every other platform gets a clean 501.
 */

export const BRIDGE_HEADER = 'x-divina-bridge';

export function bridgeEnabled(): boolean {
  return process.env.DIVINA_DESKTOP_BRIDGE === '1';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function hostnameOf(host: string | null): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 0 ? h.slice(0, end + 1) : null;
  }
  return h.split(':')[0];
}

export function isLoopbackHost(host: string | null): boolean {
  const h = hostnameOf(host);
  return !!h && LOOPBACK_HOSTS.has(h);
}

export interface GuardInput {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  bridgeHeader: string | null;
  platform: NodeJS.Platform;
  enabled: boolean;
}

export type GuardVerdict = { ok: true } | { ok: false; status: 403 | 501; message: string };

export function guard(i: GuardInput): GuardVerdict {
  if (!isLoopbackHost(i.host)) {
    return { ok: false, status: 403, message: 'The desktop bridge only answers on loopback (localhost / 127.0.0.1).' };
  }
  if (i.secFetchSite && i.secFetchSite !== 'same-origin') {
    return { ok: false, status: 403, message: 'Cross-site requests to the desktop bridge are refused.' };
  }
  if (i.method !== 'GET' || i.origin) {
    // Browsers always send Origin on POST. A missing or foreign one is refused.
    let same = false;
    try {
      const o = new URL(i.origin ?? '');
      same = o.host.toLowerCase() === (i.host ?? '').toLowerCase() && isLoopbackHost(o.host);
    } catch {
      same = false;
    }
    if (!same) return { ok: false, status: 403, message: 'The desktop bridge only accepts requests from the Divina page itself.' };
  }
  if (i.bridgeHeader !== '1') {
    return { ok: false, status: 403, message: `Missing ${BRIDGE_HEADER} header.` };
  }
  if (!i.enabled) {
    return { ok: false, status: 403, message: 'The desktop bridge is off. Start the server with DIVINA_DESKTOP_BRIDGE=1 to enable it.' };
  }
  if (i.platform !== 'darwin' && i.platform !== 'win32') {
    return { ok: false, status: 501, message: `Desktop control supports macOS and Windows; this server runs on ${i.platform}. Everything else keeps working.` };
  }
  return { ok: true };
}

/**
 * The same page-origin checks without the bridge's on/off and platform
 * rules: used by the Settings API, which only the Divina page itself on this
 * machine may read or change.
 */
export function localPageOnly(i: Omit<GuardInput, 'platform' | 'enabled'>): GuardVerdict {
  const v = guard({ ...i, platform: 'darwin', enabled: true });
  return v.ok ? v : { ...v, message: v.message.replace('The desktop bridge', 'Settings').replace('the desktop bridge', 'Settings') };
}
