/**
 * Backup and restore. The file is sealed with the person's passphrase on this
 * computer; the passphrase is never stored. Restoring checks every value like
 * any other input, so a doctored file can only set what Settings could.
 */
import type { NextRequest } from 'next/server';
import { jsonBody, pageOnly } from '@/lib/server/pageRoute';
import { saveSettings, savedSettings } from '@/lib/server/settings';
import { loadAgents, loadNotes, loadPersonal, replaceAgents, replaceNotes, replacePersonal } from '@/lib/server/personal';
import { BACKUP_PREFS, openBackup, restorable, sealBackup, type BackupPayload } from '@/lib/backup';
import { SECRET, SETTING_KEYS } from '@/lib/settingsSchema';

export const dynamic = 'force-dynamic';

const pick = (o: unknown, keys: readonly string[]) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k]) => keys.includes(k)));

export async function POST(req: NextRequest) {
  const refused = pageOnly(req);
  if (refused) return refused;
  const b = (await jsonBody(req, 5_100_000)) as { op?: string; passphrase?: unknown; includeKeys?: unknown; prefs?: unknown; file?: unknown } | null;
  const passphrase = typeof b?.passphrase === 'string' ? b.passphrase : '';
  try {
    if (b?.op === 'export') {
      const includeKeys = b.includeKeys === true;
      const payload: BackupPayload = {
        format: 'divina-backup',
        v: 1,
        created: new Date().toISOString(),
        edition: 'app',
        settings: savedSettings(includeKeys),
        hasKeys: includeKeys,
        notes: loadNotes(),
        agents: loadAgents(),
        memory: loadPersonal('memory'),
        routines: loadPersonal('routines'),
        worlds: loadPersonal('worlds'),
        prefs: pick(b.prefs, BACKUP_PREFS),
      };
      return Response.json({ ok: true, file: await sealBackup(payload, passphrase) });
    }
    if (b?.op === 'import') {
      if (typeof b.file !== 'string' || b.file.length > 5_000_000) return Response.json({ ok: false, message: 'That file is too big to be a Divina backup.' }, { status: 422 });
      const p = await openBackup(b.file, passphrase);
      const settings = Object.fromEntries(Object.entries(p.settings ?? {}).filter(([k, v]) => (SETTING_KEYS as readonly string[]).includes(k) && typeof v === 'string' && restorable(k, p, SECRET)));
      // one value that isn't allowed must not stop the rest
      let skipped = 0;
      for (const [k, v] of Object.entries(settings)) if (!saveSettings({ [k]: v }).ok) skipped++;
      replaceNotes(p.notes);
      replaceAgents(p.agents);
      replacePersonal('memory', p.memory);
      replacePersonal('routines', p.routines);
      replacePersonal('worlds', p.worlds);
      return Response.json({ ok: true, prefs: pick(p.prefs, BACKUP_PREFS), message: `Restored your backup from ${new Date(p.created).toLocaleDateString()}${p.hasKeys ? ', including your keys' : ''}.${skipped ? ` ${skipped} setting${skipped === 1 ? ' was' : 's were'} skipped.` : ''}` });
    }
    return Response.json({ ok: false, message: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, message: err instanceof Error ? err.message : 'That didn’t work.' }, { status: 422 });
  }
}
