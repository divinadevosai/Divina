import 'server-only';
import type { NextRequest } from 'next/server';
import { BRIDGE_HEADER, localPageOnly } from './desktop/guard';

/** Only the Divina page on this computer, with its custom header (as for Settings). */
export function pageOnly(req: NextRequest): Response | null {
  const v = localPageOnly({
    method: req.method,
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    bridgeHeader: req.headers.get(BRIDGE_HEADER),
  });
  return v.ok ? null : Response.json({ ok: false, message: v.message }, { status: v.status });
}

/** The request's JSON, or null if it isn't JSON or is over `max` characters. */
export async function jsonBody(req: NextRequest, max = 20_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > max) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
