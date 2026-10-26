/**
 * Per-frame shared state between render layers. Mutated in place — never
 * through React — and read by whoever needs it later in the same frame.
 */
import * as THREE from 'three';
import { MODULE_IDS } from '@/modules/ids';

const N = MODULE_IDS.length;

export const live = {
  /** every card's world matrix, published each frame (Phase 7 dissolve) */
  cardMatrices: new Float32Array(16 * N),
  /** per-card erosion start time on the embodiment timeline */
  cardErodeStart: new Float32Array(N).fill(999),
  /** card centres in normalised screen space (x, y); y = -2 when behind */
  cardScreen: new Float32Array(2 * N),
  /** ring angle actually drawn (radians) */
  ringAngle: 0,
  /** camera pose actually drawn */
  camPos: new THREE.Vector3(),
  camQuat: new THREE.Quaternion(),
  /** the carried panel anchor, published by the hand rig (screen px) */
  panelAnchor: { x: 0, y: 0, visible: false, scale: 1 },
  /** interpolated world look */
  fog: new THREE.Color('#05070d'),
  fogDensity: 0.055,
  key: new THREE.Color('#bcd4ff'),
  beam: new THREE.Color('#7fb2ff'),
  dust: new THREE.Color('#9cc4ff'),
  floorColor: new THREE.Color('#2a4a8a'),
  beamIntensity: 0.55,
  dustDensity: 0.7,
  /** voice level 0..1, same range for studio and local voices */
  voiceLevel: 0,
  /** where a presented panel sits (world) and until when the head attends to it */
  panelGaze: new THREE.Vector3(0.6, 1.5, -2.0),
  panelGazeUntil: 0,
  /** head target for the figure, world space */
  gaze: new THREE.Vector3(0, 1.5, 0),
};
