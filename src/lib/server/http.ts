import 'server-only';
import { redactSecrets } from './settings';
import { CONTACT } from '@/lib/contact';

// MET Norway and OpenStreetMap ask every app to name itself and a contact;
// only they get it. Everyone else gets the plain identity Divina always sent
// (ESPN refused requests once the contact was added to every call).
const IDENTIFY = new Set(['api.met.no', 'nominatim.openstreetmap.org']);
const PLAIN_AGENT = 'Divina/0.8 (self-hosted personal assistant)';
const agentFor = (url: string) => (IDENTIFY.has(new URL(url).host) ? `Divina/0.8 (+${CONTACT})` : PLAIN_AGENT);

/** Result a provider returns; `unconfigured` carries the instruction. */
export type ProviderResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000);
  try {
    const send = (agent: string | null) =>
      fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { ...(agent ? { 'user-agent': agent } : {}), accept: 'application/json', ...(init.headers ?? {}) },
        cache: 'no-store',
      });
    let res = await send(agentFor(url));
    // Some public feeds turn away named clients: one retry as a plain request.
    if (res.status === 403 && !IDENTIFY.has(new URL(url).host)) res = await send(null);
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}`, text.slice(0, 600));
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': agentFor(url) }, cache: 'no-store' });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Tiny TTL cache so polling cards never hammer an upstream. */
const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function describeError(err: unknown): string {
  if (err instanceof HttpError) return redactSecrets(err.message);
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'upstream timed out';
    return redactSecrets(err.message);
  }
  return redactSecrets(String(err));
}
