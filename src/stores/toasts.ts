import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'ok' | 'warn' | 'info';
  text: string;
  detail?: string;
  image?: string;
  /** how long it stays, ms */
  ms?: number;
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

let n = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++n;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.ms ?? (t.image ? 9000 : 6000));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
