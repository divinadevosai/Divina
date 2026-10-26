import { create } from 'zustand';

export type TrackingStatus = 'off' | 'loading' | 'searching' | 'tracking' | 'denied' | 'error';
export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export interface LogLine {
  id: number;
  t: number;
  level: LogLevel;
  text: string;
}

/** Quality tiers: 0 = minimal … 3 = full. */
export type Tier = 0 | 1 | 2 | 3;

interface SystemState {
  booted: boolean;
  webgl: 'unknown' | 'ok' | 'none';
  gpu: string;
  fps: number;
  tier: Tier;
  /** a tier change requested while a sequence ran; applied when the ring returns */
  pendingTier: Tier | null;
  tracking: TrackingStatus;
  hudVisible: boolean;
  logs: LogLine[];
  setBooted(): void;
  setWebgl(v: 'ok' | 'none', gpu?: string): void;
  setFps(f: number): void;
  requestTier(t: Tier, frozen: boolean): void;
  applyPendingTier(): void;
  setTracking(s: TrackingStatus): void;
  toggleHud(v?: boolean): void;
}

let logId = 0;
export const useSystem = create<SystemState>((set, get) => ({
  booted: false,
  webgl: 'unknown',
  gpu: '—',
  fps: 0,
  tier: 2,
  pendingTier: null,
  tracking: 'off',
  hudVisible: true,
  logs: [],
  setBooted: () => set({ booted: true }),
  setWebgl: (webgl, gpu) => set({ webgl, gpu: gpu ?? get().gpu }),
  setFps: (fps) => set({ fps }),
  requestTier: (t, frozen) => {
    if (t === get().tier) return set({ pendingTier: null });
    if (frozen) return set({ pendingTier: t });
    log('info', `quality tier → ${t}`);
    set({ tier: t, pendingTier: null });
  },
  applyPendingTier: () => {
    const p = get().pendingTier;
    if (p !== null && p !== get().tier) {
      log('info', `quality tier → ${p} (deferred)`);
      set({ tier: p, pendingTier: null });
    }
  },
  setTracking: (tracking) => set({ tracking }),
  toggleHud: (v) => set({ hudVisible: v ?? !get().hudVisible }),
}));

export function log(level: LogLevel, text: string) {
  const line: LogLine = { id: ++logId, t: Date.now(), level, text };
  useSystem.setState((s) => ({ logs: [...s.logs.slice(-40), line] }));
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug(`[divina:${level}] ${text}`);
  }
}
