/**
 * window.__divina — verification surface for the screenshot harness and for
 * anyone poking at the room from DevTools. Read-mostly.
 */
import { clock } from '@/core/clock/masterClock';
import { live } from '@/render/live';
import { bus } from '@/core/bus';
import { useRing } from '@/stores/ring';
import { useSystem } from '@/stores/system';
import { useAI } from '@/stores/ai';
import { useWorld } from '@/stores/world';
import { useEmbody } from '@/stores/embody';
import { useData } from '@/stores/data';
import { voice } from '@/ai/tts';
import { rig } from '@/embodiment/rig';

export function installDebug(extra: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const api = {
    clock,
    live,
    bus,
    voice,
    rig,
    stores: { ring: useRing, system: useSystem, ai: useAI, world: useWorld, embody: useEmbody, data: useData },
    /**
     * Sample the ring angle and camera pose for `ms` with no input and report
     * the maximum deviation. With motion locked every number must be 0.
     */
    async verifyStillness(ms = 4000) {
      const a0 = live.ringAngle;
      const p0 = live.camPos.clone();
      const q0 = live.camQuat.clone();
      let dA = 0;
      let dP = 0;
      let dQ = 0;
      let frames = 0;
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          frames++;
          dA = Math.max(dA, Math.abs(live.ringAngle - a0));
          dP = Math.max(dP, live.camPos.distanceTo(p0));
          const q = live.camQuat;
          dQ = Math.max(dQ, Math.abs(q.x - q0.x), Math.abs(q.y - q0.y), Math.abs(q.z - q0.z), Math.abs(q.w - q0.w));
          if (performance.now() - t0 < ms) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return { ms, frames, motion: clock.motion, ringAngleDrift: dA, cameraPositionDrift: dP, cameraRotationDrift: dQ };
    },
    ...extra,
  };
  (window as unknown as { __divina: typeof api }).__divina = api;
}
