import { create } from 'zustand';

export type GestureName =
  | 'none'
  | 'open-hand'
  | 'closed-hand'
  | 'pinch'
  | 'release'
  | 'swipe-left'
  | 'swipe-right'
  | 'pull'
  | 'push'
  | 'palm-still'
  | 'circle'
  | 'two-hand-zoom'
  | 'two-hand-group'
  | 'two-hand-split'
  | 'multi-select'
  | 'point';

interface GestureState {
  gesture: GestureName;
  confidence: number;
  hands: number;
  at: number;
  set(g: GestureName, confidence: number): void;
  setHands(n: number): void;
}

export const useGesture = create<GestureState>((set, get) => ({
  gesture: 'none',
  confidence: 0,
  hands: 0,
  at: 0,
  set: (gesture, confidence) => {
    const s = get();
    if (s.gesture === gesture && Math.abs(s.confidence - confidence) < 0.04) return;
    set({ gesture, confidence, at: performance.now() });
  },
  setHands: (hands) => get().hands !== hands && set({ hands }),
}));

/**
 * Per-frame hand cursor, mutated in place by the tracker and read by the
 * renderer. Coordinates are normalised screen space, x right, y down, 0..1.
 */
export const handCursor = {
  visible: false,
  x: 0.5,
  y: 0.5,
  /** relative palm scale vs calibrated baseline, >1 = closer */
  depth: 1,
  pinching: false,
  hands: [] as { x: number; y: number; pinch: boolean; open: boolean }[],
  /** history for light trails */
  trail: [] as { x: number; y: number; t: number }[],
};
