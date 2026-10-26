'use client';
/**
 * The first-visit choice about what Divina may keep on this device. There
 * are no tracking or advertising cookies to accept: the only question is
 * whether preferences are remembered between visits. Both answers are one
 * tap and look the same, and the choice can be changed in Settings.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { setConsent, useConsent } from '@/lib/consent';
import { openSettings } from '@/lib/client/settings';
import { useCompact } from './useCompact';
import { useT } from '@/lib/i18n';

/** Open Settings at Privacy & cookies. */
export function managePrivacy() {
  openSettings();
  let tries = 0;
  const go = () => {
    const el = document.querySelector('[data-section="Privacy & cookies"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (tries++ < 20) window.setTimeout(go, 100);
  };
  window.setTimeout(go, 150);
}

const choiceButton = 'flex-1 rounded-lg border border-holo/60 bg-holo/10 px-3 py-2 text-[13px] text-ink hover:bg-holo/20';

export function CookieNotice() {
  const choice = useConsent((s) => s.choice);
  const compact = useCompact();
  const tr = useT();
  return (
    <AnimatePresence>
      {choice === null && (
        <motion.div
          className={`glass fixed left-1/2 z-[66] w-[min(500px,92vw)] -translate-x-1/2 rounded-2xl p-4 ${compact ? 'top-[calc(max(16px,env(safe-area-inset-top))+56px)]' : 'bottom-24'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          role="dialog"
          aria-label="Cookies and storage"
        >
          <h3 className="text-[16px] text-ink">{tr('cookie.title')}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-mid">{tr('cookie.body')}</p>
          <div className="mt-3 flex gap-2">
            <button className={choiceButton} onClick={() => setConsent('all')}>
              {tr('cookie.all')}
            </button>
            <button className={choiceButton} onClick={() => setConsent('essential')}>
              {tr('cookie.essential')}
            </button>
          </div>
          <button className="mt-2 text-[12px] text-ink-lo underline hover:text-ink" onClick={managePrivacy}>
            {tr('cookie.details')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
