'use client';
import { useState } from 'react';
import type { AIData } from '../types';
import { useAI } from '@/stores/ai';
import { handle } from '@/ai/assistant';
import { Section } from './kit';

export function AIPanel({ d }: { d: AIData; hue: number }) {
  const history = useAI((s) => s.history);
  const status = useAI((s) => s.status);
  const [q, setQ] = useState('');
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] text-ink">{d.online ? d.model : 'local command engine'}</div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-holo-hi">{status}</div>
      </div>
      {!d.online && <p className="text-[13px] leading-relaxed text-ink-mid">Add your own API key for Gemini, Claude or OpenAI in ⚙ Settings → AI to connect a model. Commands, modules, the room and desktop control all work without it.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handle(q, 'palette');
          setQ('');
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search knowledge, reason, summarise, get code help…" className="flex-1 rounded-lg border border-ink-faint bg-transparent px-3 py-2 text-[14px] text-ink placeholder:text-ink-lo focus:border-holo/60 focus:outline-none" aria-label="Ask DIVINA" />
        <button className="rounded-lg border border-holo/40 px-3 font-mono text-[11px] uppercase text-holo-hi">ask</button>
      </form>
      <Section title="conversation">
        <ol className="max-h-[38vh] space-y-3 overflow-y-auto pr-2">
          {history.length === 0 && <li className="text-[13px] text-ink-lo">Nothing yet. Say “Divina” or type above.</li>}
          {history.slice(-20).map((t, i) => (
            <li key={i} className={`text-[13.5px] leading-relaxed ${t.role === 'user' ? 'text-ink' : 'text-ink-mid'}`}>
              <span className="mr-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-lo">{t.role === 'user' ? 'you' : 'divina'}</span>
              <span className="whitespace-pre-wrap">{t.text}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
