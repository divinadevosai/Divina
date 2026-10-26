/**
 * Figure rig, on the CPU, once per frame: a few dozen uniforms.
 *
 * Idle motion is small and CAUSED: a rigid head turn toward the cursor or a
 * presented panel; breath only while speaking (or when ambient motion is
 * on). With zero input the figure is perfectly still.
 *
 * The mouth hinges with the voice: openness follows the speech envelope with
 * a fast attack and slower release, held to five discrete steps — a
 * mechanism, not a membrane. Silence closes it.
 */
import * as THREE from 'three';
import { BUST } from './sdf';
import { FIGURE_ORIGIN } from '@/render/layout';
import { live } from '@/render/live';
import { clock } from '@/core/clock/masterClock';
import { spring1, stepSpring1 } from '@/core/spring';

export const rig = {
  headR: new THREE.Matrix3(),
  headQ: new THREE.Quaternion(),
  jaw: 0, // radians
  mouth: 0, // 0..1 quantised openness
  seam: 0, // 0..1 seam light
  breath: 0,
  speaking: false,
  gazeActive: false,
};

const yaw = spring1(0);
const pitch = spring1(0);
const breathAmp = spring1(0);
const HEAD_SPRING = { stiffness: 40, damping: 12 };
let env = 0;
let breathPhase = 0;
const neckW = new THREE.Vector3();
const tmp = new THREE.Vector3();
const e = new THREE.Euler();

export const JAW_MAX = 0.16;

export function updateRig(dt: number) {
  // speech envelope: fast attack, slower release, then five steps
  const level = Math.min(1, live.voiceLevel);
  env = level > env ? env + (level - env) * (1 - Math.exp(-dt / 0.025)) : env + (level - env) * (1 - Math.exp(-dt / 0.11));
  if (env < 0.02) env = 0;
  const step = Math.min(4, Math.round(env * 4.4));
  rig.mouth = step / 4;
  rig.jaw = rig.mouth * JAW_MAX;
  rig.seam = rig.mouth;

  // gaze: rigid head turn toward the target
  neckW.set(BUST.neckPivot[0], BUST.neckPivot[1] + 0.12, BUST.neckPivot[2]).add(FIGURE_ORIGIN);
  tmp.copy(live.gaze).sub(neckW);
  const targetYaw = rig.gazeActive ? THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -0.55, 0.55) : 0;
  const targetPitch = rig.gazeActive ? THREE.MathUtils.clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) * 0.6, -0.2, 0.2) : 0;
  yaw.target = targetYaw;
  pitch.target = -targetPitch;
  stepSpring1(yaw, HEAD_SPRING, dt);
  stepSpring1(pitch, HEAD_SPRING, dt);
  e.set(pitch.x, yaw.x, 0, 'YXZ');
  rig.headQ.setFromEuler(e);
  rig.headR.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rig.headQ));

  // breath: caused by speech (or ambient motion), otherwise exactly still
  breathAmp.target = rig.speaking || clock.motion > 0 ? 1 : 0;
  stepSpring1(breathAmp, { stiffness: 6, damping: 5 }, dt);
  if (breathAmp.x > 0) breathPhase += dt * (rig.speaking ? 1.9 : 1.35);
  rig.breath = breathAmp.x * Math.sin(breathPhase);
}

/** Head transform for a figure-local point (for eyes, seam, voice). */
export function headPoint(local: readonly [number, number, number], out: THREE.Vector3): THREE.Vector3 {
  out.set(local[0] - BUST.neckPivot[0], local[1] - BUST.neckPivot[1], local[2] - BUST.neckPivot[2]);
  out.applyMatrix3(rig.headR);
  out.x += BUST.neckPivot[0] + FIGURE_ORIGIN.x;
  out.y += BUST.neckPivot[1] + FIGURE_ORIGIN.y;
  out.z += BUST.neckPivot[2] + FIGURE_ORIGIN.z;
  return out;
}
