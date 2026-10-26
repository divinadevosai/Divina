/**
 * Settings, from the in-app panel. Loopback + same-origin + custom header,
 * exactly like the desktop bridge. Secrets go in, never come back out.
 */
import type { NextRequest } from 'next/server';
import { BRIDGE_HEADER, bridgeEnabled, localPageOnly } from '@/lib/server/desktop/guard';
import { publicSettings, saveSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

function check(req: NextRequest) {
  return localPageOnly({
    method: req.method,
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    bridgeHeader: req.headers.get(BRIDGE_HEADER),
  });
}

function state() {
  return {
    ok: true,
    settings: publicSettings(),
    bridge: { enabled: bridgeEnabled(), platform: process.platform, supported: process.platform === 'darwin' || process.platform === 'win32' },
  };
}

export async function GET(req: NextRequest) {
  const v = check(req);
  if (!v.ok) return Response.json({ ok: false, message: v.message }, { status: v.status });
  return Response.json(state(), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const v = check(req);
  if (!v.ok) return Response.json({ ok: false, message: v.message }, { status: v.status });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: 'Body must be JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ ok: false, message: 'Body must be an object of settings.' }, { status: 400 });
  const r = saveSettings(body as Record<string, unknown>);
  if (!r.ok) return Response.json(r, { status: 422 });
  return Response.json(state());
}

export async function OPTIONS() {
  return new Response(null, { status: 405 });
}
