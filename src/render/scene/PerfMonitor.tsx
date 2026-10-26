'use client';
/**
 * FPS + adaptive quality. Judgement is SUSPENDED while any sequence runs,
 * and tier changes requested then are deferred until the ring returns:
 * rebuilding particle buffers mid-transformation would drop every
 * particle's figure point.
 */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { clock } from '@/core/clock/masterClock';
import { useSystem, type Tier } from '@/stores/system';
import { isAwake } from '../governor';

export function PerfMonitor() {
  const acc = useRef({ frames: 0, time: 0, low: 0, high: 0 });
  const locked = typeof location !== 'undefined' && new URLSearchParams(location.search).has('tier');
  useFrame((_, dt) => {
    const a = acc.current;
    // Resting frames are deliberately slow; they say nothing about the GPU.
    if (!isAwake()) {
      a.frames = a.time = a.low = a.high = 0;
      return;
    }
    a.frames++;
    a.time += dt;
    if (a.time < 0.5) return;
    const fps = a.frames / a.time;
    a.frames = 0;
    a.time = 0;
    const sys = useSystem.getState();
    sys.setFps(fps);
    const busy = clock.embodied || clock.presentationActive;
    if (busy) {
      a.low = a.high = 0;
      return;
    }
    // a quality set in the address (?tier=2) stays put: for testing and filming
    if (locked) return;
    if (sys.pendingTier !== null) sys.applyPendingTier();
    if (fps < 45) a.low++;
    else a.low = 0;
    if (fps > 58) a.high++;
    else a.high = 0;
    if (a.low >= 6 && sys.tier > 0) {
      a.low = 0;
      sys.requestTier((sys.tier - 1) as Tier, false);
    } else if (a.high >= 30 && sys.tier < maxTier) {
      a.high = 0;
      sys.requestTier((sys.tier + 1) as Tier, false);
    }
  });
  return null;
}

let maxTier: Tier = 3;
export function setMaxTier(t: Tier) {
  maxTier = t;
}
