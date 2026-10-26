/**
 * "Phone me": rings the one number saved in Settings (yours) and reads a
 * short message. Loopback + same-origin + custom header, like settings, and
 * a tight daily limit because every call costs money.
 */
import type { NextRequest } from 'next/server';
import { BRIDGE_HEADER, localPageOnly } from '@/lib/server/desktop/guard';
import { allow } from '@/lib/server/ratelimit';
import { callMe, phoneConfigured } from '@/lib/server/phone';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const v = localPageOnly({
    method: req.method,
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    bridgeHeader: req.headers.get(BRIDGE_HEADER),
  });
  if (!v.ok) return Response.json({ ok: false, message: v.message }, { status: v.status });
  if (!phoneConfigured()) return Response.json({ ok: false, message: 'Phone calls aren’t set up yet. Add your Twilio details in Settings → Phone calls.' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const gate = allow('call');
  if (!gate.ok) return Response.json({ ok: false, message: gate.message }, { status: 429 });
  const r = await callMe(body?.text);
  return Response.json(r, { status: r.ok ? 200 : 502 });
}

export async function OPTIONS() {
  return new Response(null, { status: 405 });
}
