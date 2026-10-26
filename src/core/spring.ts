/**
 * Semi-implicit spring integrator.
 *
 * Springs come to rest EXACTLY: once position and velocity are both inside
 * epsilon of the target, the state is snapped. That is what lets the room
 * be measurably still (Phase 6) instead of drifting by 1e-9 forever.
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
}

export interface Spring1 {
  x: number;
  v: number;
  target: number;
}

const REST_X = 1e-5;
const REST_V = 1e-5;
const MAX_STEP = 1 / 120;

export function spring1(x = 0): Spring1 {
  return { x, v: 0, target: x };
}

/** Returns true while moving. */
export function stepSpring1(s: Spring1, cfg: SpringConfig, dt: number): boolean {
  if (s.x === s.target && s.v === 0) return false;
  let remaining = Math.min(dt, 0.1);
  while (remaining > 0) {
    const h = Math.min(remaining, MAX_STEP);
    const a = -cfg.stiffness * (s.x - s.target) - cfg.damping * s.v;
    s.v += a * h;
    s.x += s.v * h;
    remaining -= h;
  }
  if (Math.abs(s.x - s.target) < REST_X && Math.abs(s.v) < REST_V) {
    s.x = s.target;
    s.v = 0;
    return false;
  }
  return true;
}

export interface Spring3 {
  x: [number, number, number];
  v: [number, number, number];
  target: [number, number, number];
}

export function spring3(x: [number, number, number] = [0, 0, 0]): Spring3 {
  return { x: [...x], v: [0, 0, 0], target: [...x] };
}

export function stepSpring3(s: Spring3, cfg: SpringConfig, dt: number): boolean {
  let moving = false;
  for (let i = 0; i < 3; i++) {
    const one: Spring1 = { x: s.x[i], v: s.v[i], target: s.target[i] };
    if (stepSpring1(one, cfg, dt)) moving = true;
    s.x[i] = one.x;
    s.v[i] = one.v;
  }
  return moving;
}

/** Critically-damped approach toward a target over roughly `seconds`. */
export function approach(current: number, target: number, seconds: number, dt: number): number {
  if (current === target) return target;
  const k = 1 - Math.exp((-dt * 4.6) / Math.max(seconds, 1e-3));
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 1e-5 ? target : next;
}
