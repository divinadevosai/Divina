import type { NextRequest } from 'next/server';
import { ai } from '@/lib/server/ai';
import { allow } from '@/lib/server/ratelimit';
import { redactSecrets, setting } from '@/lib/server/settings';
import { agentSettings, makeAI } from '@/lib/ai/providers';
import { getAgent } from '@/lib/server/personal';

export const dynamic = 'force-dynamic';

/** Studio voice (Gemini, OpenAI or ElevenLabs): raw 16-bit PCM, played through the page's audio graph. */
export async function POST(req: NextRequest) {
  if (!ai.speechConfigured()) return Response.json({ error: 'offline' }, { status: 503 });
  const gate = allow('tts');
  if (!gate.ok) return Response.json({ error: 'limit', message: gate.message }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { text?: unknown; agent?: unknown } | null;
  const text = body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) return Response.json({ error: 'bad text' }, { status: 400 });
  try {
    const agent = typeof body?.agent === 'string' ? getAgent(body.agent) : undefined;
    const { pcm, sampleRate } = await (agent ? makeAI(agentSettings(setting, agent)) : ai).speech(text);
    return new Response(new Uint8Array(pcm), { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(sampleRate), 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: redactSecrets(err instanceof Error ? err.message : String(err)) }, { status: 502 });
  }
}
