/**
 * "Phone me" from the page: asks this computer's Divina server to ring your
 * own number. Windows and Mac only; the browser edition has no server to
 * hold the Twilio keys.
 */
import { WEB } from '@/lib/edition';
import { useSettings } from '@/lib/client/settings';
import { log } from '@/stores/system';

export const phoneReady = () => {
  const s = useSettings.getState().data?.settings;
  return !WEB && !!(s?.TWILIO_ACCOUNT_SID?.set && s.TWILIO_AUTH_TOKEN?.set && s.TWILIO_FROM?.set && s.DIVINA_CALL_ME?.set);
};

export async function callMe(text: string): Promise<{ ok: boolean; message?: string }> {
  if (WEB) return { ok: false, message: 'Phone calls work in Divina for Windows (free at divinaos.site).' };
  try {
    const r = await fetch('/api/call', { method: 'POST', headers: { 'content-type': 'application/json', 'x-divina-bridge': '1' }, body: JSON.stringify({ text }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!j.ok) log('warn', `phone call · ${j.message ?? r.status}`);
    return { ok: !!j.ok, message: j.message };
  } catch {
    return { ok: false, message: 'Couldn’t reach Divina’s server for the call.' };
  }
}
