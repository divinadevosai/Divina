/**
 * Ask the person before an AI-initiated action that could leak or change
 * something. Resolves false on "Deny" or after a timeout — silence is no.
 */
import { create } from 'zustand';

export interface Pending {
  id: number;
  title: string;
  detail?: string;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: Pending | null;
  ask(title: string, detail?: string, timeoutMs?: number): Promise<boolean>;
  answer(ok: boolean): void;
}

let n = 0;

export const useConfirm = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (title, detail, timeoutMs = 20_000) =>
    new Promise<boolean>((resolve) => {
      get().pending?.resolve(false);
      const id = ++n;
      const timer = window.setTimeout(() => {
        if (get().pending?.id === id) get().answer(false);
      }, timeoutMs);
      set({
        pending: {
          id,
          title,
          detail,
          resolve: (ok) => {
            window.clearTimeout(timer);
            resolve(ok);
          },
        },
      });
    }),
  answer: (ok) => {
    const p = get().pending;
    set({ pending: null });
    p?.resolve(ok);
  },
}));
