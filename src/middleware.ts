/**
 * Gatekeeper for every /api route.
 *
 * The server only listens on 127.0.0.1, so other machines cannot connect at
 * all. This covers the other way in: web pages open in YOUR browser. Any
 * site can fire requests at http://localhost:3000; browsers label them, and
 * we refuse the ones that did not come from Divina's own page:
 *   - Host must be a loopback name (defeats DNS rebinding)
 *   - Sec-Fetch-Site, when present, must be same-origin or none
 *   - Origin, when present, must be this server; POST etc. must send it
 * Routes that change things (settings, desktop) add a custom-header check.
 */
import { NextResponse, type NextRequest } from 'next/server';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(host: string | null) {
  if (!host) return '';
  const h = host.toLowerCase();
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
}

export function middleware(req: NextRequest) {
  const host = req.headers.get('host');
  if (!LOOPBACK.has(hostname(host))) {
    return NextResponse.json({ ok: false, message: 'Divina only answers on this computer (localhost).' }, { status: 403 });
  }
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ ok: false, message: 'Requests from other websites are refused.' }, { status: 403 });
  }
  const origin = req.headers.get('origin');
  // Anything that changes state or spends the AI key must name its origin:
  // browsers always send Origin on POST, so a request without one is not
  // the Divina page.
  if (!origin && req.method !== 'GET' && req.method !== 'HEAD') {
    return NextResponse.json({ ok: false, message: 'Requests from other websites are refused.' }, { status: 403 });
  }
  if (origin) {
    let same = false;
    try {
      same = new URL(origin).host.toLowerCase() === (host ?? '').toLowerCase();
    } catch {
      same = false;
    }
    if (!same) return NextResponse.json({ ok: false, message: 'Requests from other websites are refused.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
