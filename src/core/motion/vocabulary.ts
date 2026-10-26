/**
 * Motion vocabulary.
 *
 * Every animated value in Divina is described by what it MEANS, not by a
 * number someone liked on the day. A curve is chosen by intent; a spring is
 * chosen by the physical character the gesture should have.
 */

export type Curve = (t: number) => number;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Something entering the room: fast out of nowhere, long soft landing. */
export const arriving: Curve = (t) => {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 4);
};

/** Something stepping out: hesitates, then commits. Never snaps at the end. */
export const leaving: Curve = (t) => {
  t = clamp01(t);
  return t * t * t * (4 - 3 * t);
};

/** A nod: rises quickly, holds, and returns. Used for confirmations. 0→1→0. */
export const acknowledging: Curve = (t) => {
  t = clamp01(t);
  return Math.sin(Math.PI * Math.pow(t, 0.6));
};

/** Information presenting itself: balanced ease so the eye can follow. */
export const reporting: Curve = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Ambient drift: smooth everywhere, no corners, for loops and idle. */
export const drifting: Curve = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

/** Hard-edged, mechanical: scan lines and bracket locks. */
export const scanning: Curve = (t) => {
  t = clamp01(t);
  return t * t;
};

/** Smooth 0..1 window between a and b. */
export function window01(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
}

export const curves = { arriving, leaving, acknowledging, reporting, drifting, scanning } as const;
export type CurveName = keyof typeof curves;

/** Spring characters (stiffness, damping) — all used through core/spring. */
export const springs = {
  /** Orbit: the ring turning. Weighty, slight overshoot. */
  orbit: { stiffness: 38, damping: 11 },
  /** A card trailing a hand: noticeable lag, elastic. */
  tether: { stiffness: 90, damping: 12 },
  /** Hover lift: quick and small. */
  lift: { stiffness: 260, damping: 22 },
  /** Returning home after release: firm, settles with one overshoot. */
  homecoming: { stiffness: 70, damping: 13 },
  /** Camera: heavy, never overshoots perceptibly. */
  camera: { stiffness: 22, damping: 9.5 },
  /** UI chrome in the DOM. */
  chrome: { stiffness: 320, damping: 30 },
} as const;

/**
 * Boot choreography. One beat drives the whole opening; each element enters
 * on an integer or half multiple of it so the sequence reads as composed.
 */
// A new tab opens dozens of times a day, so the extension plays the same opening at four times the speed.
export const BOOT_BEAT = process.env.NEXT_PUBLIC_DIVINA_PLATFORM === 'extension' ? 0.1 : 0.42; // seconds
export const boot = {
  logStart: 0,
  logLineEvery: BOOT_BEAT * 0.35,
  worldFadeIn: BOOT_BEAT * 3,
  firstCard: BOOT_BEAT * 4,
  cardEvery: BOOT_BEAT * 0.5,
  hudIn: BOOT_BEAT * 9,
  done: BOOT_BEAT * 10,
} as const;

/** Presentation sequence (Phase 6): asymmetric by design. */
export const presentation = {
  targeting: 0.42, // brisk
  approach: 0.95, // carries distance
  settle: 1.25, // slow enough to read before motion stops
} as const;

/** Motion multiplier settle time (0..1 gate). */
export const MOTION_SETTLE_SECONDS = 1.0;
