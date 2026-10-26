/** The person's own agents (stored encrypted on this computer). */
import type { NextRequest } from 'next/server';
import { changeAgents, loadAgents } from '@/lib/server/personal';
import { jsonBody, pageOnly } from '@/lib/server/pageRoute';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return pageOnly(req) ?? Response.json({ ok: true, agents: loadAgents() }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const refused = pageOnly(req);
  if (refused) return refused;
  const r = changeAgents(await jsonBody(req));
  return r.ok ? Response.json({ ok: true, agents: r.value, message: r.message }) : Response.json(r, { status: 422 });
}
