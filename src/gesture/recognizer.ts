/**
 * Temporal gestures from a stream of HandFrames. Pure logic with an
 * injectable clock; the engine turns its events into intents.
 */
import type { HandFrame } from './classifier';
import type { GestureName } from '@/stores/gesture';

interface Sample {
  t: number;
  x: number;
  y: number;
  ix: number;
  iy: number;
  size: number;
  open: boolean;
  pinch: boolean;
  pointing: boolean;
}

export interface GestureEvent {
  name: GestureName;
  confidence: number;
  /** extra payload */
  value?: number;
  hand?: 'Left' | 'Right';
}

const SWIPE_WINDOW = 300;
const SWIPE_DX = 0.2;
const PUSHPULL_WINDOW = 480;
const STILL_MS = 900;
const CIRCLE_WINDOW = 1700;

export class Recognizer {
  private hist: Sample[] = [];
  private cooldown: Partial<Record<GestureName, number>> = {};
  private stillSince: number | null = null;
  frozen = false;
  private wasPinch = false;
  private twoHandBase: number | null = null;
  private twoHandMode: 'zoom' | 'spread' | null = null;
  private secondPinch = false;

  private ready(name: GestureName, t: number, ms: number) {
    if ((this.cooldown[name] ?? 0) > t) return false;
    this.cooldown[name] = t + ms;
    return true;
  }

  update(hands: HandFrame[], t: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    if (!hands.length) {
      this.hist = [];
      this.stillSince = null;
      if (this.wasPinch) out.push({ name: 'release', confidence: 1 });
      this.wasPinch = false;
      if (this.frozen) {
        this.frozen = false;
        out.push({ name: 'palm-still', confidence: 0, value: 0 });
      }
      this.twoHandBase = null;
      return out;
    }

    // ── two-hand interactions ────────────────────────────────────
    if (hands.length === 2) {
      const [a, b] = hands;
      const dist = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y);
      const bothPinch = a.pinch && b.pinch;
      const bothOpen = a.open && b.open;
      const mode = bothPinch ? 'zoom' : bothOpen ? 'spread' : null;
      if (mode !== this.twoHandMode) {
        this.twoHandMode = mode;
        this.twoHandBase = mode ? dist : null;
      }
      if (mode && this.twoHandBase) {
        const ratio = dist / this.twoHandBase;
        if (Math.abs(ratio - 1) > 0.04) {
          if (mode === 'zoom') out.push({ name: 'two-hand-zoom', confidence: Math.min(a.score, b.score), value: ratio });
          else out.push({ name: ratio > 1 ? 'two-hand-split' : 'two-hand-group', confidence: Math.min(a.score, b.score), value: (ratio - 1) * 0.6 });
          this.twoHandBase = dist;
        }
        this.wasPinch = false;
        return out;
      }
      // one hand dragging, the other taps a pinch → multi-select
      const [primary, secondary] = a.pinch && !b.pinch ? [a, b] : b.pinch && !a.pinch ? [b, a] : [a, b];
      if (this.wasPinch && primary.pinch) {
        if (secondary.pinch && !this.secondPinch) out.push({ name: 'multi-select', confidence: secondary.score, hand: secondary.id });
        this.secondPinch = secondary.pinch;
      }
    } else {
      this.twoHandMode = null;
      this.twoHandBase = null;
      this.secondPinch = false;
    }

    const h = hands.find((x) => x.pinch) ?? hands.find((x) => x.id === 'Right') ?? hands[0];
    this.hist.push({ t, x: h.palm.x, y: h.palm.y, ix: h.index.x, iy: h.index.y, size: h.size, open: h.open, pinch: h.pinch, pointing: h.pointing });
    while (this.hist.length && t - this.hist[0].t > CIRCLE_WINDOW) this.hist.shift();

    // ── pinch edges → grab / release ─────────────────────────────
    if (h.pinch && !this.wasPinch) out.push({ name: 'pinch', confidence: h.score * h.pinchStrength, hand: h.id });
    if (!h.pinch && this.wasPinch) out.push({ name: 'release', confidence: h.score, hand: h.id });
    this.wasPinch = h.pinch;

    // ── swipe ────────────────────────────────────────────────────
    const recent = this.hist.filter((s) => t - s.t <= SWIPE_WINDOW);
    if (recent.length >= 4 && !h.pinch) {
      const dx = recent[recent.length - 1].x - recent[0].x;
      const dy = recent[recent.length - 1].y - recent[0].y;
      const dt = (recent[recent.length - 1].t - recent[0].t) / 1000;
      if (Math.abs(dx) > SWIPE_DX && Math.abs(dy) < Math.abs(dx) * 0.6 && Math.abs(dx) / Math.max(dt, 0.05) > 0.8) {
        const name: GestureName = dx < 0 ? 'swipe-left' : 'swipe-right';
        if (this.ready('swipe-left', t, 650)) {
          this.cooldown['swipe-right'] = this.cooldown['swipe-left'];
          out.push({ name, confidence: Math.min(1, (Math.abs(dx) / SWIPE_DX) * 0.6) * h.score });
          this.stillSince = null;
        }
      }
    }

    // ── pull / push (palm scale) ─────────────────────────────────
    const pp = this.hist.filter((s) => t - s.t <= PUSHPULL_WINDOW);
    if (pp.length >= 5) {
      const ratio = pp[pp.length - 1].size / pp[0].size;
      const lateral = Math.hypot(pp[pp.length - 1].x - pp[0].x, pp[pp.length - 1].y - pp[0].y);
      if (lateral < 0.12) {
        if (ratio > 1.3 && this.ready('pull', t, 900)) out.push({ name: 'pull', confidence: Math.min(1, (ratio - 1) * 2) * h.score });
        else if (ratio < 0.77 && this.ready('push', t, 900)) out.push({ name: 'push', confidence: Math.min(1, (1 - ratio) * 2.5) * h.score });
      }
    }

    // ── palm held still → freeze ─────────────────────────────────
    const last = this.hist[this.hist.length - 1];
    const prev = this.hist[Math.max(0, this.hist.length - 4)];
    const speed = prev && last.t > prev.t ? Math.hypot(last.x - prev.x, last.y - prev.y) / ((last.t - prev.t) / 1000) : 0;
    if (h.open && speed < 0.06) {
      this.stillSince ??= t;
      if (!this.frozen && t - this.stillSince > STILL_MS) {
        this.frozen = true;
        out.push({ name: 'palm-still', confidence: h.score, value: 1 });
      }
    } else {
      this.stillSince = null;
      if (this.frozen && (speed > 0.25 || !h.open)) {
        this.frozen = false;
        out.push({ name: 'palm-still', confidence: h.score, value: 0 });
      }
    }

    // ── circle with the index finger → wake ──────────────────────
    const circ = this.hist.filter((s) => s.pointing || s.open);
    if (circ.length > 12) {
      let cx = 0;
      let cy = 0;
      for (const s of circ) {
        cx += s.ix;
        cy += s.iy;
      }
      cx /= circ.length;
      cy /= circ.length;
      let total = 0;
      let prevA = Math.atan2(circ[0].iy - cy, circ[0].ix - cx);
      const radii: number[] = [];
      for (const s of circ) {
        const a = Math.atan2(s.iy - cy, s.ix - cx);
        let da = a - prevA;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        total += da;
        prevA = a;
        radii.push(Math.hypot(s.ix - cx, s.iy - cy));
      }
      const mean = radii.reduce((x, y) => x + y, 0) / radii.length;
      const sd = Math.sqrt(radii.reduce((x, y) => x + (y - mean) ** 2, 0) / radii.length);
      if (Math.abs(total) > Math.PI * 1.75 && mean > 0.035 && sd / mean < 0.45 && this.ready('circle', t, 2200)) {
        out.push({ name: 'circle', confidence: Math.min(1, Math.abs(total) / (Math.PI * 2)) * h.score });
        this.hist = [];
      }
    }
    return out;
  }
}
