'use client';
/** Detail panel for the opened card. Slides in once the settle beat begins. */
import { AnimatePresence, motion } from 'framer-motion';
import { useRing } from '@/stores/ring';
import { useData } from '@/stores/data';
import { useEmbody } from '@/stores/embody';
import { MODULE_BY_ID, moduleIndex } from '@/modules/meta';
import { ModuleBody } from '@/modules/panels';
import { Provenance } from '@/modules/panels/kit';
import { warningOf } from '@/modules/warnings';
import { bus } from '@/core/bus';
import { useCompact } from './useCompact';
import { shareCard } from './ShareCard';

export function ModulePanel() {
  const expanded = useRing((s) => s.expanded);
  const embodied = useEmbody((s) => s.phase !== 'NORMAL');
  const md = useData((s) => (expanded ? s.modules[expanded] : undefined));
  const id = embodied ? null : expanded;
  const meta = id ? MODULE_BY_ID[id] : null;
  const warn = id ? warningOf(id, md) : null;
  const compact = useCompact();
  return (
    <AnimatePresence>
      {id && meta && (
        <motion.aside
          key={id}
          className={
            compact
              ? 'glass fixed inset-x-2 bottom-[calc(max(16px,env(safe-area-inset-bottom))+56px)] z-30 flex max-h-[52dvh] flex-col rounded-2xl'
              : 'glass fixed right-[4vw] top-[11vh] z-30 flex max-h-[78vh] w-[min(560px,46vw)] flex-col rounded-2xl'
          }
          initial={compact ? { opacity: 0, y: 40 } : { opacity: 0, x: 40, filter: 'blur(8px)' }}
          animate={compact ? { opacity: 1, y: 0 } : { opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={compact ? { opacity: 0, y: 30 } : { opacity: 0, x: 30, filter: 'blur(6px)' }}
          transition={{ type: 'spring', stiffness: 170, damping: 24 }}
          aria-label={`${meta.title} details`}
        >
          <header className="flex items-start justify-between px-6 pb-3 pt-5">
            <div>
              <div className="hud-label">
                {meta.code} · {String(moduleIndex(id) + 1).padStart(2, '0')}
              </div>
              <h2 className="mt-1 text-[24px] font-medium text-ink">{meta.title}</h2>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => shareCard(id)} className="rounded-full border border-ink-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mid hover:text-ink" aria-label={`Share the ${meta.title} card`}>
                share
              </button>
              <button onClick={() => bus.emit({ type: 'collapse', source: 'mouse' })} className="rounded-full border border-ink-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mid hover:text-ink" aria-label="Close">
                esc
              </button>
            </div>
          </header>
          {warn && <div className="mx-6 mb-2 rounded-md border border-warn/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-warn">⚠ {warn}</div>}
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <ModuleBody id={id} md={md} hue={meta.hue} />
          </div>
          <div className="px-6 pb-4">
            <Provenance source={md?.source} at={md?.fetchedAt} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
