'use client';
/**
 * Drives the on-demand canvas: a frame whenever the governor says the room
 * is live, and a slow trickle otherwise (see src/render/governor.ts).
 */
import { isPhone } from '@/lib/device';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { bus } from '@/core/bus';
import { useAI } from '@/stores/ai';
import { useRing } from '@/stores/ring';
import { useSystem } from '@/stores/system';
import { useWorld } from '@/stores/world';
import { useEmbody } from '@/stores/embody';
import { tracker } from '@/gesture/tracker';
import { faceVersion } from '../cards/faces';
import { planetMoving } from '../world/Planet';
import { idleIntervalMs, isAwake, keepAwakeWhile, settleCheck, wake } from '../governor';

let registered = false;
function registerConditions() {
  if (registered) return;
  registered = true;
  keepAwakeWhile('boot', () => !useSystem.getState().booted);
  keepAwakeWhile('hands', () => tracker.active);
  keepAwakeWhile('assistant', () => {
    const s = useAI.getState().status;
    return s !== 'idle' && s !== 'offline';
  });
  keepAwakeWhile('planet', () => planetMoving);
  keepAwakeWhile('weather', () => {
    const w = useWorld.getState();
    return w.weatherActive && (w.weather === 'rain' || w.weather === 'snow' || w.weather === 'storm');
  });
}

export function FrameGovernor() {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    registerConditions();
    let raf = 0;
    let lastDraw = 0;
    let lastFace = faceVersion;
    const minGap = isPhone() ? 1000 / 30 : 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (faceVersion !== lastFace) {
        lastFace = faceVersion;
        wake(400, 'card redraw');
      }
      // phones draw at most 30 frames a second (120 Hz screens would otherwise draw 4x that)
      if ((isAwake(t) && t - lastDraw >= minGap - 1) || t - lastDraw >= idleIntervalMs) {
        lastDraw = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);

    const onInput = (e: Event) => wake(undefined, e.type);
    const events = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'resize', 'focus'] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    // Stores that change what's drawn. Not the system store (it reports FPS, which would never let the
    // room rest) and not data (a data change redraws a face, which wakes us through faceVersion).
    const stores = { ai: useAI, ring: useRing, world: useWorld, embody: useEmbody };
    const offs = [bus.on((i) => wake(2500, `bus:${i.type}`)), ...Object.entries(stores).map(([n, s]) => (s as { subscribe: (f: () => void) => () => void }).subscribe(() => wake(undefined, `store:${n}`)))];
    wake(3000);
    return () => {
      cancelAnimationFrame(raf);
      for (const e of events) window.removeEventListener(e, onInput);
      for (const off of offs) off?.();
    };
  }, [invalidate]);

  // after the frame is drawn (PostFX renders at priority 1)
  useFrame(() => settleCheck(), 5);
  return null;
}
