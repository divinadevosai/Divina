/**
 * Gesture engine: hand frames → cursor + recognised gestures → intents.
 */
import { bus } from '@/core/bus';
import { handCursor, useGesture } from '@/stores/gesture';
import { useRing, frontModule } from '@/stores/ring';
import { clock } from '@/core/clock/masterClock';
import { Recognizer } from './recognizer';
import { OneEuro } from './filters';
import { tracker } from './tracker';
import type { HandFrame } from './classifier';
import { live } from '@/render/live';
import { MODULE_IDS } from '@/modules/ids';

const rec = new Recognizer();
const fx = new OneEuro(1.4, 0.03);
const fy = new OneEuro(1.4, 0.03);
let baseSize: number | null = null;

/** Remap the comfortable reach of a hand in frame to the whole screen. */
const remap = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

function nearestCardTo(x: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < MODULE_IDS.length; i++) {
    const sx = live.cardScreen[i * 2];
    const d = Math.abs(sx - x);
    if (live.cardScreen[i * 2 + 1] > -1 && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD < 0.15 ? best : -1;
}

function onHands(hands: HandFrame[], t: number) {
  const g = useGesture.getState();
  g.setHands(hands.length);
  if (!hands.length) {
    handCursor.visible = false;
    handCursor.hands = [];
    baseSize = null;
    fx.reset();
    fy.reset();
  } else {
    const primary = hands.find((h) => h.pinch) ?? hands.find((h) => h.id === 'Right') ?? hands[0];
    const px = remap(primary.palm.x * 0.5 + primary.index.x * 0.5, 0.12, 0.88);
    const py = remap(primary.palm.y * 0.6 + primary.index.y * 0.4, 0.12, 0.82);
    handCursor.visible = true;
    handCursor.x = fx.filter(px, t);
    handCursor.y = fy.filter(py, t);
    baseSize = baseSize === null ? primary.size : baseSize * 0.995 + primary.size * 0.005;
    handCursor.depth = primary.size / baseSize;
    handCursor.pinching = primary.pinch;
    handCursor.hands = hands.map((h) => ({ x: remap(h.palm.x, 0.12, 0.88), y: remap(h.palm.y, 0.12, 0.82), pinch: h.pinch, open: h.open }));
    handCursor.trail.push({ x: handCursor.x, y: handCursor.y, t });
    while (handCursor.trail.length && t - handCursor.trail[0].t > 450) handCursor.trail.shift();
    const idle = primary.pinch ? 'pinch' : primary.open ? 'open-hand' : primary.closed ? 'closed-hand' : primary.pointing ? 'point' : 'none';
    if (performance.now() - g.at > 700) g.set(idle, primary.score);
  }

  const ring = useRing.getState();
  for (const e of rec.update(hands, t)) {
    g.set(e.name, e.confidence);
    switch (e.name) {
      case 'swipe-left':
        bus.emit({ type: 'rotate', steps: 1, source: 'hand' });
        break;
      case 'swipe-right':
        bus.emit({ type: 'rotate', steps: -1, source: 'hand' });
        break;
      case 'pinch':
        if (ring.hovered) bus.emit({ type: 'grab', module: ring.hovered, source: 'hand' });
        break;
      case 'release':
        if (ring.dragging) bus.emit({ type: 'release', source: 'hand' });
        break;
      case 'pull': {
        const m = ring.dragging ?? ring.hovered ?? frontModule(ring.frontStep);
        if (ring.dragging) bus.emit({ type: 'release', source: 'hand' });
        bus.emit({ type: 'open', module: m, source: 'hand' });
        break;
      }
      case 'push':
        bus.emit({ type: 'collapse', source: 'hand' });
        break;
      case 'palm-still':
        bus.emit({ type: 'freeze', on: e.value === 1, source: 'hand' });
        break;
      case 'circle':
        // Reserved for the AI: the wake gesture passes in every form.
        bus.emit({ type: 'wake', source: 'hand' });
        break;
      case 'two-hand-zoom':
        bus.emit({ type: 'zoom', factor: e.value ?? 1, source: 'hand' });
        break;
      case 'two-hand-split':
      case 'two-hand-group':
        bus.emit({ type: 'spread', amount: e.value ?? 0, source: 'hand' });
        break;
      case 'multi-select': {
        const second = hands.find((h) => h.id === e.hand);
        const idx = second ? nearestCardTo(second.palm.x) : -1;
        if (idx >= 0) bus.emit({ type: 'multi-select', module: MODULE_IDS[idx], source: 'hand' });
        break;
      }
    }
  }
  void clock;
}

export function installGestures() {
  tracker.onFrame(onHands);
}

export { tracker };
