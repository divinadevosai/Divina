import type { NextRequest } from 'next/server';
import { guard, bridgeEnabled, BRIDGE_HEADER, dispatch, VERBS, liveDeps } from '@/lib/server/desktop';

export const dynamic = 'force-dynamic';

function check(req: NextRequest) {
  return guard({
    method: req.method,
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    bridgeHeader: req.headers.get(BRIDGE_HEADER),
    platform: process.platform,
    enabled: bridgeEnabled(),
  });
}

/** Capabilities: what this machine can do right now. */
export async function GET(req: NextRequest) {
  const v = check(req);
  // Capability probes answer 200 with ok:false so the page can explain the
  // situation without a console error; verbs (POST) keep real status codes.
  if (!v.ok) return Response.json({ ok: false, status: v.status, enabled: bridgeEnabled(), platform: process.platform, message: v.message }, { status: v.status === 501 || /off/.test(v.message) ? 200 : v.status });
  const [apps, displays] = await Promise.all([dispatch('list_apps', {}, liveDeps), dispatch('list_displays', {}, liveDeps)]);
  return Response.json({ ok: true, enabled: true, platform: process.platform, verbs: VERBS, apps: apps.data, displays: displays.data });
}

export async function POST(req: NextRequest) {
  const v = check(req);
  if (!v.ok) return Response.json({ ok: false, status: v.status, message: v.message }, { status: v.status });
  let body: { verb?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, status: 400, message: 'Body must be JSON: {"verb": "...", "args": {...}}' }, { status: 400 });
  }
  const result = await dispatch(body.verb, body.args, liveDeps);
  return Response.json(result, { status: result.status });
}

// No CORS: preflights get a bare 405 and no Access-Control-Allow-* headers.
export async function OPTIONS() {
  return new Response(null, { status: 405 });
}
