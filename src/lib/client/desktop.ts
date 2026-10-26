/** Browser side of the desktop bridge. Same-origin fetch with the bridge header. */
export interface BridgeResult {
  ok: boolean;
  status: number;
  message: string;
  data?: unknown;
  setting?: string;
}

export async function desktop(verb: string, args: Record<string, unknown> = {}): Promise<BridgeResult> {
  try {
    const res = await fetch('/api/desktop', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-divina-bridge': '1' },
      body: JSON.stringify({ verb, args }),
    });
    const j = (await res.json()) as BridgeResult;
    return { ...j, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, message: `The Divina server is unreachable (${(err as Error).message}).` };
  }
}

export interface Capabilities {
  ok: boolean;
  enabled: boolean;
  platform: string;
  message?: string;
  apps?: { apps: string[] };
  displays?: { displays: { name: string; main: boolean; spoken: string }[] };
}

let caps: Promise<Capabilities> | null = null;
export function capabilities(refresh = false): Promise<Capabilities> {
  if (!caps || refresh) {
    caps = fetch('/api/desktop', { headers: { 'x-divina-bridge': '1' } })
      .then((r) => r.json() as Promise<Capabilities>)
      .catch(() => ({ ok: false, enabled: false, platform: 'unknown', message: 'server unreachable' }));
  }
  return caps;
}

let bridgeOk: boolean | null = null;
void (typeof window !== 'undefined' && capabilities().then((c) => (bridgeOk = c.ok)));

/**
 * Open a link: in its own window on the second display through the bridge,
 * or — when the bridge is off or unsupported — in a new tab, directly
 * from the click so the popup is not blocked.
 */
/** Only ordinary web addresses: a javascript: or data: link would run inside Divina. */
export function webUrl(raw: string): string | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

export function openLink(raw: string) {
  const url = webUrl(raw);
  if (!url) return;
  if (bridgeOk === false || bridgeOk === null) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  void desktop('open_url', { url }).then((r) => {
    if (!r.ok) window.open(url, '_blank', 'noopener');
  });
}
