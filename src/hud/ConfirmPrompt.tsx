'use client';
import { useT } from '@/lib/i18n';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useConfirm } from '@/stores/confirm';

/** "Divina wants to …  [Allow] [Deny]" — Enter allows, Esc denies. */
export function ConfirmPrompt() {
  const tr = useT();
  const pending = useConfirm((s) => s.pending);
  const answer = useConfirm((s) => s.answer);
  useEffect(() => {
    if (!pending) return;
    // The Enter that sent a command can still be travelling up the page when this prompt
    // appears; it must not count as "Allow". Only keys pressed after the prompt is on screen do.
    const shownAt = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.timeStamp < shownAt + 400) return;
      if (e.key === 'Enter') answer(true);
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, answer]);
  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          role="alertdialog"
          aria-label="Confirm action"
          className="fixed left-1/2 top-[18vh] z-[60] w-[min(460px,92vw)] -translate-x-1/2 rounded-2xl border border-holo/40 bg-[#070b16]/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          <div className="hud-label !text-holo-hi">{tr('divinaWants')}</div>
          <div className="mt-2 text-[17px] leading-snug text-ink">{pending.title}</div>
          {pending.detail && <div className="mt-1 break-all font-mono text-[12px] text-ink-mid">{pending.detail}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => answer(false)} className="rounded-lg border border-ink-faint px-4 py-2 text-[13px] text-ink-mid hover:text-ink">
              {tr('deny')}
            </button>
            <button onClick={() => answer(true)} className="rounded-lg border border-holo/60 bg-holo/15 px-4 py-2 text-[13px] text-ink">
              {tr('allow')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
