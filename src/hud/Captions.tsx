'use client';
/**
 * Replies as plain, readable captions: normal type, no blur, no bloom.
 * The default way to read Divina (Settings → Voice & replies).
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAI } from '@/stores/ai';
import { usePrefs } from '@/stores/prefs';
import { useData } from '@/stores/data';
import { useSpeaker } from '@/lib/client/personal';
import type { AgentsData } from '@/modules/types';

const HIDE_AFTER_MS = 12_000;

export function Captions() {
  const response = useAI((s) => s.response);
  const status = useAI((s) => s.status);
  const display = usePrefs((s) => s.replyDisplay);
  const size = usePrefs((s) => s.captionSize);
  // who is speaking: Divina, or the custom agent being talked to
  const prefAgent = usePrefs((s) => s.agent);
  const speaker = useSpeaker();
  const agentId = speaker.divina ? null : (speaker.agent ?? prefAgent);
  // select a plain string: a fresh array each time would re-render forever
  const agentName = useData((s) => (s.modules.agents?.status === 'ok' ? (s.modules.agents.data as AgentsData).agents.find((a) => a.id === agentId)?.name : undefined));
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const busy = status === 'streaming' || status === 'speaking' || status === 'thinking';

  useEffect(() => {
    if (!response) return setVisible(false);
    setVisible(true);
    if (busy) return;
    const id = window.setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [response, busy]);

  // keep the newest words in view while a long answer streams
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [response]);

  const show = display !== 'hologram' && visible && !!response && status !== 'listening';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-auto fixed bottom-[96px] left-1/2 z-30 w-[min(760px,92vw)] -translate-x-1/2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={() => setVisible(false)}
          title="Click to hide"
        >
          <div
            ref={box}
            className={`glass max-h-[34vh] overflow-y-auto rounded-2xl px-6 py-4 text-left leading-relaxed text-ink ${size === 'large' ? 'text-[21px]' : 'text-[17px]'}`}
          >
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.2em] text-holo-hi">{agentName ?? 'divina'}</span>
            {response}
            {status === 'streaming' && <span className="ml-1 inline-block h-[1em] w-[2px] translate-y-[3px] animate-pulse bg-holo-hi" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
