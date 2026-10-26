import { create } from 'zustand';
import type { ModuleId } from '@/modules/ids';

export interface ModuleData<T = unknown> {
  status: 'idle' | 'loading' | 'ok' | 'unconfigured' | 'error';
  data?: T;
  /** human sentence: what is wrong and what to do about it */
  message?: string;
  /** where the numbers came from */
  source?: string;
  fetchedAt?: number;
}

interface DataState {
  modules: Partial<Record<ModuleId, ModuleData>>;
  put(id: ModuleId, d: ModuleData): void;
}

export const useData = create<DataState>((set) => ({
  modules: {},
  put: (id, d) => set((s) => ({ modules: { ...s.modules, [id]: d } })),
}));

export function getModuleData<T>(id: ModuleId): ModuleData<T> | undefined {
  return useData.getState().modules[id] as ModuleData<T> | undefined;
}
