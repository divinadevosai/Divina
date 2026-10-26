/**
 * Static module metadata: identity, accent, spoken aliases.
 *
 * Accents are spread across violet → blue → cyan (270° → 180°) so each
 * module is recognisable in peripheral vision while the ring turns. Nothing
 * here is warm: warm hues are reserved for gold (centre) and orange (warning).
 */
import { MODULE_IDS, type ModuleId } from './ids';

export interface ModuleMeta {
  id: ModuleId;
  title: string;
  code: string; // 3-letter Teenage-Engineering-style label
  hue: number; // degrees
  aliases: string[];
  refreshMs: number;
}

const base: Record<ModuleId, Omit<ModuleMeta, 'id' | 'hue'>> = {
  instagram: { title: 'Instagram', code: 'IGM', aliases: ['instagram', 'insta', 'reels', 'followers', 'social'], refreshMs: 10 * 60_000 },
  stocks: { title: 'Stocks', code: 'STK', aliases: ['stocks', 'stock', 'portfolio', 'market', 'markets', 'shares'], refreshMs: 60_000 },
  crypto: { title: 'Crypto', code: 'CRY', aliases: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'coins', 'btc'], refreshMs: 5 * 60_000 },
  projects: { title: 'Projects', code: 'PRJ', aliases: ['projects', 'project', 'work', 'repos', 'my work'], refreshMs: 15 * 60_000 },
  sports: { title: 'Sports', code: 'SPT', aliases: ['sports', 'sport', 'scores', 'football', 'soccer', 'fixtures', 'standings'], refreshMs: 2 * 60_000 },
  calendar: { title: 'Calendar', code: 'CAL', aliases: ['calendar', 'schedule', 'agenda', 'events', 'meetings'], refreshMs: 5 * 60_000 },
  notes: { title: 'Notes', code: 'NTS', aliases: ['notes', 'note', 'to do', 'to-do', 'todo', 'to do list', 'list', 'my list', 'shopping list', 'reminders'], refreshMs: 60 * 60_000 },
  agents: { title: 'Agents', code: 'AGT', aliases: ['agents', 'agent', 'my agents', 'assistants', 'bots', 'helpers'], refreshMs: 60 * 60_000 },
  email: { title: 'Email', code: 'EML', aliases: ['email', 'emails', 'mail', 'inbox', 'messages', 'gmail'], refreshMs: 3 * 60_000 },
  weather: { title: 'Weather', code: 'WTH', aliases: ['weather', 'forecast', 'temperature', 'rain'], refreshMs: 10 * 60_000 },
  ai: { title: 'AI', code: 'AIX', aliases: ['ai', 'assistant', 'knowledge', 'brain', 'intelligence'], refreshMs: 30_000 },
  news: { title: 'News', code: 'NWS', aliases: ['news', 'headlines', 'articles', 'ai news'], refreshMs: 10 * 60_000 },
  music: { title: 'Music', code: 'MSC', aliases: ['music', 'song', 'now playing', 'playing', 'audio', 'track'], refreshMs: 10_000 },
  system: { title: 'System', code: 'SYS', aliases: ['system', 'diagnostics', 'cpu', 'memory', 'battery', 'status'], refreshMs: 6_000 }, // each refresh re-uploads the card: live enough, not wasteful
};

export const MODULES: ModuleMeta[] = MODULE_IDS.map((id, i) => ({
  id,
  ...base[id],
  hue: 270 - (90 * i) / (MODULE_IDS.length - 1),
}));

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleMeta>;

export function moduleIndex(id: ModuleId): number {
  return MODULE_IDS.indexOf(id);
}

/** hsl → linear-ish rgb 0..1 (sRGB), for canvases and shaders alike. */
export function hueRgb(h: number, s = 0.75, l = 0.62): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

export function hueCss(h: number, s = 75, l = 62, a = 1): string {
  return `hsla(${h.toFixed(1)}, ${s}%, ${l}%, ${a})`;
}
