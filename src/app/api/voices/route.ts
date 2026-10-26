import { ai } from '@/lib/server/ai';
import { allow } from '@/lib/server/ratelimit';
import { redactSecrets } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** The ElevenLabs voices the person's key can use, for the picker in Settings. */
export async function GET() {
  if (!ai.elevenConfigured()) return Response.json({ ok: false, message: 'Add your ElevenLabs API key first.' }, { status: 503 });
  const gate = allow('voices');
  if (!gate.ok) return Response.json({ ok: false, message: gate.message }, { status: 429 });
  try {
    return Response.json({ ok: true, voices: await ai.voices() });
  } catch (err) {
    return Response.json({ ok: false, message: redactSecrets(err instanceof Error ? err.message : String(err)) }, { status: 502 });
  }
}
