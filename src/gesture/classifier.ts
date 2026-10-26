/**
 * Per-frame hand classification from 21 MediaPipe landmarks. Pure.
 *
 * Landmarks: 0 wrist · 1-4 thumb · 5-8 index · 9-12 middle · 13-16 ring ·
 * 17-20 pinky (MCP, PIP, DIP, TIP).
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandFrame {
  id: 'Left' | 'Right';
  score: number;
  /** palm centre, mirrored screen space 0..1 */
  palm: { x: number; y: number };
  index: { x: number; y: number };
  /** wrist → middle-MCP distance; grows as the hand approaches the camera */
  size: number;
  pinch: boolean;
  pinchStrength: number;
  extended: number;
  open: boolean;
  closed: boolean;
  pointing: boolean;
}

const d2 = (a: Landmark, b: Landmark, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

const pinchState = new Map<string, boolean>();

export function classify(lm: Landmark[], id: 'Left' | 'Right', score: number, aspect: number): HandFrame {
  const wrist = lm[0];
  const size = d2(wrist, lm[9], aspect) || 1e-3;
  const extendedFinger = (tip: number, pip: number) => d2(lm[tip], wrist, aspect) > d2(lm[pip], wrist, aspect) * 1.18;
  const ext = [extendedFinger(8, 6), extendedFinger(12, 10), extendedFinger(16, 14), extendedFinger(20, 18)];
  const extended = ext.filter(Boolean).length;
  const pinchDist = d2(lm[4], lm[8], aspect) / size;
  const was = pinchState.get(id) ?? false;
  const pinch = was ? pinchDist < 0.48 : pinchDist < 0.3;
  pinchState.set(id, pinch);
  const palmIdx = [0, 5, 9, 13, 17];
  let px = 0;
  let py = 0;
  for (const i of palmIdx) {
    px += lm[i].x;
    py += lm[i].y;
  }
  px /= palmIdx.length;
  py /= palmIdx.length;
  return {
    id,
    score,
    palm: { x: 1 - px, y: py },
    index: { x: 1 - lm[8].x, y: lm[8].y },
    size,
    pinch,
    pinchStrength: Math.max(0, Math.min(1, 1 - (pinchDist - 0.2) / 0.5)),
    extended,
    open: extended >= 4 && !pinch,
    closed: extended === 0 && !pinch,
    pointing: ext[0] && !ext[1] && !ext[2] && !pinch,
  };
}

export function resetClassifier() {
  pinchState.clear();
}
