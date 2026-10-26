/**
 * Embodiment timeline (Phase 7). Pure data + pure functions of time so the
 * forward journey and the return are the SAME curve evaluated at a different
 * t. No layer keeps its own timer.
 */
import { window01, arriving, drifting, reporting } from '@/core/motion/vocabulary';

export type EmbodyPhase =
  | 'NORMAL'
  | 'COMMAND_DETECTED'
  | 'COLLAPSING'
  | 'PARTICLE_CORE'
  | 'SKELETON_FORMING'
  | 'HUMANOID_FORMING'
  | 'HUMANOID_ACTIVE'
  | 'RETURNING';

/** Seconds on the forward timeline. */
export const EMBODY = {
  command: 0.0,
  collapse: 0.7, // cards begin to erode
  dissolveSpan: 2.4, // per-card erosion window scale
  core: 3.7, // everything has arrived in the point
  skeleton: 4.7, // first points leave the core
  body: 5.7,
  formSpan: 3.0, // crown-to-chest departure spread
  flight: 0.95, // core → surface flight time
  eyes: 8.9,
  total: 9.6,
  returnSpeed: 1.7,
} as const;

/** Phase for a timeline position. `returning` flips the label only. */
export function phaseAt(t: number, returning: boolean): EmbodyPhase {
  if (returning) return t <= 0 ? 'NORMAL' : 'RETURNING';
  if (t <= 0) return 'NORMAL';
  if (t < EMBODY.collapse) return 'COMMAND_DETECTED';
  if (t < EMBODY.core) return 'COLLAPSING';
  if (t < EMBODY.skeleton) return 'PARTICLE_CORE';
  if (t < EMBODY.body) return 'SKELETON_FORMING';
  if (t < EMBODY.total) return 'HUMANOID_FORMING';
  return 'HUMANOID_ACTIVE';
}

export interface EmbodyEnvelopes {
  /** 0 normal → 1 room fully dimmed */
  dim: number;
  /** 0..1 overall progress */
  journey: number;
  /** 0..1 card faces eroding */
  dissolve: number;
  /** 0..1 particles converging to the point */
  collapse: number;
  /** 0..1..0 brightness of the particle core */
  core: number;
  /** 0..1 skeleton subset landed */
  skeleton: number;
  /** 0..1 full body landed */
  body: number;
  /** 0..1 eye lights settled */
  eyes: number;
  /** 0..1 figure is present and in control */
  presence: number;
}

export function envelopesAt(t: number): EmbodyEnvelopes {
  const E = EMBODY;
  const coreRise = window01(t, E.collapse + 1.2, E.core);
  const coreFall = window01(t, E.skeleton, E.body + 1.2);
  return {
    dim: drifting(window01(t, 0, 1.3)),
    journey: Math.min(1, Math.max(0, t / E.total)),
    dissolve: window01(t, E.collapse, E.collapse + E.dissolveSpan + 0.6),
    collapse: reporting(window01(t, E.collapse + 0.4, E.core)),
    core: coreRise * (1 - coreFall),
    skeleton: arriving(window01(t, E.skeleton, E.body + 0.4)),
    body: arriving(window01(t, E.body - 0.2, E.total - 0.4)),
    eyes: arriving(window01(t, E.eyes - 0.5, E.total)),
    presence: drifting(window01(t, E.total - 0.8, E.total)),
  };
}

/**
 * Edge-first erosion factor for a point on a card face (uv in 0..1).
 * Geometric only — no hashes — so the JS copy (particle leave times) and the
 * GLSL copy (card face erosion) agree to float precision, pixel for pixel.
 */
export function edgeFactor(u: number, v: number): number {
  const edge = Math.min(u, 1 - u, v, 1 - v) / 0.5;
  const ripple = 0.5 + 0.5 * Math.sin(u * 23.0 + v * 17.0) * Math.sin(v * 19.0 - u * 7.0);
  return Math.min(1, Math.max(0, edge * 0.85 + ripple * 0.15));
}

export const EDGE_FACTOR_GLSL = /* glsl */ `
float divinaEdgeFactor(vec2 uv) {
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) / 0.5;
  float ripple = 0.5 + 0.5 * sin(uv.x * 23.0 + uv.y * 17.0) * sin(uv.y * 19.0 - uv.x * 7.0);
  return clamp(edge * 0.85 + ripple * 0.15, 0.0, 1.0);
}
`;

/** Per-card erosion window: cards behind the user go first. */
export function cardDissolveStart(behindness: number): number {
  // behindness: 0 = directly in front, 1 = directly behind the viewer
  return EMBODY.collapse + (1 - behindness) * 0.9;
}
export const CARD_ERODE_SPAN = 1.25;
