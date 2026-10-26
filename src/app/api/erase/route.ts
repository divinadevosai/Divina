/**
 * Delete everything Divina keeps on this computer (Settings → Privacy &
 * cookies → Delete everything): settings and keys, the vault key, notes,
 * agents, memory, routines, worlds and the person's own calendar and
 * portfolio files. Only the Divina page, with its header, may ask, and it
 * has to say so explicitly.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { jsonBody, pageOnly } from '@/lib/server/pageRoute';
import { userDataDir } from '@/lib/server/paths';
import { forgetKey } from '@/lib/server/vault';
import { deactivateLicence } from '@/lib/server/licence';
import { PERSONAL_KINDS } from '@/lib/personalKinds';

export const dynamic = 'force-dynamic';

const FILES = ['settings.local.json', 'vault.key', 'notes.local.json', 'agents.local.json', ...Object.keys(PERSONAL_KINDS).map((k) => `${k}.local.json`), 'calendar.ics', 'portfolio.json'];

export async function POST(req: NextRequest) {
  const refused = pageOnly(req);
  if (refused) return refused;
  const b = (await jsonBody(req)) as { confirm?: unknown } | null;
  if (b?.confirm !== 'erase') return Response.json({ ok: false, message: 'Say {"confirm":"erase"} to delete everything.' }, { status: 400 });
  // free this computer's licence seat first, while the key can still be read
  await deactivateLicence({ force: true });
  const dir = userDataDir();
  if (existsSync(dir)) {
    // the named files, their half-written copies, and keys set aside as unreadable
    for (const f of readdirSync(dir)) {
      if (FILES.some((n) => f === n || f === `${n}.tmp`) || f.startsWith('vault.key.unreadable-')) rmSync(join(dir, f), { force: true });
    }
  }
  forgetKey({ destroy: true });
  return Response.json({ ok: true, message: 'Deleted everything Divina kept on this computer.' });
}
