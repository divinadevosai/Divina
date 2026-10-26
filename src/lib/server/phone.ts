/**
 * Phone calls to your own number, through your own Twilio account. Divina
 * reads a short message out loud when you answer. There is no "to" anywhere
 * in this file's inputs: the only number it can ever ring is DIVINA_CALL_ME,
 * so nothing (a routine, a page, a bad AI reply) can make it call anyone else.
 */
import 'server-only';
import { redactSecrets, setting } from './settings';
import { HttpError } from './http';

export const MAX_CALL_TEXT = 600;

export function phoneConfigured(): boolean {
  return !!(setting('TWILIO_ACCOUNT_SID') && setting('TWILIO_AUTH_TOKEN') && setting('TWILIO_FROM') && setting('DIVINA_CALL_ME'));
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Printable text only, short enough for a call. */
export function cleanCallText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CALL_TEXT);
}

/** What the call says: the message, a pause, then the message again in case the first words were missed. */
export function callScript(text: string): string {
  const say = `<Say voice="Polly.Amy" language="en-GB">${xml(text)}</Say>`;
  return `<Response><Pause length="1"/><Say voice="Polly.Amy" language="en-GB">Hi, it’s Divina.</Say>${say}<Pause length="1"/>${say}<Say voice="Polly.Amy" language="en-GB">Bye for now.</Say></Response>`;
}

export async function callMe(rawText: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!phoneConfigured()) return { ok: false, message: 'Phone calls aren’t set up yet. Add your Twilio details in Settings → Phone calls.' };
  const text = cleanCallText(rawText);
  if (!text) return { ok: false, message: 'There’s nothing to say on the call.' };
  const sid = setting('TWILIO_ACCOUNT_SID')!;
  const token = setting('TWILIO_AUTH_TOKEN')!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({ To: setting('DIVINA_CALL_ME')!, From: setting('TWILIO_FROM')!, Twiml: callScript(text), Timeout: '30' }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new HttpError(res.status, body?.message ? `Twilio said: ${body.message}` : `HTTP ${res.status} from Twilio`);
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'AbortError' ? 'Twilio didn’t answer in time.' : err.message) : String(err);
    return { ok: false, message: redactSecrets(msg) };
  } finally {
    clearTimeout(timer);
  }
}
