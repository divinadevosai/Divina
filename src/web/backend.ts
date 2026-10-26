/**
 * The browser edition's "server". There is no server: the page's own calls to
 * /api/* are answered here, in the visitor's browser.
 *
 *   - settings live in this browser's localStorage; the visitor's own API
 *     keys (Gemini, Claude, OpenAI, ElevenLabs, CoinGecko) are stored only
 *     encrypted (see vault.ts) and never leave the browser, except each key
 *     going straight to its own company with each request
 *   - weather (MET Norway), news (Hacker News via Algolia), the AI and the
 *     voice are fetched directly from their public APIs
 *   - the calendar is an .ics file the visitor picks; it stays in the browser
 *   - stocks, sports, Instagram, projects and desktop control are part of the
 *     Windows app and say so
 *
 * The shared pieces (Gemini, the chat turn, the settings rules, the iCal
 * reader) are the same code the app's server runs.
 */
import { makeAI, ADD_KEY, AI_NAMES, agentSettings } from '@/lib/ai/providers';
import { agentsOp, notesOp, readAgents, readNotes, type Agent, type Note } from '@/lib/personal';
import { PERSONAL_KINDS, isPersonalKind, type PersonalKind } from '@/lib/personalKinds';
import { BACKUP_PREFS, openBackup, restorable, sealBackup, type BackupPayload } from '@/lib/backup';
import { parseChatBody, SSE_HEADERS } from '@/lib/ai/chat';
import { SECRET, SETTING_KEYS, checkSetting, publicSetting, type PublicSetting, type SettingKey } from '@/lib/settingsSchema';
import { isSealed, seal, unseal } from './vault';
import { parseIcs } from '@/lib/ics';
import { CRYPTO_UNCONFIGURED, DEFAULT_CURRENCY, coinIds, marketsUrl, toCryptoData, unknownCoins } from '@/lib/crypto/coingecko';
import { metForecastUrl, metToWeather, nominatimSearchUrl, placeFrom, type MetResponse, type NominatimHit } from '@/lib/weather/met';
import { EXTENSION, FULL_APP_NOTE, IOS, inFullApp } from '@/lib/edition';

/** What the page calls where it runs. */
const HERE = IOS ? 'this iPhone' : 'this browser';
import type { CalendarData, NewsArticle, NewsData, SystemData } from '@/modules/types';
import { prefStorage } from '@/lib/consent';

// ── storage (every access guarded: private windows can refuse it) ──────────
const SETTINGS_KEY = 'divina.settings.v1';
export const CALENDAR_KEY = 'divina.calendar.v1';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Settings this edition keeps; the rest belong to the app. */
const WEB_KEYS = new Set<SettingKey>([
  'DIVINA_AI_PROVIDER',
  'DIVINA_TTS_PROVIDER',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_TTS_VOICE',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE',
  'ELEVENLABS_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_TTS_MODEL',
  'GEMINI_VOICE',
  'DIVINA_VOICE_MODE',
  'DIVINA_THINKING',
  'DIVINA_CITY',
  'DIVINA_NEWS_TOPIC',
  'DIVINA_COINGECKO_KEY',
  'DIVINA_CRYPTO',
  'DIVINA_CRYPTO_CURRENCY',
]);

/**
 * Secrets, opened once when the page starts and then held only in this tab's
 * memory. On disk (localStorage) they exist only sealed.
 */
const secrets: Partial<Record<SettingKey, string>> = {};

function loadPlain(): Record<string, unknown> {
  try {
    const raw = JSON.parse(read(SETTINGS_KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function loadSettings(): Partial<Record<SettingKey, string>> {
  const raw = loadPlain();
  const out: Partial<Record<SettingKey, string>> = {};
  for (const k of WEB_KEYS) {
    const v = SECRET.has(k) ? secrets[k] : raw[k];
    if (typeof v === 'string' && !checkSetting(k, v)) out[k] = v;
  }
  return out;
}

/** Write settings: plain ones as they are, secrets sealed. A secret that can't be sealed is kept for this tab only. */
async function saveAll(values: Partial<Record<SettingKey, string>>): Promise<boolean> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values) as [SettingKey, string][]) {
    if (!SECRET.has(k)) out[k] = v;
    else {
      const sealed = await seal(k, v);
      if (sealed) out[k] = sealed; // else: never written in the clear
    }
  }
  return write(SETTINGS_KEY, JSON.stringify(out));
}

// Notes and agents: personal, so stored sealed like the keys, and held in memory once opened.
const NOTES_KEY = 'divina.notes.v1';
const AGENTS_KEY = 'divina.agents.v1';
let notes: Note[] = [];
let agents: Agent[] = [];
// memory, routines, worlds: same sealed storage
const personal = {} as Record<PersonalKind, unknown[]>;
const personalKey = (k: PersonalKind) => `divina.${k}.v1`;

async function savePersonal(key: string, name: 'notes' | 'agents' | PersonalKind, items: unknown[]) {
  const sealed = await seal(name, JSON.stringify(items));
  if (sealed) write(key, sealed); // no key store in this browser: kept for this tab only
}
async function openPersonal<T>(key: string, name: 'notes' | 'agents' | PersonalKind, parse: (raw: unknown) => T[]): Promise<T[]> {
  const v = read(key);
  if (!v) return parse(undefined);
  const opened = await unseal(name, v);
  try {
    return opened === undefined ? [] : parse(JSON.parse(opened));
  } catch {
    return [];
  }
}

/** Open saved secrets; seal any an older version of Divina saved in the clear. */
const ready: Promise<void> = (async () => {
  if (typeof window === 'undefined') return;
  const raw = loadPlain();
  let plainFound = false;
  for (const k of WEB_KEYS) {
    const v = raw[k];
    if (!SECRET.has(k) || typeof v !== 'string') continue;
    if (isSealed(v)) {
      const open = await unseal(k, v);
      if (open !== undefined) secrets[k] = open;
    } else {
      secrets[k] = v;
      plainFound = true;
    }
  }
  if (plainFound) await saveAll(loadSettings());
  notes = await openPersonal(NOTES_KEY, 'notes', readNotes);
  agents = await openPersonal(AGENTS_KEY, 'agents', readAgents);
  for (const k of Object.keys(PERSONAL_KINDS) as PersonalKind[]) personal[k] = await openPersonal<unknown>(personalKey(k), k, PERSONAL_KINDS[k].parse as (raw: unknown) => unknown[]);
})().catch(() => {});

const setting = (k: string): string | undefined => loadSettings()[k as SettingKey] || undefined;

function publicSettings(): Record<SettingKey, PublicSetting> {
  const saved = loadSettings();
  const out = {} as Record<SettingKey, PublicSetting>;
  for (const k of SETTING_KEYS) out[k] = publicSetting(k, saved[k], saved[k] !== undefined ? 'panel' : 'default');
  return out;
}

const ai = makeAI(setting, { browser: true, fetcher: (...a) => realFetch(...a) });

// ── small helpers ──────────────────────────────────────────────────────────
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await realFetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

const memo = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}

/** A guard against loops burning the visitor's own key: per-minute caps. */
const recent: Record<string, number[]> = {};
function allow(kind: string, perMinute: number): boolean {
  const now = Date.now();
  const list = (recent[kind] = (recent[kind] ?? []).filter((t) => now - t < 60_000));
  if (list.length >= perMinute) return false;
  list.push(now);
  return true;
}

/** Scrub any saved key out of text shown on screen. */
const redact = (text: string) => {
  let out = text;
  for (const v of Object.values(secrets)) if (v && v.length >= 6) out = out.split(v).join('…');
  return out;
};

const message = (err: unknown) => (err instanceof Error ? (err.name === 'TimeoutError' ? 'upstream timed out' : err.message) : String(err));

// ── modules ────────────────────────────────────────────────────────────────
async function weather(q: URLSearchParams) {
  const city = setting('DIVINA_CITY');
  let lat = Number(q.get('lat'));
  let lon = Number(q.get('lon'));
  let place = 'Near you'; // coordinates are never sent anywhere just to name them
  if (city) {
    // looked up once per city and remembered in this browser
    const memoKey = `divina.geo.${city.toLowerCase()}`;
    let hit = (() => {
      try {
        return JSON.parse(prefStorage.get(memoKey) ?? 'null') as { lat: number; lon: number; name: string } | null;
      } catch {
        return null;
      }
    })();
    if (!hit) {
      const hits = await getJson<NominatimHit[]>(nominatimSearchUrl(city), 5000);
      hit = hits[0] ? placeFrom(hits[0]) : null;
      if (hit) prefStorage.set(memoKey, JSON.stringify(hit));
    }
    if (!hit) return { status: 'unconfigured', message: `Couldn’t find a place called “${city}”. Check the spelling in Settings → Weather.` };
    ({ lat, lon, name: place } = hit);
  } else if (!q.has('lat')) {
    lat = lon = NaN;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    // the extension doesn't ask for location access (it would add a warning when you install it)
    return { status: 'unconfigured', message: EXTENSION ? 'Type your city in Settings → Weather.' : `Allow location access${IOS ? '' : ' in the browser'}, or type your city in Settings → Weather.` };
  }
  const data = await cached(`wx:${lat.toFixed(2)},${lon.toFixed(2)}`, 10 * 60_000, async () =>
    metToWeather(await getJson<MetResponse>(metForecastUrl(lat, lon)), place, city ? 'MET Norway · place © OpenStreetMap contributors' : 'MET Norway'),
  );
  return { status: 'ok', data };
}

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
  created_at_i: number;
}

async function news(q: URLSearchParams) {
  const topic = (q.get('topic') ?? setting('DIVINA_NEWS_TOPIC') ?? 'AI').slice(0, 60);
  const withDigest = ai.configured();
  const data = await cached(`news:${topic}:${withDigest}`, 10 * 60_000, async () => {
    const since = Math.floor(Date.now() / 1000) - 3 * 86400;
    const r = await getJson<{ hits: HNHit[] }>(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&numericFilters=created_at_i>${since},points>15&hitsPerPage=24`,
    );
    const articles: NewsArticle[] = r.hits
      .filter((h) => h.title)
      .sort((a, b) => b.points - a.points)
      .slice(0, 12)
      .map((h) => {
        const url = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
        let site = 'news.ycombinator.com';
        try {
          site = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          /* keep the default */
        }
        return {
          id: h.objectID,
          title: h.title,
          url,
          site,
          points: h.points,
          comments: h.num_comments,
          at: h.created_at_i * 1000,
        };
      });
    let digest: string | undefined;
    if (withDigest && articles.length && allow('summary', 6)) {
      try {
        digest = await ai.text(
          `Summarise today's ${topic} news in three short spoken sentences, most important first. Headlines:\n` +
            articles.map((a, i) => `${i + 1}. ${a.title} (${a.site}, ${a.points} points)`).join('\n'),
        );
      } catch {
        digest = undefined;
      }
    }
    const out: NewsData = {
      topic,
      articles,
      digest,
      source: `Hacker News (Algolia)${digest ? ` · summary: ${AI_NAMES[ai.provider() ?? 'gemini']}` : ''}`,
      fetchedAt: Date.now(),
    };
    return out;
  });
  return { status: 'ok', data };
}

function calendar() {
  const text = read(CALENDAR_KEY);
  if (!text) {
    return {
      status: 'unconfigured',
      message: 'Add your calendar: ⚙ Settings → Calendar → choose your .ics file (Google Calendar: Settings → Import & export → Export). It stays in this browser.',
    };
  }
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 8 * 86400000);
  const name = /X-WR-CALNAME:(.*)/.exec(text)?.[1]?.trim() ?? 'Calendar';
  const events = parseIcs(text, from, to).slice(0, 40);
  const data: CalendarData = {
    calendarName: name,
    events: events.map((e) => ({
      id: e.uid,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      allDay: e.allDay,
      location: e.location,
    })),
    source: `your .ics file (${HERE})`,
    fetchedAt: Date.now(),
  };
  return { status: 'ok', data };
}

async function crypto() {
  const key = setting('DIVINA_COINGECKO_KEY');
  if (!key) return { status: 'unconfigured', message: CRYPTO_UNCONFIGURED };
  const ids = coinIds(setting('DIVINA_CRYPTO'));
  const currency = setting('DIVINA_CRYPTO_CURRENCY') ?? DEFAULT_CURRENCY;
  const data = await cached(`crypto:${ids.join(',')}:${currency}`, 5 * 60_000, async () => toCryptoData(await getJson(marketsUrl(ids, currency, key)), ids, currency));
  if (!data.coins.length) return { status: 'unconfigured', message: `CoinGecko didn’t recognise ${ids.join(', ')}. Use CoinGecko’s coin names, like bitcoin, ethereum, solana.` };
  const missing = unknownCoins(ids, data);
  return { status: 'ok', data: missing.length ? { ...data, source: `${data.source} · not found: ${missing.join(', ')}` } : data };
}

// CPU pressure where the browser reports it (Chrome/Edge), else unknown.
let pressure = 0;
const loadHistory: number[] = [];
function watchPressure() {
  try {
    const PO = (
      globalThis as {
        PressureObserver?: new (cb: (r: { state: string }[]) => void) => {
          observe(s: string, o?: object): Promise<void>;
        };
      }
    ).PressureObserver;
    if (PO) {
      const level: Record<string, number> = {
        nominal: 0.15,
        fair: 0.45,
        serious: 0.75,
        critical: 0.95,
      };
      void new PO((records) => (pressure = level[records[records.length - 1]?.state] ?? pressure)).observe('cpu', { sampleInterval: 2000 }).catch(() => {});
    }
  } catch {
    /* not available */
  }
}

function system() {
  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      brands?: { brand: string; version: string }[];
    };
    deviceMemory?: number;
  };
  const mem = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  const brand = nav.userAgentData?.brands?.find((b) => !/not.?a.?brand|chromium/i.test(b.brand)) ?? nav.userAgentData?.brands?.[0];
  loadHistory.push(pressure);
  if (loadHistory.length > 60) loadHistory.shift();
  const data: SystemData = {
    host: HERE,
    platform: `${nav.userAgentData?.platform || navigator.platform || 'unknown'}${brand ? ` · ${brand.brand} ${brand.version}` : ''}`,
    cpuModel: 'CPU threads',
    cores: navigator.hardwareConcurrency || 1,
    cpuLoad: pressure,
    loadHistory: [...loadHistory],
    // what this tab uses, against what the browser allows it
    memUsed: mem?.usedJSHeapSize ?? 0,
    memTotal: mem?.jsHeapSizeLimit ?? (nav.deviceMemory ?? 4) * 2 ** 30,
    uptimeS: performance.now() / 1000,
    node: 'browser edition',
    bridge: { enabled: false, platformSupported: false },
    source: IOS ? 'this iPhone' : 'this browser tab',
    fetchedAt: Date.now(),
  };
  return { status: 'ok', data };
}

const FULL_APP: Record<string, string> = {
  stocks: inFullApp('Live stocks and your own portfolio come'),
  sports: inFullApp('Live scores from your leagues come'),
  instagram: inFullApp('Your Instagram followers, reach and best posts come'),
  projects: inFullApp('Your projects and their GitHub activity come'),
  email: inFullApp('Your inbox comes'),
  music: IOS
    ? 'Say “play Drake on Spotify” (or Apple Music, YouTube Music, SoundCloud…) and I’ll open it for you. The Divina ambient engine plays below.'
    : `${inFullApp('Seeing and controlling what’s playing on your computer comes')} You can still say “play Drake on Spotify” (or Apple Music, YouTube Music, SoundCloud…) and I’ll open a search for it. The Divina ambient engine works here, below.`,
};

async function moduleData(id: string, q: URLSearchParams) {
  try {
    switch (id) {
      case 'weather':
        return json(await weather(q));
      case 'news':
        return json(await news(q));
      case 'calendar':
        return json(calendar());
      case 'system':
        return json(system());
      case 'crypto':
        return json(await crypto());
      case 'notes':
        return json({ status: 'ok', data: { notes, source: `${HERE} (encrypted)`, fetchedAt: Date.now() } });
      case 'agents':
        return json({ status: 'ok', data: { agents, source: `${HERE} (encrypted)`, fetchedAt: Date.now() } });
      case 'ai':
        return json({
          status: 'ok',
          data: {
            online: ai.configured(),
            model: ai.label() ?? 'none',
            ttsModel: ai.voiceModel() ?? 'browser voice',
            turns: 0,
            source: ai.configured() ? `your own API key, from ${HERE}` : 'local command engine (add an AI key in Settings)',
            fetchedAt: Date.now(),
          },
        });
      default:
        if (FULL_APP[id]) return json({ status: 'unconfigured', message: FULL_APP[id] });
        return json({ status: 'error', message: 'unknown module' }, 404);
    }
  } catch (err) {
    return json({
      status: 'error',
      message: `${id} source unavailable: ${message(err)}`,
    });
  }
}

// ── routes ─────────────────────────────────────────────────────────────────
const BRIDGE = { enabled: false, platform: 'browser', supported: false };

async function bodyOf(init: RequestInit): Promise<unknown> {
  try {
    return typeof init.body === 'string' ? JSON.parse(init.body) : null;
  } catch {
    return null;
  }
}

async function handle(url: URL, init: RequestInit): Promise<Response> {
  await ready;
  const method = (init.method ?? 'GET').toUpperCase();
  const path = url.pathname;

  if (path.startsWith('/api/modules/')) return moduleData(decodeURIComponent(path.slice('/api/modules/'.length)), url.searchParams);

  if (path === '/api/settings') {
    if (method === 'GET') return json({ ok: true, settings: publicSettings(), bridge: BRIDGE });
    const patch = await bodyOf(init);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json({ ok: false, message: 'Body must be an object of settings.' }, 400);
    const next = loadSettings();
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      if ((SETTING_KEYS as readonly string[]).includes(k) && !WEB_KEYS.has(k as SettingKey)) return json({ ok: false, message: FULL_APP_NOTE }, 422);
      const problem = checkSetting(k, v);
      if (problem) return json({ ok: false, message: problem }, 422);
      const t = (v as string).trim();
      if (t) next[k as SettingKey] = t;
      else delete next[k as SettingKey];
      if (SECRET.has(k as SettingKey)) {
        if (t) secrets[k as SettingKey] = t;
        else delete secrets[k as SettingKey];
      }
    }
    if (!(await saveAll(next)))
      return json(
        {
          ok: false,
          message: 'This browser won’t let Divina save settings (private window?).',
        },
        422,
      );
    memo.clear();
    return json({ ok: true, settings: publicSettings(), bridge: BRIDGE });
  }

  if (path === '/api/backup' && method === 'POST') {
    const b = (await bodyOf(init)) as { op?: string; passphrase?: unknown; includeKeys?: unknown; prefs?: unknown; file?: unknown } | null;
    const passphrase = typeof b?.passphrase === 'string' ? b.passphrase : '';
    const pick = (o: unknown) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k]) => (BACKUP_PREFS as readonly string[]).includes(k)));
    try {
      if (b?.op === 'export') {
        const includeKeys = b.includeKeys === true;
        const all = loadSettings();
        const settings = Object.fromEntries(Object.entries(all).filter(([k]) => includeKeys || !SECRET.has(k as SettingKey))) as Record<string, string>;
        const payload: BackupPayload = { format: 'divina-backup', v: 1, created: new Date().toISOString(), edition: 'browser', settings, hasKeys: includeKeys, notes, agents, memory: personal.memory ?? [], routines: personal.routines ?? [], worlds: personal.worlds ?? [], prefs: pick(b.prefs) };
        return json({ ok: true, file: await sealBackup(payload, passphrase) });
      }
      if (b?.op === 'import') {
        if (typeof b.file !== 'string' || b.file.length > 5_000_000) return json({ ok: false, message: 'That file is too big to be a Divina backup.' }, 422);
        const p = await openBackup(b.file, passphrase);
        const next = loadSettings();
        let skipped = 0;
        for (const [k, v] of Object.entries(p.settings ?? {})) {
          // only what this edition keeps, only valid values, keys only if the backup has them
          if (!WEB_KEYS.has(k as SettingKey) || typeof v !== 'string' || checkSetting(k, v) || !restorable(k, p, SECRET)) {
            if ((SETTING_KEYS as readonly string[]).includes(k)) skipped++;
            continue;
          }
          next[k as SettingKey] = v.trim();
          if (SECRET.has(k as SettingKey)) secrets[k as SettingKey] = v.trim();
        }
        await saveAll(next);
        notes = readNotes(p.notes);
        agents = readAgents(p.agents);
        await savePersonal(NOTES_KEY, 'notes', notes);
        await savePersonal(AGENTS_KEY, 'agents', agents);
        for (const k of Object.keys(PERSONAL_KINDS) as PersonalKind[]) {
          personal[k] = (PERSONAL_KINDS[k].parse as (raw: unknown) => unknown[])(p[k]);
          await savePersonal(personalKey(k), k, personal[k]);
        }
        memo.clear();
        return json({ ok: true, prefs: pick(p.prefs), message: `Restored your backup from ${new Date(p.created).toLocaleDateString()}${p.hasKeys ? ', including your keys' : ''}.${skipped ? ` ${skipped} setting${skipped === 1 ? '' : 's'} that only work in Divina for Windows ${skipped === 1 ? 'was' : 'were'} skipped.` : ''}` });
      }
      return json({ ok: false, message: 'Unknown action.' }, 400);
    } catch (err) {
      return json({ ok: false, message: err instanceof Error ? err.message : 'That didn’t work.' }, 422);
    }
  }

  if (path.startsWith('/api/personal/')) {
    const kind = path.slice('/api/personal/'.length);
    if (!isPersonalKind(kind)) return json({ ok: false, message: 'not found' }, 404);
    if (method === 'GET') return json({ ok: true, items: personal[kind] ?? [] });
    const r = PERSONAL_KINDS[kind].op((personal[kind] ?? []) as never, await bodyOf(init));
    if (!r.ok) return json(r, 422);
    personal[kind] = r.value;
    await savePersonal(personalKey(kind), kind, r.value);
    return json({ ok: true, items: r.value, message: r.message });
  }

  if (path === '/api/notes' || path === '/api/agents') {
    const isNotes = path === '/api/notes';
    if (method === 'GET') return json(isNotes ? { ok: true, notes } : { ok: true, agents });
    const op = await bodyOf(init);
    const r = isNotes ? notesOp(notes, op) : agentsOp(agents, op);
    if (!r.ok) return json(r, 422);
    if (isNotes) {
      notes = r.value as Note[];
      await savePersonal(NOTES_KEY, 'notes', notes);
      return json({ ok: true, notes, message: r.message });
    }
    agents = r.value as Agent[];
    await savePersonal(AGENTS_KEY, 'agents', agents);
    return json({ ok: true, agents, message: r.message });
  }

  if (path === '/api/ai') {
    if (method === 'GET')
      return json({
        online: ai.configured(),
        model: ai.label(),
        provider: ai.provider(),
        studioVoice: ai.speechConfigured() && setting('DIVINA_VOICE_MODE') !== 'fast',
      });
    if (!ai.configured()) return json({ error: 'offline', message: `${ADD_KEY} to talk to Divina.` }, 503);
    if (!allow('ai', 20)) return json({ error: 'limit', message: 'That’s a lot of requests in one minute — give me a moment.' }, 429);
    const body = parseChatBody(await bodyOf(init));
    if (!body) return json({ error: 'bad request', message: 'Expected {history, context}.' }, 400);
    const signal = init.signal ?? new AbortController().signal;
    const agent = body.agent ? agents.find((a) => a.id === body.agent) : undefined;
    if (agent) body.persona = { name: agent.name, instructions: agent.instructions };
    const brain = agent ? makeAI(agentSettings(setting as (k: SettingKey) => string | undefined, agent), { browser: true, fetcher: (...a) => realFetch(...a) }) : ai;
    return new Response(await brain.chat(body, 'browser', signal, redact), { headers: SSE_HEADERS });
  }

  if (path === '/api/tts') {
    if (!ai.speechConfigured()) return json({ error: 'offline' }, 503);
    if (!allow('tts', 90)) return json({ error: 'limit', message: 'Too many voice requests in one minute.' }, 429);
    const b = (await bodyOf(init)) as { text?: unknown; agent?: unknown } | null;
    const text = b?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 1200) return json({ error: 'bad text' }, 400);
    try {
      const agent = typeof b?.agent === 'string' ? agents.find((a) => a.id === b.agent) : undefined;
      const voiceOf = agent ? makeAI(agentSettings(setting as (k: SettingKey) => string | undefined, agent), { browser: true, fetcher: (...a) => realFetch(...a) }) : ai;
      const { pcm, sampleRate } = await voiceOf.speech(text);
      return new Response(pcm.slice().buffer as ArrayBuffer, { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(sampleRate) } });
    } catch (err) {
      return json({ error: redact(message(err)) }, 502);
    }
  }

  if (path === '/api/voices') {
    if (!ai.elevenConfigured()) return json({ ok: false, message: 'Add your ElevenLabs API key first.' }, 503);
    if (!allow('voices', 10)) return json({ ok: false, message: 'Too many requests in one minute.' }, 429);
    try {
      return json({ ok: true, voices: await ai.voices() });
    } catch (err) {
      return json({ ok: false, message: redact(message(err)) }, 502);
    }
  }

  if (path === '/api/desktop') {
    const msg = IOS ? 'Apple doesn’t let apps open or control other apps on iPhone, but I can open websites for you.' : `Opening apps and controlling your computer: ${FULL_APP_NOTE} This free version can open websites.`;
    if (method === 'GET')
      return json({
        ok: false,
        status: 501,
        enabled: false,
        platform: 'browser',
        message: msg,
      });
    return json({ ok: false, status: 501, message: msg }, 501);
  }

  if (path === '/api/quote') return json({ error: `Stock quotes: ${FULL_APP_NOTE}` }, 404);

  return json({ error: 'not found' }, 404);
}

// ── install ────────────────────────────────────────────────────────────────
let realFetch: typeof fetch = (...a) => fetch(...a);

/** Route the page's own /api/* calls here. Everything else goes out unchanged. */
export function installWebBackend() {
  const w = window as Window & { __divinaWebBackend?: boolean };
  if (w.__divinaWebBackend) return;
  w.__divinaWebBackend = true;
  const original = window.fetch.bind(window);
  realFetch = original;
  watchPressure();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const req = input instanceof Request ? input : null;
      return handle(url, { method: req?.method, signal: req?.signal, ...init });
    }
    return original(input, init);
  };
}

/** Save or remove the visitor's calendar file (settings panel). */
export function setCalendarFile(text: string | null): {
  ok: boolean;
  message?: string;
} {
  if (text !== null) {
    if (text.length > 2_000_000)
      return {
        ok: false,
        message: 'That calendar file is too big (over 2 MB).',
      };
    if (!/BEGIN:VCALENDAR/.test(text))
      return {
        ok: false,
        message: 'That doesn’t look like a calendar (.ics) file.',
      };
  }
  return write(CALENDAR_KEY, text)
    ? { ok: true }
    : {
        ok: false,
        message: 'This browser won’t let Divina save the file (private window?).',
      };
}
export const hasCalendarFile = () => !!read(CALENDAR_KEY);
