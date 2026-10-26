/**
 * Notes and agents in the app: kept in the data folder (%APPDATA%\Divina when
 * installed), sealed with the same vault as the keys, so a copied file reads
 * as nothing on another PC or account.
 */
import 'server-only';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userDataDir } from './paths';
import { seal, unseal } from './vault';
import { agentsOp, notesOp, readAgents, readNotes, type Agent, type Note, type Result } from '@/lib/personal';
import { PERSONAL_KINDS, type PersonalKind } from '@/lib/personalKinds';

function store<T>(name: 'notes' | 'agents' | PersonalKind, parse: (raw: unknown) => T[]) {
  const file = () => join(userDataDir(), `${name}.local.json`);
  let cache: { mtime: number; items: T[] } = { mtime: -1, items: [] };
  const load = (): T[] => {
    const f = file();
    if (!existsSync(f)) return (cache = { mtime: 0, items: parse(undefined) }).items;
    const mtime = statSync(f).mtimeMs;
    if (mtime === cache.mtime) return cache.items;
    try {
      const opened = unseal(name, readFileSync(f, 'utf8').trim());
      cache = { mtime, items: opened === undefined ? [] : parse(JSON.parse(opened)) };
    } catch {
      cache = { mtime, items: [] };
    }
    return cache.items;
  };
  const save = (items: T[]) => {
    const f = file();
    mkdirSync(userDataDir(), { recursive: true });
    writeFileSync(`${f}.tmp`, seal(name, JSON.stringify(items)), { mode: 0o600 });
    renameSync(`${f}.tmp`, f);
    cache = { mtime: statSync(f).mtimeMs, items };
  };
  return { load, save };
}

const notes = store<Note>('notes', readNotes);
const agents = store<Agent>('agents', readAgents);

export const loadNotes = notes.load;
export const loadAgents = agents.load;
export const getAgent = (id: string | undefined) => (id ? agents.load().find((a) => a.id === id) : undefined);

export function changeNotes(op: unknown): Result<Note[]> {
  const r = notesOp(notes.load(), op);
  if (r.ok) notes.save(r.value);
  return r;
}
export function changeAgents(op: unknown): Result<Agent[]> {
  const r = agentsOp(agents.load(), op);
  if (r.ok) agents.save(r.value);
  return r;
}

// memory, routines, worlds: the same sealed storage, one shape for all
const stores = Object.fromEntries(Object.entries(PERSONAL_KINDS).map(([k, v]) => [k, store<unknown>(k as PersonalKind, v.parse as (raw: unknown) => unknown[])])) as Record<PersonalKind, ReturnType<typeof store<unknown>>>;

export const loadPersonal = (kind: PersonalKind) => stores[kind].load();
export function changePersonal(kind: PersonalKind, op: unknown): Result<unknown[]> {
  const r = PERSONAL_KINDS[kind].op(stores[kind].load() as never, op);
  if (r.ok) stores[kind].save(r.value);
  return r;
}
/** Replace everything of one kind (restoring a backup); checked like any other input. */
export function replacePersonal(kind: PersonalKind, raw: unknown) {
  stores[kind].save(PERSONAL_KINDS[kind].parse(raw));
}

export const replaceNotes = (raw: unknown) => notes.save(readNotes(raw));
export const replaceAgents = (raw: unknown) => agents.save(readAgents(raw));
