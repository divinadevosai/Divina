'use client';
/** The translator on screen: both languages, the last line in big type for the other person, swap and stop. */
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslator, langName } from '@/ai/translator';
import { LANGUAGES } from '@/lib/languages';
import { setTranslator, stopTranslator, swapTranslator } from '@/ai/assistant';
import { useCompact } from './useCompact';
import { useT } from '@/lib/i18n';

const btn = 'rounded-full border border-ink-faint px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mid hover:text-ink';

export function TranslatorBar() {
  const t = useTranslator();
  const compact = useCompact();
  const tr = useT();
  return (
    <AnimatePresence>
      {t.on && (
        <motion.div
          key="translator"
          className={`glass fixed left-1/2 z-40 w-[min(760px,94vw)] -translate-x-1/2 rounded-2xl p-4 ${compact ? 'top-[calc(max(16px,env(safe-area-inset-top))+52px)]' : 'top-24'}`}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          role="region"
          aria-label="Live translator"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="hud-label !text-holo-hi">{tr('translator')}</span>
            <select className="rounded-lg border border-ink-faint bg-black/30 px-2 py-1 text-[13px] text-ink" value={t.from} onChange={(e) => setTranslator(e.target.value, t.to, t.turns)} aria-label="From">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native}
                </option>
              ))}
            </select>
            <button className={btn} onClick={() => swapTranslator()} aria-label="Swap languages">
              ⇄
            </button>
            <select className="rounded-lg border border-ink-faint bg-black/30 px-2 py-1 text-[13px] text-ink" value={t.to} onChange={(e) => setTranslator(t.from, e.target.value, t.turns)} aria-label="To">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native}
                </option>
              ))}
            </select>
            <label className="ml-1 flex items-center gap-1.5 text-[12px] text-ink-mid">
              <input type="checkbox" checked={t.turns} onChange={(e) => setTranslator(t.from, t.to, e.target.checked)} /> {tr('takeTurns')}
            </label>
            <button className={`${btn} ml-auto`} onClick={() => stopTranslator()}>
              {tr('stop')}
            </button>
          </div>
          {t.last ? (
            <div className="mt-3 space-y-1">
              <p className="text-[13px] text-ink-lo">
                {langName(t.last.from)}: {t.last.heard}
              </p>
              <p className="text-[24px] leading-snug text-ink" lang={t.last.to}>
                {t.last.said}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-ink-mid">{t.busy ? tr('translating') : tr('speakIn', { from: langName(t.from), to: langName(t.to) })}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
