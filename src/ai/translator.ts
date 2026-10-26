/**
 * Live translator. While it's on, everything heard is translated and spoken
 * in the other language instead of being treated as a command. "Take turns"
 * swaps the direction after each line, for a conversation between two people.
 */
import { create } from 'zustand';
import { LANG_BY_CODE } from '@/lib/languages';

interface TranslateState {
  on: boolean;
  from: string;
  to: string;
  /** swap after each line: a two-way conversation */
  turns: boolean;
  last: { heard: string; said: string; from: string; to: string } | null;
  busy: boolean;
}

export const useTranslator = create<TranslateState>(() => ({ on: false, from: 'en', to: 'es', turns: false, last: null, busy: false }));

const HEADERS = { 'content-type': 'application/json' };

/** Translate one line with the person's own AI. Tools are never run here. */
export async function translateLine(text: string, from: string, to: string): Promise<string> {
  const r = await fetch('/api/ai', { method: 'POST', headers: HEADERS, body: JSON.stringify({ history: [{ role: 'user', text }], context: '', translate: { from, to } }) });
  if (r.status === 503) throw new Error('The translator needs an AI connected. Add your own key in Settings, under AI.');
  if (!r.ok || !r.body) throw new Error(`The translator couldn’t reach your AI (HTTP ${r.status}).`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /event: (\w+)/.exec(block)?.[1];
      const data = JSON.parse(/data: (.*)/s.exec(block)?.[1] ?? '{}') as { text?: string; message?: string };
      if (ev === 'token' && data.text) out += data.text;
      if (ev === 'error' && !out) throw new Error(data.message ?? 'The translator didn’t get an answer.');
    }
  }
  return out.trim().replace(/^["“]|["”]$/g, '');
}

export const langName = (code: string) => LANG_BY_CODE[code]?.name ?? code;
export const langTag = (code: string) => LANG_BY_CODE[code]?.tag ?? 'en-GB';
