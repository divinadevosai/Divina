/**
 * Carousel state. Discrete, human-rate state lives here; per-frame values
 * (spring positions, hand cursor) live in mutable objects owned by the
 * renderer so React never re-renders at 60 Hz.
 */
import { create } from 'zustand';
import { MODULE_IDS, type ModuleId } from '@/modules/ids';
import { WEB } from '@/lib/edition';

export type CardState = 'idle' | 'hovered' | 'selected' | 'expanded' | 'focused' | 'dragging';

interface RingState {
  /** index of the card slot facing the user (can be any integer; wraps) */
  frontStep: number;
  hovered: ModuleId | null;
  selected: ModuleId[];
  expanded: ModuleId | null;
  dragging: ModuleId | null;
  frozen: boolean;
  /** 1 = default radius; >1 split, <1 grouped */
  spread: number;
  zoom: number;
  rotate(steps: number): void;
  setFront(id: ModuleId): void;
  hover(id: ModuleId | null): void;
  select(id: ModuleId, additive?: boolean): void;
  clearSelection(): void;
  expand(id: ModuleId | null): void;
  drag(id: ModuleId | null): void;
  setFrozen(v: boolean): void;
  setSpread(v: number): void;
  setZoom(v: number): void;
}

const N = MODULE_IDS.length;

export const useRing = create<RingState>((set, get) => ({
  // the browser edition opens on a card that works without the app
  frontStep: WEB ? MODULE_IDS.indexOf('weather') : 0,
  hovered: null,
  selected: [],
  expanded: null,
  dragging: null,
  frozen: false,
  spread: 1,
  zoom: 1,
  rotate: (steps) => {
    if (get().frozen) return;
    set({ frontStep: get().frontStep + steps });
  },
  setFront: (id) => {
    const idx = MODULE_IDS.indexOf(id);
    const cur = get().frontStep;
    const curIdx = ((cur % N) + N) % N;
    let d = idx - curIdx;
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    set({ frontStep: cur + d });
  },
  hover: (hovered) => get().hovered !== hovered && set({ hovered }),
  select: (id, additive) =>
    set((s) => ({
      selected: additive ? (s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]) : [id],
    })),
  clearSelection: () => set({ selected: [] }),
  expand: (expanded) => set({ expanded }),
  drag: (dragging) => set({ dragging }),
  setFrozen: (frozen) => set({ frozen }),
  setSpread: (spread) => set({ spread: Math.min(1.45, Math.max(0.7, spread)) }),
  setZoom: (zoom) => set({ zoom: Math.min(1.4, Math.max(0.75, zoom)) }),
}));

export function frontModule(step: number): ModuleId {
  return MODULE_IDS[((step % N) + N) % N];
}

export function cardStateOf(id: ModuleId, s: Pick<RingState, 'hovered' | 'selected' | 'expanded' | 'dragging' | 'frontStep'>): CardState {
  if (s.dragging === id) return 'dragging';
  if (s.expanded === id) return 'expanded';
  if (s.selected.includes(id)) return 'selected';
  if (s.hovered === id) return 'hovered';
  if (frontModule(s.frontStep) === id) return 'focused';
  return 'idle';
}
