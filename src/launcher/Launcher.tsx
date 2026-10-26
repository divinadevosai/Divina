'use client';
/**
 * ⌘K launcher. Mounted OUTSIDE the HUD visibility gate so it stays
 * reachable with the HUD hidden. Ranking: prefix → initials → word
 * boundary → substring.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLauncher } from './state';
import { appItems, dynamicItems, staticItems, type Item, type Source } from './items';
import { rankAll } from '@/lib/rank';
import { capabilities } from '@/lib/client/desktop';
import { audio } from '@/audio/engine';

const TAG: Record<Source, string> = { module: 'MODULE', app: 'APP', web: 'WEB', world: 'WORLD', command: 'CMD', mac: 'DESK', ask: 'DIVINA' };

export function Launcher() {
  const open = useLauncher((s) => s.open);
  const set = useLauncher((s) => s.set);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [apps, setApps] = useState<string[]>([]);
  const [bridgeNote, setBridgeNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        audio.unlock();
        set(!useLauncher.getState().open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    audio.play('tick');
    window.setTimeout(() => input.current?.focus(), 20);
    void capabilities().then((c) => {
      if (c.ok && c.apps) {
        setApps(c.apps.apps);
        setBridgeNote(null);
      } else setBridgeNote(c.message ?? null);
    });
  }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const all = [...staticItems(), ...appItems(apps)];
    const ranked = q.trim()
      ? rankAll(q, all, (i) => [i.title, ...(i.keywords ?? [])]).map((r) => r.item)
      : all.filter((i) => i.source === 'module' || i.source === 'command').slice(0, 14);
    return [...ranked.slice(0, 12), ...dynamicItems(q)];
  }, [q, apps, open]);

  useEffect(() => setSel(0), [q]);

  const run = (i: Item | undefined) => {
    if (!i) return;
    set(false);
    audio.play('confirm');
    i.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 pt-[16vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && set(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Launcher"
            className="glass w-[min(640px,92vw)] overflow-hidden rounded-2xl"
            initial={{ y: -12, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -8, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="flex items-center gap-3 border-b border-ink-faint px-5 py-4">
              <span className="font-mono text-[11px] tracking-[0.25em] text-holo">⌘K</span>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSel((s) => Math.min(results.length - 1, s + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSel((s) => Math.max(0, s - 1));
                  } else if (e.key === 'Enter') run(results[sel]);
                  else if (e.key === 'Escape') set(false);
                }}
                placeholder="Apps, websites, modules, or ask DIVINA…"
                className="flex-1 bg-transparent text-[17px] text-ink placeholder:text-ink-lo focus:outline-none"
                aria-label="Search"
              />
            </div>
            <ul className="max-h-[52vh] overflow-y-auto py-2" role="listbox">
              {results.map((r, i) => (
                <li
                  key={r.id}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(r)}
                  className={`mx-2 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 ${i === sel ? 'bg-holo/15' : ''}`}
                >
                  <span className="text-[14.5px] text-ink">{r.title}</span>
                  <span className="flex items-center gap-3">
                    {r.hint && <span className="font-mono text-[10px] text-ink-lo">{r.hint}</span>}
                    <span className={`w-[52px] rounded border px-1.5 py-0.5 text-center font-mono text-[9px] tracking-[0.15em] ${r.source === 'ask' ? 'border-holo/50 text-holo-hi' : 'border-ink-faint text-ink-lo'}`}>{TAG[r.source]}</span>
                  </span>
                </li>
              ))}
            </ul>
            {bridgeNote && <div className="border-t border-ink-faint px-5 py-2.5 text-[11px] text-ink-lo">Desktop bridge: {bridgeNote}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
