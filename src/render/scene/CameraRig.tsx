'use client';
/**
 * The floating camera. With motion locked and no input, its pose is
 * exactly constant. Presentation pushes along the VIEW AXIS; embodiment
 * choreographs a move to the figure.
 */
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef } from 'react';
import { clock } from '@/core/clock/masterClock';
import { EYE, LOOK, FOV, EMBODIED_EYE, EMBODIED_LOOK, EMBODIED_FOV, CORE, READING_POS } from '../layout';
import { live } from '../live';
import { useRing } from '@/stores/ring';
import { spring1, stepSpring1 } from '@/core/spring';
import { springs, window01, drifting, reporting } from '@/core/motion/vocabulary';
import { EMBODY } from '@/core/clock/timeline';

const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const dir = new THREE.Vector3();
const tmp = new THREE.Vector3();

/**
 * A tall screen (a phone) would see a sliver of the room at the same
 * vertical field of view. Widen it to keep roughly the width a laptop sees,
 * within reason, and step back a little.
 */
const WIDEST = 1.2;
function fitFov(fov: number, aspect: number) {
  if (aspect >= WIDEST) return fov;
  const v = 2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(fov) / 2) * WIDEST) / aspect);
  return Math.min(76, THREE.MathUtils.radToDeg(v));
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const zoom = useRef(spring1(1));

  useFrame(() => {
    const dt = clock.dt;
    const m = clock.motion;
    const mt = clock.motionTime;

    zoom.current.target = useRing.getState().zoom;
    stepSpring1(zoom.current, springs.camera, dt);
    const z = zoom.current.x;

    const aspect = camera.aspect || 16 / 9;
    const portrait = aspect < 1;
    // an opened card sits above the details sheet on a phone, beside the panel elsewhere
    if (portrait) READING_POS.set(0, 1.83, -2.05);
    else READING_POS.set(-0.66, 1.56, -2.05);

    pos.copy(EYE);
    look.copy(LOOK);
    if (portrait) pos.z += (1 - aspect) * 0.45;
    // ambient float: amplitude × motion, so it is exactly zero when locked
    if (m > 0) {
      pos.x += m * 0.07 * Math.sin(mt * 0.13);
      pos.y += m * 0.04 * Math.sin(mt * 0.17 + 1.3);
      pos.z += m * 0.05 * Math.sin(mt * 0.09 + 2.1);
      look.x += m * 0.05 * Math.sin(mt * 0.07 + 0.4);
      look.y += m * 0.03 * Math.sin(mt * 0.11 + 0.9);
    }
    // two-hand zoom: dolly along the view axis
    dir.subVectors(look, pos).normalize();
    pos.addScaledVector(dir, (z - 1) * 1.6);
    // presentation push along the view axis
    pos.addScaledVector(dir, clock.presentation.push);

    // embodiment choreography: attention on the core, then a move to the face
    const t = clock.embodyT;
    if (t > 0) {
      const attend = drifting(window01(t, 0.3, EMBODY.core));
      look.lerp(CORE, attend * 0.8);
      const move = reporting(window01(t, EMBODY.core - 1.0, EMBODY.body + 0.8));
      pos.lerp(EMBODIED_EYE, move);
      tmp.copy(EMBODIED_LOOK);
      look.lerp(tmp, move);
      camera.fov = THREE.MathUtils.lerp(fitFov(FOV, aspect), fitFov(EMBODIED_FOV, aspect), move);
    } else camera.fov = fitFov(FOV, aspect);

    if (!camera.position.equals(pos)) camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    live.camPos.copy(camera.position);
    live.camQuat.copy(camera.quaternion);
  }, -20);

  return null;
}
