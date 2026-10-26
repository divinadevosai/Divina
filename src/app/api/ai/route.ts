/**
 * Streaming proxy to whichever AI the person picked (Gemini, Claude or
 * OpenAI). Keys never reach the browser. The turn itself (persona, checks,
 * stream translation) lives in src/lib/ai, shared with the browser edition.
 */
import type { NextRequest } from 'next/server';
import { ai } from '@/lib/server/ai';
import { redactSecrets, setting } from '@/lib/server/settings';
import { allow } from '@/lib/server/ratelimit';
import { parseChatBody, SSE_HEADERS } from '@/lib/ai/chat';
import { ADD_KEY, agentSettings, makeAI } from '@/lib/ai/providers';
import { getAgent } from '@/lib/server/personal';

export const dynamic = 'force-dynamic';

export async function GET() {
  const online = ai.configured();
  return Response.json({ online, model: ai.label(), provider: ai.provider(), studioVoice: ai.speechConfigured() && setting('DIVINA_VOICE_MODE') !== 'fast' });
}

export async function POST(req: NextRequest) {
  if (!ai.configured()) return Response.json({ error: 'offline', message: `${ADD_KEY} to talk to Divina.` }, { status: 503 });
  const gate = allow('ai');
  if (!gate.ok) return Response.json({ error: 'limit', message: gate.message }, { status: 429 });
  const body = parseChatBody(await req.json().catch(() => null));
  if (!body) return Response.json({ error: 'bad request', message: 'Expected {history, context}.' }, { status: 400 });
  // a custom agent: its stored instructions, and its own AI or model if it has one
  const agent = getAgent(body.agent);
  if (agent) body.persona = { name: agent.name, instructions: agent.instructions };
  const brain = agent ? makeAI(agentSettings(setting, agent)) : ai;
  return new Response(await brain.chat(body, 'app', req.signal, redactSecrets), { headers: SSE_HEADERS });
}
