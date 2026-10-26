/**
 * The presenting hand, rigged on the CPU as one rigid thing from
 * SCREEN-SPACE targets: a wrist position and a palm basis interpolated
 * between a retracted pose below the frame and the presenting pose. The
 * gesture lands in the same place on screen whatever the camera is doing.
 *
 * Sequence (seconds on the master clock): rise → hold → open → lower.
 */
import * as THREE from 'three';
import { arriving, leaving, reporting, window01 } from '@/core/motion/vocabulary';
import type { ModuleId } from '@/modules/ids';

export const HAND_SEQ = { rise: 1.0, hold: 0.95, open: 0.45, lower: 0.95 } as const;
const T_HOLD = HAND_SEQ.rise;
const T_OPEN = T_HOLD + HAND_SEQ.hold;
const T_LOWER = T_OPEN + HAND_SEQ.open;
export const T_END = T_LOWER + HAND_SEQ.lower;
/** the panel is let go a beat into the opening */
export const T_RELEASE = T_OPEN + 0.12;

export const handState = {
  module: null as ModuleId | null,
  start: -1,
  /** 0..1 materialisation (first third of the rise) */
  materialize: 0,
  curl: 0.6,
  visible: false,
  released: false,
  matrix: new THREE.Matrix4(),
};

export function startPresent(m: ModuleId, now: number) {
  handState.module = m;
  handState.start = now;
  handState.released = false;
}

// camera-space targets
const PRESENT = { ndc: new THREE.Vector2(0.42, -0.66), depth: 0.82, fingers: new THREE.Vector3(-0.72, 0.3, -0.62).normalize(), palm: new THREE.Vector3(0.08, 0.86, 0.5).normalize() };
const RETRACT = { ndc: new THREE.Vector2(0.42, -1.75), depth: 0.72, fingers: new THREE.Vector3(-0.25, 0.9, -0.35).normalize(), palm: new THREE.Vector3(-0.35, 0.2, 0.9).normalize() };

const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const m3 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const posB = new THREE.Vector3();
const x = new THREE.Vector3();
const y = new THREE.Vector3();
const z = new THREE.Vector3();

function basis(fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion) {
  y.copy(fingers);
  z.copy(palm).addScaledVector(y, -palm.dot(y)).normalize();
  x.crossVectors(y, z);
  m3.makeBasis(x, y, z);
  return out.setFromRotationMatrix(m3);
}

function wristAt(ndc: THREE.Vector2, depth: number, camera: THREE.PerspectiveCamera, out: THREE.Vector3) {
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  return out.set(ndc.x * tanX * depth, ndc.y * tanY * depth, -depth); // camera space
}

/** Updates handState; returns the progress through the sequence (-1 idle). */
export function updateHand(now: number, camera: THREE.PerspectiveCamera): number {
  if (handState.start < 0) {
    handState.visible = false;
    return -1;
  }
  const t = now - handState.start;
  if (t > T_END) {
    handState.start = -1;
    handState.visible = false;
    handState.module = null;
    return -1;
  }
  const up = arriving(window01(t, 0, HAND_SEQ.rise));
  const down = leaving(window01(t, T_LOWER, T_END));
  const k = up * (1 - down);
  handState.materialize = Math.min(1, window01(t, 0, HAND_SEQ.rise / 3)) * (1 - window01(t, T_END - HAND_SEQ.lower / 3, T_END));
  const open = reporting(window01(t, T_OPEN, T_LOWER));
  handState.curl = THREE.MathUtils.lerp(0.62, 0.34, up) * (1 - open) + -0.08 * open;
  handState.released = t >= T_RELEASE;
  handState.visible = true;

  wristAt(RETRACT.ndc, RETRACT.depth, camera, pos);
  wristAt(PRESENT.ndc, PRESENT.depth, camera, posB);
  pos.lerp(posB, k);
  basis(RETRACT.fingers, RETRACT.palm, qA);
  basis(PRESENT.fingers, PRESENT.palm, qB);
  qA.slerp(qB, k);
  // camera space → world
  pos.applyMatrix4(camera.matrixWorld);
  qA.premultiply(camera.quaternion);
  handState.matrix.compose(pos, qA, new THREE.Vector3(1, 1, 1));
  return t;
}

/** Where the carried panel's centre should sit: above the open palm. */
export function palmAnchor(out: THREE.Vector3) {
  // float above the open palm, lifted in world up so the hand stays visible
  out.set(0.004, 0.07, 0.06).applyMatrix4(handState.matrix);
  out.y += 0.12;
  return out;
}
