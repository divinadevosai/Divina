/**
 * Dispatch: parse with the shared parser, run on this platform's table.
 * Unknown verbs never reach an implementation.
 */
import { MAC } from './mac';
import { WINDOWS } from './windows';
import { ArgError, fail, PARSERS, VERBS, type BridgeDeps, type PlatformTable, type Verb, type VerbArgs, type VerbResult } from './common';

export * from './common';
export { MAC } from './mac';
export { WINDOWS } from './windows';

export const PLATFORMS: Partial<Record<NodeJS.Platform, PlatformTable>> = { darwin: MAC, win32: WINDOWS };

export function isVerb(v: unknown): v is Verb {
  return typeof v === 'string' && (VERBS as readonly string[]).includes(v);
}

export async function dispatch(verb: unknown, rawArgs: unknown, deps: BridgeDeps): Promise<VerbResult> {
  if (!isVerb(verb)) return fail(400, `Unknown verb. Allowed: ${VERBS.join(', ')}.`);
  const table = PLATFORMS[deps.platform];
  if (!table) return fail(501, `Desktop control supports macOS and Windows; this server runs on ${deps.platform}.`);
  const raw = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
  return runTyped(verb, raw, deps, table);
}

async function runTyped<V extends Verb>(verb: V, raw: Record<string, unknown>, deps: BridgeDeps, table: PlatformTable): Promise<VerbResult> {
  let args: VerbArgs[V];
  try {
    args = PARSERS[verb](raw);
  } catch (e) {
    if (e instanceof ArgError) return fail(422, `${verb}: ${e.message}.`);
    throw e;
  }
  return (table[verb] as (a: VerbArgs[V], d: BridgeDeps) => Promise<VerbResult>)(args, deps);
}
