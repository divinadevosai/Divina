/** The person's memory, routines and custom worlds (stored encrypted on this computer). */
import type { NextRequest } from 'next/server';
import { changePersonal, loadPersonal } from '@/lib/server/personal';
import { jsonBody, pageOnly } from '@/lib/server/pageRoute';
import { isPersonalKind } from '@/lib/personalKinds';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const refused = pageOnly(req);
  if (refused) return refused;
  const { kind } = await ctx.params;
  if (!isPersonalKind(kind)) return Response.json({ ok: false, message: 'not found' }, { status: 404 });
  return Response.json({ ok: true, items: loadPersonal(kind) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const refused = pageOnly(req);
  if (refused) return refused;
  const { kind } = await ctx.params;
  if (!isPersonalKind(kind)) return Response.json({ ok: false, message: 'not found' }, { status: 404 });
  const r = changePersonal(kind, await jsonBody(req));
  return r.ok ? Response.json({ ok: true, items: r.value, message: r.message }) : Response.json(r, { status: 422 });
}
