/**
 * The master clock.
 *
 * One object, advanced exactly once per rendered frame, before anything else
 * reads it. It owns every sequence that more than one layer must agree on:
 *   - the ambient motion gate (0..1, settles over ~1 s)
 *   - the module presentation sequence (Phase 6)
 *   - the embodiment journey (Phase 7)
 *   - one-shot pulses (wake wave, world cuts)
 * Layers READ envelopes. Nothing writes back except through the explicit
 * commands below.
 */
import { MOTION_SETTLE_SECONDS, presentation, window01, arriving, reporting, drifting, scanning } from '@/core/motion/vocabulary';
import { approach } from '@/core/spring';
import { EMBODY, envelopesAt, phaseAt, type EmbodyEnvelopes, type EmbodyPhase } from './timeline';
import type { ModuleId } from '@/modules/ids';

export type PresentationPhase = 'idle' | 'targeting' | 'approach' | 'settle';

export interface PresentationEnvelopes {
  phase: PresentationPhase;
  module: ModuleId | null;
  /** ring has turned to the card: 0..1 during targeting */
  target: number;
  /** bracket converge: 1 = far outside frame, 0 = on the card corners */
  bracketSpread: number;
  /** bracket opacity */
  bracketAlpha: number;
  /** 0..1 lock flash */
  bracketLock: number;
  /** unrelated cards step back 0..1 */
  stepBack: number;
  /** card flight to reading position 0..1 */
  flight: number;
  /** scan line position 0..1 (top→bottom), <0 inactive */
  scan: number;
  /** camera push along view axis, metres */
  push: number;
}

type Listener = () => void;

const IDLE_PRESENTATION: PresentationEnvelopes = {
  phase: 'idle',
  module: null,
  target: 0,
  bracketSpread: 1,
  bracketAlpha: 0,
  bracketLock: 0,
  stepBack: 0,
  flight: 0,
  scan: -1,
  push: 0,
};

class MasterClock {
  /** wall time since start (s) */
  time = 0;
  dt = 0;
  frame = 0;

  // ── ambient motion gate ──────────────────────────────────────────
  motion = 0;
  motionTarget = 0;
  /** integral of motion·dt — ambient drift reads THIS, so it freezes exactly */
  motionTime = 0;

  // ── presentation ─────────────────────────────────────────────────
  private presT = -1;
  private presModule: ModuleId | null = null;
  private onPresentationCommit: ((m: ModuleId) => void) | null = null;
  presentation: PresentationEnvelopes = { ...IDLE_PRESENTATION };

  // ── embodiment ───────────────────────────────────────────────────
  embodyT = 0;
  private embodyDir: 0 | 1 | -1 = 0;
  embodyPhase: EmbodyPhase = 'NORMAL';
  embody: EmbodyEnvelopes = envelopesAt(0);

  // ── pulses ───────────────────────────────────────────────────────
  wakeT = -1; // seconds since wake, -1 inactive
  cutT = -1; // seconds since world cut
  selectT = -1; // seconds since a card was selected (energy pulse)

  private phaseListeners = new Set<Listener>();
  private presentationListeners = new Set<Listener>();

  tick(rawDt: number) {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    this.dt = dt;
    this.time += dt;
    this.frame++;

    // Motion gate: critically-damped approach, lands exactly on target.
    this.motion = approach(this.motion, this.motionTarget, MOTION_SETTLE_SECONDS, dt);
    this.motionTime += this.motion * dt;

    this.tickPresentation(dt);
    this.tickEmbodiment(dt);

    if (this.wakeT >= 0) this.wakeT = this.wakeT > 6 ? -1 : this.wakeT + dt;
    if (this.cutT >= 0) this.cutT = this.cutT > 4 ? -1 : this.cutT + dt;
    if (this.selectT >= 0) this.selectT = this.selectT > 2 ? -1 : this.selectT + dt;
  }

  // ── motion ───────────────────────────────────────────────────────
  setMotion(on: boolean) {
    this.motionTarget = on ? 1 : 0;
  }

  // ── presentation sequence ────────────────────────────────────────
  get presentationActive() {
    return this.presT >= 0;
  }

  startPresentation(module: ModuleId, onCommit: (m: ModuleId) => void) {
    this.presT = 0;
    this.presModule = module;
    this.onPresentationCommit = onCommit;
    this.emitPresentation();
  }

  /** A deliberate gesture: stop the film, keep the outcome. */
  cancelPresentation() {
    if (this.presT < 0) return;
    const m = this.presModule;
    const commit = this.onPresentationCommit;
    this.presT = -1;
    this.presModule = null;
    this.onPresentationCommit = null;
    this.presentation = { ...IDLE_PRESENTATION };
    if (m && commit) commit(m);
    this.emitPresentation();
  }

  private tickPresentation(dt: number) {
    if (this.presT < 0) return;
    this.presT += dt;
    const { targeting: A, approach: B, settle: C } = presentation;
    const t = this.presT;
    const total = A + B + C;
    const tgt = window01(t, 0, A);
    const app = window01(t, A, A + B);
    const set = window01(t, A + B, total);
    const phase: PresentationPhase = t < A ? 'targeting' : t < A + B ? 'approach' : 'settle';
    const pushIn = reporting(app);
    const pushOut = drifting(set);
    this.presentation = {
      phase,
      module: this.presModule,
      target: arriving(tgt),
      bracketSpread: 1 - arriving(window01(t, 0, A + B * 0.5)),
      bracketAlpha: Math.min(1, t / (A * 0.5)) * (1 - drifting(window01(set, 0.35, 0.9))),
      bracketLock: set > 0 ? Math.max(0, 1 - set * 3.2) : 0,
      stepBack: arriving(tgt) * (1 - drifting(set)) + 0,
      flight: reporting(app),
      scan: app > 0 && app < 1 ? scanning(app) : -1,
      push: 0.32 * pushIn * (1 - pushOut),
    };
    if (t >= total) {
      const m = this.presModule;
      const commit = this.onPresentationCommit;
      this.presT = -1;
      this.presModule = null;
      this.onPresentationCommit = null;
      this.presentation = { ...IDLE_PRESENTATION };
      if (m && commit) commit(m);
      this.emitPresentation();
    }
  }

  // ── embodiment ───────────────────────────────────────────────────
  get embodied() {
    return this.embodyPhase !== 'NORMAL';
  }

  transform(to: 'human' | 'spatial') {
    if (to === 'human') {
      if (this.embodyDir === 1 || this.embodyPhase === 'HUMANOID_ACTIVE') return false;
      this.embodyDir = 1;
    } else {
      if (this.embodyPhase === 'NORMAL' || this.embodyDir === -1) return false;
      this.embodyDir = -1;
    }
    this.updatePhase();
    return true;
  }

  private tickEmbodiment(dt: number) {
    if (this.embodyDir === 0) return;
    if (this.embodyDir === 1) {
      this.embodyT = Math.min(EMBODY.total, this.embodyT + dt);
      if (this.embodyT >= EMBODY.total) this.embodyDir = 0;
    } else {
      this.embodyT = Math.max(0, this.embodyT - dt * EMBODY.returnSpeed);
      if (this.embodyT <= 0) this.embodyDir = 0;
    }
    this.embody = envelopesAt(this.embodyT);
    this.updatePhase();
  }

  /** Jump the embodiment timeline (verification / screenshots only). */
  seekEmbodiment(t: number) {
    this.embodyT = Math.min(EMBODY.total, Math.max(0, t));
    this.embodyDir = 0;
    this.embody = envelopesAt(this.embodyT);
    this.updatePhase();
  }

  private updatePhase() {
    const returning = this.embodyDir === -1;
    let next = phaseAt(this.embodyT, returning);
    if (this.embodyDir === 1 && this.embodyT === 0) next = 'COMMAND_DETECTED';
    if (next !== this.embodyPhase) {
      this.embodyPhase = next;
      for (const l of this.phaseListeners) l();
    }
  }

  // ── pulses ───────────────────────────────────────────────────────
  wake() {
    this.wakeT = 0;
  }
  cut() {
    this.cutT = 0;
  }
  pulseSelect() {
    this.selectT = 0;
  }

  // ── subscriptions ────────────────────────────────────────────────
  onPhase(l: Listener) {
    this.phaseListeners.add(l);
    return () => void this.phaseListeners.delete(l);
  }
  onPresentation(l: Listener) {
    this.presentationListeners.add(l);
    return () => void this.presentationListeners.delete(l);
  }
  private emitPresentation() {
    for (const l of this.presentationListeners) l();
  }
}

export const clock = new MasterClock();
export type { MasterClock };
