'use client';
/** The desktop licence, as the page sees it (server side: src/lib/server/licence.ts). */
import { create } from 'zustand';
import { WEB } from '@/lib/edition';

export interface LicenceStatus {
  ok: boolean;
  required: boolean;
  state: 'not-required' | 'none' | 'active' | 'offline' | 'revoked';
  email?: string;
  product?: string;
  activatedAt?: number;
  checkedAt?: number;
  message?: string;
  buyUrl: string;
}

interface LicenceStore {
  status: LicenceStatus | null;
  busy: boolean;
  set: (s: Partial<LicenceStore>) => void;
}

export const useLicence = create<LicenceStore>((set) => ({ status: null, busy: false, set }));

const HEADERS = { 'content-type': 'application/json', 'x-divina-bridge': '1' };

async function ask(init?: RequestInit): Promise<LicenceStatus | null> {
  try {
    const r = await fetch('/api/licence', { headers: HEADERS, ...init });
    if (!r.ok) return null;
    return (await r.json()) as LicenceStatus;
  } catch {
    return null;
  }
}

/** Where the licence stands. The browser and iPhone editions never need one. */
export async function loadLicence() {
  if (WEB) return;
  const s = await ask();
  // no answer at all (an older server): don't lock anyone out
  useLicence.getState().set({ status: s ?? { ok: true, required: false, state: 'not-required', buyUrl: '' } });
}

async function post(body: object) {
  useLicence.getState().set({ busy: true });
  const s = await ask({ method: 'POST', body: JSON.stringify(body) });
  useLicence.getState().set({ busy: false, ...(s ? { status: s } : {}) });
  return s;
}

export const activateLicence = (key: string) => post({ op: 'activate', key });
export const deactivateLicence = (force = false) => post({ op: 'deactivate', force });
export const checkLicence = () => post({ op: 'check' });
