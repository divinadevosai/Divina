'use client';
import type { EmailData } from '../types';
import { fmt } from '../format';
import { LinkButton, Section, Stat } from './kit';
import { openLink } from '@/lib/client/desktop';

/** The inbox at a glance. Read-only: Divina never sends, moves or deletes mail. */
export function EmailPanel({ d }: { d: EmailData; hue: number }) {
  return (
    <div className="space-y-5">
      <Stat label="unread" value={d.unread} sub={d.address} />
      <Section title="latest" right={d.webUrl ? <LinkButton href={d.webUrl} onOpen={openLink}>open inbox</LinkButton> : undefined}>
        <ul className="space-y-3">
          {d.messages.map((m) => (
            <li key={m.id} className="leading-snug">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-[14px] ${m.unread ? 'text-ink' : 'text-ink-mid'}`}>
                  {m.unread && <span className="mr-1.5 text-holo-hi">●</span>}
                  {m.from}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-ink-lo">{fmt.age(m.at)}</span>
              </div>
              <div className="truncate text-[13px] text-ink-lo">{m.subject || '(no subject)'}</div>
            </li>
          ))}
          {!d.messages.length && <li className="text-[14px] text-ink-mid">Your inbox is empty.</li>}
        </ul>
      </Section>
      <p className="text-[12px] text-ink-lo">Read on this computer only. Divina never sends, moves or deletes your mail.</p>
    </div>
  );
}
