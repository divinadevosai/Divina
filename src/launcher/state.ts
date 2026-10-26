import { create } from 'zustand';

interface LauncherState {
  open: boolean;
  set(v: boolean): void;
}
export const useLauncher = create<LauncherState>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openLauncher = () => useLauncher.getState().set(true);
