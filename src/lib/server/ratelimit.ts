/**
 * Spending guard. Every call that costs money on your own AI or voice key passes
 * through here, so a runaway loop, a stuck page or anything misbehaving
 * cannot quietly burn through your quota or bill.
 *
 * Limits are generous for one person talking to Divina. Override the daily
 * caps with DIVINA_AI_DAILY_LIMIT / DIVINA_TTS_DAILY_LIMIT in .env.local.
 */
import 'server-only';

interface Bucket {
  minute: number[];
  day: { date: string; count: number };
}

const buckets = new Map<string, Bucket>();

const LIMITS = {
  ai: { perMinute: 20, perDay: () => Number(process.env.DIVINA_AI_DAILY_LIMIT ?? 400) },
  tts: { perMinute: 90, perDay: () => Number(process.env.DIVINA_TTS_DAILY_LIMIT ?? 2000) },
  summary: { perMinute: 6, perDay: () => 150 },
  voices: { perMinute: 10, perDay: () => 200 },
  // phone calls cost real money per minute, so these are tight
  call: { perMinute: 2, perDay: () => Number(process.env.DIVINA_CALL_DAILY_LIMIT ?? 12) },
} as const;

export type LimitKind = keyof typeof LIMITS;

export function allow(kind: LimitKind): { ok: true } | { ok: false; message: string } {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const b = buckets.get(kind) ?? { minute: [], day: { date: today, count: 0 } };
  buckets.set(kind, b);
  if (b.day.date !== today) b.day = { date: today, count: 0 };
  b.minute = b.minute.filter((t) => now - t < 60_000);
  const lim = LIMITS[kind];
  if (b.minute.length >= lim.perMinute) return { ok: false, message: 'That’s a lot of requests in one minute — give me a moment.' };
  if (b.day.count >= lim.perDay()) {
    const [what, env] = kind === 'tts' ? ['the natural voice', 'TTS'] : kind === 'call' ? ['phone calls', 'CALL'] : ['AI requests', 'AI'];
    return { ok: false, message: `Today’s safety limit for ${what} is reached (it resets at midnight UTC). Raise DIVINA_${env}_DAILY_LIMIT in .env.local if you need more.` };
  }
  b.minute.push(now);
  b.day.count++;
  return { ok: true };
}
