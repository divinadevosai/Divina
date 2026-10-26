'use client';
/** The microphone appears when DIVINA wakes; the transcript is live. */
import { AnimatePresence, motion } from 'framer-motion';
import { useAI } from '@/stores/ai';

export function VoiceBar() {
  const awake = useAI((s) => s.awake);
  const status = useAI((s) => s.status);
  const hearing = useAI((s) => s.hearing);
  const show = awake && (status === 'listening' || status === 'thinking' || !!hearing);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed bottom-[92px] left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-3"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <div className="relative grid h-14 w-14 place-items-center rounded-full border border-holo/60 bg-holo/10 shadow-[0_0_40px_rgba(120,170,255,0.45)]">
            {status === 'listening' && <motion.span className="absolute inset-0 rounded-full border border-holo/50" animate={{ scale: [1, 1.6], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />}
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden>
              <rect x="5.5" y="1" width="7" height="13" rx="3.5" stroke="#cfe0ff" strokeWidth="1.4" />
              <path d="M2 10.5a7 7 0 0 0 14 0M9 17.5V21" stroke="#cfe0ff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-h-[20px] max-w-[60vw] text-center text-[15px] text-ink">{hearing || <span className="hud-label">{status === 'thinking' ? 'thinking' : 'listening'}</span>}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
