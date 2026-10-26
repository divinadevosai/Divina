'use client';
import { useState } from 'react';
import type { NotesData } from '../types';
import { Section } from './kit';
import { notesOp } from '@/lib/client/personal';
import { MAX_NOTE } from '@/lib/personal';

const input = 'w-full rounded-lg border border-ink-faint bg-black/20 px-3 py-2 text-[15px] text-ink placeholder:text-ink-lo focus:border-holo/60 focus:outline-none';
const button = 'rounded-lg border border-holo/50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-holo-hi hover:bg-holo/10 disabled:opacity-40';

/** Your notes and to-dos: add, tick, remove. Kept encrypted on this device. */
export function NotesPanel({ d }: { d: NotesData; hue: number }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (op: Record<string, unknown>) => {
    const r = await notesOp(op);
    setMsg(r.ok ? null : (r.message ?? 'Couldn’t save that.'));
    return r.ok;
  };
  const add = async () => {
    if (text.trim() && (await run({ op: 'add', text }))) setText('');
  };
  const open = d.notes.filter((n) => !n.done);
  const done = d.notes.filter((n) => n.done);
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          className={input}
          value={text}
          maxLength={MAX_NOTE}
          placeholder="Add a note or a to-do…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          aria-label="New note"
        />
        <button className={button} onClick={() => void add()} disabled={!text.trim()}>
          add
        </button>
      </div>
      {msg && <p className="text-[12px] text-warn">{msg}</p>}
      <Section title={`to do · ${open.length}`}>
        {open.length ? (
          <ul className="space-y-1">
            {open.map((n) => (
              <Item key={n.id} text={n.text} done={false} onToggle={() => void run({ op: 'done', id: n.id })} onRemove={() => void run({ op: 'remove', id: n.id })} />
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-mid">Nothing to do. Say “add milk to my list”, or type above.</p>
        )}
      </Section>
      {done.length > 0 && (
        <Section title={`done · ${done.length}`}>
          <ul className="space-y-1">
            {done.map((n) => (
              <Item key={n.id} text={n.text} done onToggle={() => void run({ op: 'undone', id: n.id })} onRemove={() => void run({ op: 'remove', id: n.id })} />
            ))}
          </ul>
          <button className={`${button} mt-3 !border-ink-faint !text-ink-lo`} onClick={() => void run({ op: 'clear_done' })}>
            clear ticked
          </button>
        </Section>
      )}
      <p className="text-[12px] leading-relaxed text-ink-lo">Saved only on this device, encrypted. Try: “tick off milk”, “what’s on my list?”, “remove milk from my list”.</p>
    </div>
  );
}

function Item({ text, done, onToggle, onRemove }: { text: string; done: boolean; onToggle: () => void; onRemove: () => void }) {
  return (
    <li className="group flex items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]">
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark “${text}” as not done` : `Tick off “${text}”`}
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[12px] ${done ? 'border-ink-faint text-ink-lo' : 'border-holo/70 text-transparent hover:text-holo/50'}`}
      >
        ✓
      </button>
      <span className={`flex-1 break-words text-[15px] leading-snug ${done ? 'text-ink-lo line-through' : 'text-ink'}`}>{text}</span>
      <button onClick={onRemove} aria-label={`Remove “${text}”`} className="px-1 text-[13px] text-ink-lo opacity-60 hover:text-ink hover:opacity-100">
        ✕
      </button>
    </li>
  );
}
