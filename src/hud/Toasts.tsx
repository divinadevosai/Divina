'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useToasts } from '@/stores/toasts';
import { useCompact } from './useCompact';

/** Every failure explains what to do about it — here, and out loud. */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const compact = useCompact();
  return (
    <div
      className={`pointer-events-none fixed z-40 flex flex-col gap-2 ${compact ? 'inset-x-3 top-[calc(max(16px,env(safe-area-inset-top))+48px)]' : 'right-7 top-[140px] w-[340px]'}`}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={`glass pointer-events-auto rounded-xl p-3 ${t.kind === 'warn' ? 'border-warn/40' : ''}`}
            onClick={() => dismiss(t.id)}
          >
            <div className={`text-[13px] leading-snug ${t.kind === 'warn' ? 'text-warn' : 'text-ink'}`}>{t.text}</div>
            {t.detail && <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] text-ink-lo">{t.detail}</div>}
            {t.image && <img src={t.image} alt="Screen capture" className="mt-2 w-full rounded-md border border-ink-faint" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
