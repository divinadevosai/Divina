/**
 * React-facing mirror of the embodiment phase. The master clock is the
 * source of truth; this store only exists so DOM components re-render on
 * phase changes (a few times per journey, never per frame).
 */
import { create } from 'zustand';
import type { EmbodyPhase } from '@/core/clock/timeline';
import type { ModuleId } from '@/modules/ids';
import { clock } from '@/core/clock/masterClock';

interface EmbodyState {
  phase: EmbodyPhase;
  /** modules presented beside the figure, newest last, max 2 */
  presented: ModuleId[];
  /** the module the hand is currently carrying, if any */
  carrying: ModuleId | null;
  present(id: ModuleId): void;
  setCarrying(id: ModuleId | null): void;
  clearPresented(): void;
}

export const useEmbody = create<EmbodyState>((set, get) => ({
  phase: 'NORMAL',
  presented: [],
  carrying: null,
  present: (id) => {
    const rest = get().presented.filter((x) => x !== id);
    set({ presented: [...rest, id].slice(-2), carrying: id });
  },
  setCarrying: (carrying) => set({ carrying }),
  clearPresented: () => set({ presented: [], carrying: null }),
}));

if (typeof window !== 'undefined') {
  clock.onPhase(() => {
    const phase = clock.embodyPhase;
    useEmbody.setState({ phase });
    if (phase === 'NORMAL') useEmbody.getState().clearPresented();
  });
}
