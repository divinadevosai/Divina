'use client';
/** Booting into an operating system, not opening a web page. One beat drives it. */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { boot, BOOT_BEAT } from '@/core/motion/vocabulary';
import { EXTENSION } from '@/lib/edition';

const LINES = [
  'DIVINA SPATIAL OS 0.7',
  'master clock ............ locked',
  'render graph ............ webgl2',
  'gesture engine .......... standby',
  'voice ................... standby',
  'module bus .............. 10 modules',
  'desktop bridge .......... guarded',
  'world ................... minimal studio',
];

export function Boot() {
  const [n, setN] = useState(0);
  // a new tab goes straight to the room: no boot log to read every time
  const [done, setDone] = useState(EXTENSION);
  useEffect(() => {
    if (EXTENSION) return;
    const ids = LINES.map((_, i) => window.setTimeout(() => setN(i + 1), (boot.logStart + i * boot.logLineEvery) * 1000 + 120));
    ids.push(window.setTimeout(() => setDone(true), boot.worldFadeIn * 1000 + LINES.length * 40));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);
  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-void"
          exit={{ opacity: 0 }}
          transition={{ duration: BOOT_BEAT * 3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-[340px] font-mono text-[11px] leading-[1.8] text-ink-mid">
            {LINES.slice(0, n).map((l, i) => (
              <motion.div key={l} initial={{ opacity: 0, x: -6 }} animate={{ opacity: i === 0 ? 1 : 0.8, x: 0 }} transition={{ duration: BOOT_BEAT * 0.6 }} className={i === 0 ? 'mb-2 tracking-[0.35em] text-ink' : ''}>
                {l}
              </motion.div>
            ))}
            <motion.div className="mt-3 h-px bg-holo/60" initial={{ scaleX: 0 }} animate={{ scaleX: n / LINES.length }} style={{ transformOrigin: 'left' }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
