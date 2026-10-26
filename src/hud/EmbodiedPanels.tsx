'use client';
/**
 * While embodied, modules are PRESENTED: glass panels beside the figure with
 * a 24 px title, tabular figures a person across the room could quote, a
 * sparkline that draws itself, status, provenance, age. Two at most.
 *
 * The panel is never IN the hand. It stays DOM (readability is the point)
 * and rides as a hologram: while carried it follows the anchor the hand rig
 * publishes every frame — through motion values, no React render per frame
 * — and springs to its slot the moment the hand lets go. With no hand ready
 * it slides in from the edge.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import * as THREE from 'three';
import { useEmbody } from '@/stores/embody';
import { useData } from '@/stores/data';
import { MODULE_BY_ID } from '@/modules/meta';
import { summarize } from '@/modules/summary';
import { Spark } from '@/modules/panels/kit';
import { fmt } from '@/modules/format';
import { live } from '@/render/live';
import type { ModuleId } from '@/modules/ids';

const W = 380;
const H = 250;

function slot(i: number) {
  return { x: window.innerWidth * 0.64, y: window.innerHeight * (i === 0 ? 0.14 : 0.52) };
}

function Panel({ id, index, carried }: { id: ModuleId; index: number; carried: boolean }) {
  const md = useData((s) => s.modules[id]);
  const meta = MODULE_BY_ID[id];
  const sum = summarize(id, md);
  const x = useMotionValue(carried ? live.panelAnchor.x - W / 2 : window.innerWidth + 40);
  const y = useMotionValue(carried ? live.panelAnchor.y - H / 2 : slot(index).y);
  const scale = useMotionValue(carried ? 0.62 : 1);
  const following = useRef(carried);
  const seen = useRef(false);
  const born = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (following.current && live.panelAnchor.visible) {
        seen.current = true;
        x.set(live.panelAnchor.x - W / 2);
        y.set(live.panelAnchor.y - H / 2);
      } else if (following.current && (seen.current || performance.now() - born.current > 500)) {
        // the hand let go: spring to the slot
        following.current = false;
        const s = slot(index);
        void animate(x, s.x, { type: 'spring', stiffness: 120, damping: 18 });
        void animate(y, s.y, { type: 'spring', stiffness: 120, damping: 18 });
        void animate(scale, 1, { type: 'spring', stiffness: 140, damping: 20 });
      }
      raf = requestAnimationFrame(tick);
    };
    if (!carried) {
      const s = slot(index);
      void animate(x, s.x, { type: 'spring', stiffness: 110, damping: 20 });
      void animate(y, s.y, { type: 'spring', stiffness: 110, damping: 20 });
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [carried, index, x, y, scale]);

  // re-slot when the order changes; the head attends to the newest panel
  useEffect(() => {
    if (following.current) return;
    const s = slot(index);
    void animate(y, s.y, { type: 'spring', stiffness: 120, damping: 20 });
    void animate(x, s.x, { type: 'spring', stiffness: 120, damping: 20 });
  }, [index, x, y]);

  useEffect(() => {
    const s = slot(index);
    const ndc = new THREE.Vector3(((s.x + W / 2) / window.innerWidth) * 2 - 1, -(((s.y + H / 2) / window.innerHeight) * 2 - 1), 0.5);
    // approximate world point beside the figure for the head to turn toward
    live.panelGaze.set(ndc.x * 0.55, 1.5 + ndc.y * 0.3, -1.9);
    live.panelGazeUntil = performance.now() + 6000;
  }, [index]);

  return (
    <motion.section
      className="glass fixed left-0 top-0 z-30 rounded-2xl p-5"
      style={{ x, y, scale, width: W, transformOrigin: 'center' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.35 } }}
      aria-label={`${meta.title} summary`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[24px] font-medium leading-none text-ink">{meta.title}</h2>
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${sum.status === 'live' ? 'text-holo-hi' : sum.status === 'error' ? 'text-warn' : 'text-ink-lo'}`}>{sum.status === 'live' ? '● live' : sum.status}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="max-w-[240px] truncate text-[46px] font-light leading-none tabular text-ink">{sum.value}</span>
        <span className="text-[14px] text-ink-mid">{sum.unit}</span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-ink-mid">{sum.sub}</p>
      <div className="mt-2">{sum.series && sum.series.length > 1 ? <Spark values={sum.series} hue={meta.hue} height={46} /> : <div className="h-[46px]" />}</div>
      <div className="mt-3 flex justify-between border-t border-ink-faint pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
        <span className="max-w-[260px] truncate">{md?.source ?? '—'}</span>
        <span>{fmt.age(md?.fetchedAt)}</span>
      </div>
    </motion.section>
  );
}

export function EmbodiedPanels() {
  const presented = useEmbody((s) => s.presented);
  const carrying = useEmbody((s) => s.carrying);
  const phase = useEmbody((s) => s.phase);
  const show = phase === 'HUMANOID_ACTIVE';
  return (
    <AnimatePresence>
      {show &&
        presented.map((id, i) => (
          <Panel key={id} id={id} index={presented.length === 1 ? 0 : i} carried={carrying === id} />
        ))}
    </AnimatePresence>
  );
}
