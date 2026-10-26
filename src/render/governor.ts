/**
 * Frame governor. Divina's room holds still by default, and a still room
 * drawn 60 times a second is 60 identical frames of GPU work (and heat).
 * The canvas runs on demand; this decides how often to draw:
 *
 *   - every display frame while anything is live: input, a sequence,
 *     speech, hands, weather, the boot, or something visibly changing
 *   - IDLE_FPS once the picture has stopped changing for SETTLE_MS
 *
 * Anything that animates can call wake(); visible change is also detected
 * by comparing what was drawn (see settleCheck), so nothing freezes.
 */
import { clock } from '@/core/clock/masterClock';
import { live } from './live';

const SETTLE_MS = 1500;
const IDLE_FPS = 5;

let wakeUntil = 0;
let wokenBy = '';
const conditions: { name: string; fn: () => boolean }[] = [];

/** Keep drawing at full rate for at least `ms`. `by` says why (for diagnosis). */
export function wake(ms = SETTLE_MS, by = 'wake') {
  const until = performance.now() + ms;
  if (until > wakeUntil) {
    wakeUntil = until;
    wokenBy = by;
  }
}

/** Register something that needs full-rate frames while it returns true. */
export function keepAwakeWhile(name: string, fn: () => boolean) {
  conditions.push({ name, fn });
}

/** Why the room is being drawn at full rate right now, or '' when it's resting. */
export function awakeReason(now = performance.now()): string {
  if (now < wakeUntil) return wokenBy;
  if (clock.motion > 0) return 'motion';
  if (clock.embodied) return 'human form';
  if (clock.presentationActive) return 'presentation';
  if (clock.cutT >= 0 || clock.wakeT >= 0) return 'transition';
  if (live.voiceLevel > 0.001) return 'voice';
  for (const c of conditions) if (c.fn()) return c.name;
  return '';
}

export const isAwake = (now = performance.now()) => awakeReason(now) !== '';

/** How long to wait between frames right now. */
export const idleIntervalMs = 1000 / IDLE_FPS;

// ── visible-change detection ───────────────────────────────────────
let last: Float64Array | null = null;
function snapshot(): Float64Array {
  const m = live.cardMatrices;
  const s = new Float64Array(m.length + 16);
  s.set(m);
  let i = m.length;
  s[i++] = live.ringAngle;
  s[i++] = live.camPos.x;
  s[i++] = live.camPos.y;
  s[i++] = live.camPos.z;
  s[i++] = live.camQuat.x;
  s[i++] = live.camQuat.y;
  s[i++] = live.camQuat.z;
  s[i++] = live.camQuat.w;
  s[i++] = live.fog.r + live.fog.g * 3 + live.fog.b * 7;
  s[i++] = live.fogDensity;
  s[i++] = live.beamIntensity;
  s[i++] = live.dustDensity;
  s[i++] = live.key.r + live.key.g * 3 + live.key.b * 7;
  s[i++] = live.panelAnchor.x + live.panelAnchor.y * 3;
  s[i++] = clock.motionTime;
  s[i++] = live.voiceLevel;
  return s;
}

/** Called after each drawn frame: if anything moved since the last one, stay awake. */
export function settleCheck() {
  const s = snapshot();
  if (last && last.length === s.length) {
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== last[i]) {
        wake(300, `change@${i}`);
        break;
      }
    }
  }
  last = s;
}
