'use client';
import { useFrame } from '@react-three/fiber';
import { clock } from '@/core/clock/masterClock';

/** Advances the master clock exactly once per frame, before every reader. */
export function ClockDriver() {
  useFrame((_, dt) => clock.tick(dt), -1000);
  return null;
}
