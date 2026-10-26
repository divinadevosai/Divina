/**
 * The page's side of notes and agents: every change goes through /api/notes
 * and /api/agents (the app's server, or the browser edition's backend), then
 * the card redraws.
 */
import { create } from 'zustand';
import { refresh } from '@/modules/feeds';
import { useData } from '@/stores/data';
import { usePrefs } from '@/stores/prefs';
import type { Agent, Note } from '@/lib/personal';

const HEADERS = { 'content-type': 'application/json', 'x-divina-bridge': '1' };

async function post<T>(path: '/api/notes' | '/api/agents', op: Record<string, unknown>): Promise<{ ok: boolean; message?: string; items?: T[] }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: HEADERS, body: JSON.stringify(op) });
    const j = (await r.json()) as { ok: boolean; message?: string; notes?: T[]; agents?: T[] };
    if (j.ok) void refresh(path === '/api/notes' ? 'notes' : 'agents');
    return { ok: j.ok, message: j.message, items: j.notes ?? j.agents };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export const notesOp = (op: Record<string, unknown>) => post<Note>('/api/notes', op);
export const agentsOp = (op: Record<string, unknown>) => post<Agent>('/api/agents', op);

/** The agents as the Agents card last loaded them. */
export function knownAgents(): Agent[] {
  const md = useData.getState().modules.agents;
  return md?.status === 'ok' ? ((md.data as { agents: Agent[] }).agents ?? []) : [];
}

/** During a round-table, the agent who has the floor (voice and caption follow it). */
export const useSpeaker = create<{ agent: string | null; divina: boolean }>(() => ({ agent: null, divina: false }));

/** The agent being talked to (or speaking in a round-table), if it still exists. */
export function activeAgent(): Agent | null {
  const sp = useSpeaker.getState();
  if (sp.divina) return null;
  const id = sp.agent ?? usePrefs.getState().agent;
  return (id && knownAgents().find((a) => a.id === id)) || null;
}

// ── memory, routines, custom worlds ────────────────────────────────────────
import type { Memory, Routine } from '@/lib/personal';
import type { CustomWorld } from '@/lib/worlds';
import type { PersonalKind } from '@/lib/personalKinds';

interface PersonalState {
  memory: Memory[];
  routines: Routine[];
  worlds: CustomWorld[];
  loaded: boolean;
}
export const usePersonal = create<PersonalState>(() => ({ memory: [], routines: [], worlds: [], loaded: false }));

/** Load memory, routines and worlds (once at start, and after a restore). */
export async function loadPersonal() {
  const next: Partial<PersonalState> = { loaded: true };
  for (const kind of ['memory', 'routines', 'worlds'] as const) {
    try {
      const j = (await (await fetch(`/api/personal/${kind}`, { headers: HEADERS, cache: 'no-store' })).json()) as { ok: boolean; items?: unknown[] };
      if (j.ok && j.items) (next as Record<string, unknown>)[kind] = j.items;
    } catch {
      /* unreachable: keep what we have */
    }
  }
  usePersonal.setState(next);
}

export async function personalOp(kind: PersonalKind, op: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch(`/api/personal/${kind}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(op) });
    const j = (await r.json()) as { ok: boolean; message?: string; items?: unknown[] };
    if (j.ok && j.items) usePersonal.setState({ [kind]: j.items } as Partial<PersonalState>);
    return { ok: j.ok, message: j.message };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
