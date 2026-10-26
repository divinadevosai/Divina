'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { NewsData } from '../types';
import { fmt } from '../format';
import { Section } from './kit';
import { openLink } from '@/lib/client/desktop';

/** Cards stack; swipe (or ←/→ buttons) through articles. */
export function NewsPanel({ d }: { d: NewsData; hue: number }) {
  const [i, setI] = useState(0);
  const a = d.articles[i];
  return (
    <div className="space-y-5">
      {d.digest && (
        <p className="text-[15px] leading-relaxed text-ink">
          <span className="hud-label mr-2 !text-holo">digest</span>
          {d.digest}
        </p>
      )}
      <div className="relative h-[168px]">
        {d.articles.slice(i + 1, i + 3).map((x, k) => (
          <div key={x.id} className="glass absolute inset-x-0 top-0 h-full rounded-xl" style={{ transform: `translateY(${(k + 1) * 9}px) scale(${1 - (k + 1) * 0.035})`, opacity: 0.5 - k * 0.2, zIndex: -k - 1 }} />
        ))}
        <AnimatePresence mode="popLayout" initial={false}>
          {a && (
            <motion.article
              key={a.id}
              className="glass absolute inset-0 cursor-grab rounded-xl p-5 active:cursor-grabbing"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) setI((v) => Math.min(d.articles.length - 1, v + 1));
                if (info.offset.x > 60) setI((v) => Math.max(0, v - 1));
              }}
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              <div className="hud-label">
                {a.site} · {a.points} points · {a.comments} comments · {fmt.age(a.at)}
              </div>
              <h3 className="mt-3 text-[20px] font-medium leading-snug text-ink">{a.title}</h3>
              <button onClick={() => openLink(a.url)} className="mt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-holo-hi hover:underline">
                open article →
              </button>
            </motion.article>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between font-mono text-[11px] text-ink-lo">
        <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} className="disabled:opacity-30">← prev</button>
        <span className="tabular">{i + 1} / {d.articles.length}</span>
        <button onClick={() => setI((v) => Math.min(d.articles.length - 1, v + 1))} disabled={i >= d.articles.length - 1} className="disabled:opacity-30">next →</button>
      </div>
      <Section title="all stories">
        <ul className="space-y-2">
          {d.articles.map((x, k) => (
            <li key={x.id}>
              <button onClick={() => setI(k)} className={`w-full text-left text-[13px] leading-snug ${k === i ? 'text-ink' : 'text-ink-mid hover:text-ink'}`}>
                <span className="mr-2 font-mono text-[10px] text-ink-lo tabular">{String(k + 1).padStart(2, '0')}</span>
                {x.title}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
