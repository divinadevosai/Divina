/**
 * The verb vocabulary, shared by every platform.
 *
 * Verbs are a closed enum. Each has ONE hand-written parser here and a
 * hand-written implementation in every platform table (mac.ts, windows.ts).
 * Both tables are typed as mapped types over `Verb`, so adding a name to
 * VERBS is a compile error until its parser and BOTH implementations exist
 * (an implementation may be an explicit, explained refusal).
 *
 * Deliberately absent: shutdown, restart, file deletion, force-quit. A
 * misheard word must not be able to destroy unsaved work.
 */
import type { Runner } from './exec';
import type { InstalledApp } from './apps';
import { MUSIC_SERVICES, cleanQuery, type MusicService } from '@/lib/music';

export const VERBS = [
  'launch_app',
  'open_url',
  'media',
  'volume',
  'screenshot',
  'clipboard_read',
  'clipboard_write',
  'hide_others',
  'quit_app',
  'lock_screen',
  'sleep_display',
  'dnd',
  'create_note',
  'create_reminder',
  'list_apps',
  'list_displays',
  'now_playing',
  'play_search',
] as const;
export type Verb = (typeof VERBS)[number];

export const MEDIA_ACTIONS = ['play', 'pause', 'playpause', 'next', 'previous'] as const;
export type MediaAction = (typeof MEDIA_ACTIONS)[number];
export const PLAYERS = ['Spotify', 'Music'] as const;
export type Player = (typeof PLAYERS)[number];

export interface VerbArgs {
  launch_app: { name: string };
  open_url: { url: string; target?: string; browser?: 'chrome' | 'safari' | 'edge' | 'default' };
  media: { action: MediaAction; player?: Player };
  volume: { level?: number; delta?: number; mute?: boolean };
  screenshot: Record<string, never>;
  clipboard_read: Record<string, never>;
  clipboard_write: { text: string };
  hide_others: Record<string, never>;
  quit_app: { name: string };
  lock_screen: Record<string, never>;
  sleep_display: Record<string, never>;
  dnd: { on: boolean };
  create_note: { title: string; body: string };
  create_reminder: { title: string; inMinutes?: number };
  list_apps: Record<string, never>;
  list_displays: Record<string, never>;
  now_playing: Record<string, never>;
  play_search: { service: MusicService; query: string };
}

export interface VerbResult {
  ok: boolean;
  status: number;
  message: string;
  data?: unknown;
  setting?: string;
}

export interface BridgeDeps {
  platform: NodeJS.Platform;
  /** execFile-style, waits for exit */
  run: Runner;
  /** spawn detached (GUI apps that keep running); never a shell */
  launch: (file: string, args: readonly string[]) => void;
  scanApps: () => Promise<InstalledApp[]>;
  exists: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  sleep: (ms: number) => Promise<void>;
}

export class ArgError extends Error {}

// ── argument helpers ───────────────────────────────────────────────
export function str(raw: Record<string, unknown>, k: string, max = 500, required = true): string {
  const v = raw[k];
  if (v === undefined && !required) return '';
  if (typeof v !== 'string' || !v.trim()) throw new ArgError(`"${k}" must be a non-empty string`);
  if (v.length > max) throw new ArgError(`"${k}" is too long`);
  return v;
}
export function num(raw: Record<string, unknown>, k: string, min: number, max: number): number | undefined {
  const v = raw[k];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ArgError(`"${k}" must be a number`);
  return Math.min(max, Math.max(min, Math.round(v)));
}
export function oneOf<T extends string>(raw: Record<string, unknown>, k: string, allowed: readonly T[]): T | undefined {
  const v = raw[k];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new ArgError(`"${k}" must be one of ${allowed.join(', ')}`);
  return v as T;
}
export const none = () => ({}) as Record<string, never>;

export const ok = (message: string, data?: unknown): VerbResult => ({ ok: true, status: 200, message, data });
export const fail = (status: number, message: string, setting?: string): VerbResult => ({ ok: false, status, message, setting });

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export type Parsers = { [V in Verb]: (raw: Record<string, unknown>) => VerbArgs[V] };
export type PlatformTable = { [V in Verb]: (args: VerbArgs[V], deps: BridgeDeps) => Promise<VerbResult> };

export const PARSERS: Parsers = {
  launch_app: (r) => ({ name: str(r, 'name', 120) }),
  open_url(r) {
    const raw = str(r, 'url', 2048).trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    let u: URL;
    try {
      u = new URL(withScheme);
    } catch {
      throw new ArgError('not a valid URL');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ArgError('only http(s) URLs can be opened');
    if (u.username || u.password) throw new ArgError('URLs with embedded credentials are refused');
    return {
      url: u.toString(),
      target: typeof r.target === 'string' ? r.target.slice(0, 60) : 'secondary',
      browser: oneOf(r, 'browser', ['chrome', 'safari', 'edge', 'default'] as const) ?? 'default',
    };
  },
  media: (r) => ({ action: oneOf(r, 'action', MEDIA_ACTIONS) ?? 'playpause', player: oneOf(r, 'player', PLAYERS) }),
  volume(r) {
    const out = { level: num(r, 'level', 0, 100), delta: num(r, 'delta', -100, 100), mute: typeof r.mute === 'boolean' ? r.mute : undefined };
    if (out.level === undefined && out.delta === undefined && out.mute === undefined) throw new ArgError('give level, delta or mute');
    return out;
  },
  screenshot: none,
  clipboard_read: none,
  clipboard_write: (r) => ({ text: str(r, 'text', 20_000) }),
  hide_others: none,
  quit_app: (r) => ({ name: str(r, 'name', 120) }),
  lock_screen: none,
  sleep_display: none,
  dnd(r) {
    if (typeof r.on !== 'boolean') throw new ArgError('"on" must be true or false');
    return { on: r.on };
  },
  create_note: (r) => ({ title: str(r, 'title', 200), body: str(r, 'body', 20_000, false) }),
  create_reminder: (r) => ({ title: str(r, 'title', 300), inMinutes: num(r, 'inMinutes', 1, 60 * 24 * 365) }),
  list_apps: none,
  list_displays: none,
  now_playing: none,
  play_search(r) {
    const query = cleanQuery(str(r, 'query', 300));
    if (!query) throw new ArgError('"query" must be a non-empty string');
    return { service: oneOf(r, 'service', MUSIC_SERVICES) ?? 'spotify', query };
  },
};
