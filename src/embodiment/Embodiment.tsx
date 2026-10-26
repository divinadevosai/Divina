'use client';
/**
 * Phase 7 composition: bake on idle, capture at the command, run the one
 * buffer through the one clock, pose the figure, present with the hand.
 */
import { isPhone } from '@/lib/device';
import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { useSystem } from '@/stores/system';
import { live } from '@/render/live';
import { handCursor } from '@/stores/gesture';
import { pointer } from '@/render/pointer';
import { audio } from '@/audio/engine';
import { bakeBust, bakeHand, bakedBust } from './figureBake';
import { captureJourney, type JourneyAttributes } from './capture';
import { onCapture, transformTo } from './control';
import { Journey } from './Journey';
import { FigureExtras } from './FigureExtras';
import { Hand } from './Hand';
import { rig, updateRig, headPoint } from './rig';
import { BUST } from './sdf';

const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
const tmp = new THREE.Vector3();

let baking: Promise<unknown> | null = null;
function ensureBaked(gl: THREE.WebGLRenderer): Promise<unknown> {
  const t = useSystem.getState().tier;
  baking ??= bakeBust(gl, t).then(() => bakeHand(gl, t));
  return baking;
}

export function Embodiment() {
  const { gl, camera } = useThree();
  const tier = useSystem((s) => s.tier);
  const booted = useSystem((s) => s.booted);
  const [journey, setJourney] = useState<{ attrs: JourneyAttributes; bead: number } | null>(null);

  // Bake once, well off the start-up path: after the boot and the first
  // quality measurement, in idle time. Not again when the tier changes —
  // the nearest baked tier is used. Asking for the human form earlier bakes
  // at once and then transforms (below).
  useEffect(() => {
    // phones: only when the human form is asked for, to keep memory free for the room
    if (!booted || isPhone()) return;
    let cancelled = false;
    const start = () => !cancelled && ensureBaked(gl);
    const id = window.setTimeout(() => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 6000 });
      else start();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [gl, booted]);

  // Capture at the instant of the command. The particle count is frozen
  // from here until the ring returns.
  useEffect(
    () =>
      onCapture(() => {
        const fig = bakedBust(useSystem.getState().tier);
        if (!fig) {
          // not ready yet: bake now, then carry on with the transformation
          void ensureBaked(gl).then(() => transformTo('human', 'system'));
          return false;
        }
        const attrs = captureJourney(fig, camera as THREE.PerspectiveCamera);
        setJourney({ attrs, bead: fig.lattice * 0.8 });
        return true;
      }),
    [camera],
  );

  useEffect(
    () =>
      clock.onPhase(() => {
        if (clock.embodyPhase === 'NORMAL') {
          setJourney(null);
          live.cardErodeStart.fill(999);
          rig.gazeActive = false;
        }
      }),
    [],
  );

  useFrame(() => {
    if (!clock.embodied) return;
    // gaze: toward a presented panel, else toward the cursor when it moves
    const now = performance.now();
    if (live.panelGazeUntil > now) {
      live.gaze.copy(live.panelGaze);
      rig.gazeActive = true;
    } else if (handCursor.visible || (pointer.inside && now - pointer.lastMove < 2500)) {
      ndc.set(handCursor.visible ? handCursor.x * 2 - 1 : pointer.x, handCursor.visible ? -(handCursor.y * 2 - 1) : pointer.y);
      ray.setFromCamera(ndc, camera);
      live.gaze.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 1.4);
      rig.gazeActive = true;
    }
    updateRig(clock.dt);
    // the voice comes from the face — direction only, distance capped
    headPoint([0, BUST.mouthY, 0.08], tmp);
    tmp.applyMatrix4(camera.matrixWorldInverse);
    audio.setVoicePosition(tmp.x, tmp.y, tmp.z);
  }, -3);

  return (
    <>
      {journey && <Journey attrs={journey.attrs} beadRadius={journey.bead} />}
      <FigureExtras />
      <Hand />
    </>
  );
}
