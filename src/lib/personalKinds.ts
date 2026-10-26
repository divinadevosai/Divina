/** The person's own collections beyond notes and agents, and how each is checked and changed. */
import { memoryOp, readMemories, readRoutines, routinesOp, type Result } from './personal';
import { readWorlds, worldsOp } from './worlds';

type Kind = { parse: (raw: unknown) => unknown[]; op: (items: never, op: unknown) => Result<unknown[]> };

export const PERSONAL_KINDS = {
  memory: { parse: readMemories, op: memoryOp },
  routines: { parse: readRoutines, op: routinesOp },
  worlds: { parse: readWorlds, op: worldsOp },
} satisfies Record<string, Kind>;

export type PersonalKind = keyof typeof PERSONAL_KINDS;
export const isPersonalKind = (k: string): k is PersonalKind => Object.hasOwn(PERSONAL_KINDS, k);
