/**
 * The licence for the paid desktop editions (src/lib/server/licence.ts).
 *   GET                         where it stands (checks with the shop when due)
 *   POST {op:'activate', key}   activate this computer
 *   POST {op:'deactivate'}      free this computer's seat (force: also when offline)
 * Only the Divina page on this computer, with its header, may ask.
 */
import type { NextRequest } from 'next/server';
import { jsonBody, pageOnly } from '@/lib/server/pageRoute';
import { activateLicence, deactivateLicence, licenceStatus } from '@/lib/server/licence';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const refused = pageOnly(req);
  if (refused) return refused;
  return Response.json(await licenceStatus());
}

export async function POST(req: NextRequest) {
  const refused = pageOnly(req);
  if (refused) return refused;
  const b = (await jsonBody(req, 2_000)) as { op?: unknown; key?: unknown; force?: unknown } | null;
  if (b?.op === 'activate' && typeof b.key === 'string') return Response.json(await activateLicence(b.key));
  if (b?.op === 'deactivate') return Response.json(await deactivateLicence({ force: b.force === true }));
  if (b?.op === 'check') return Response.json(await licenceStatus({ force: true }));
  return Response.json({ ok: false, message: 'Unknown request.' }, { status: 400 });
}
