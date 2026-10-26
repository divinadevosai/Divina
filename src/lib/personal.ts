/**
 * The person's own notes and agents: what they may contain and how they
 * change. Pure: shared by the app's server (stored encrypted in the data
 * folder) and the browser edition (stored encrypted in the browser).
 *
 * Everything that arrives here is checked, whatever the page sends.
 */
import { AI_PROVIDERS } from './settingsSchema';

export interface Note {
  id: string;
  text: string;
  done: boolean;
  at: number;
}

export type AgentProvider = '' | (typeof AI_PROVIDERS)[number];

export interface Agent {
  id: string;
  name: string;
  /** what the person wants this agent to be and do */
  instructions: string;
  /** '' = whatever AI Divina uses */
  provider: AgentProvider;
  /** '' = that AI's default model */
  model: string;
  /** '' = Divina's voice; else a voice name or id for the chosen voice service */
  voice: string;
  at: number;
}

export const MAX_NOTES = 200;
export const MAX_NOTE = 500;
export const MAX_AGENTS = 12;
export const MAX_INSTRUCTIONS = 2000;

const ID = /^[a-z0-9]{6,24}$/;
export const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => (b % 36).toString(36)).join('');

/** One line of plain text: no control characters, trimmed, capped. */
const clean = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
/** Several lines allowed (agent instructions). */
const cleanBlock = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max)
    : '';

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} '.-]{0,23}$/u;
const MODEL = /^[a-z0-9][a-z0-9.-]{0,80}$/;
const VOICE = /^[A-Za-z0-9]{2,40}$/;

export type Result<T> = { ok: true; value: T; message?: string } | { ok: false; message: string };

// ── notes ──────────────────────────────────────────────────────────────────
export function readNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n) => ({ id: isId(n.id) ? n.id : newId(), text: clean(n.text, MAX_NOTE), done: n.done === true, at: typeof n.at === 'number' ? n.at : Date.now() }))
    .filter((n) => n.text)
    .slice(0, MAX_NOTES);
}

/** The note a spoken phrase means ("milk" → "Buy milk"), or null. */
export function findNote(notes: Note[], phrase: string): Note | null {
  const p = phrase.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  if (!p) return null;
  return notes.find((n) => n.text.toLowerCase() === p) ?? notes.find((n) => n.text.toLowerCase().includes(p)) ?? null;
}

export function notesOp(notes: Note[], op: unknown): Result<Note[]> {
  if (!op || typeof op !== 'object') return { ok: false, message: 'Expected an action.' };
  const o = op as Record<string, unknown>;
  const byId = (id: unknown) => (isId(id) ? notes.find((n) => n.id === id) : undefined) ?? (typeof o.match === 'string' ? findNote(notes, o.match) : null);
  switch (o.op) {
    case 'add': {
      const text = clean(o.text, MAX_NOTE);
      if (!text) return { ok: false, message: 'The note is empty.' };
      if (notes.length >= MAX_NOTES) return { ok: false, message: `That’s the limit of ${MAX_NOTES} notes. Clear some ticked ones first.` };
      return { ok: true, value: [{ id: newId(), text, done: false, at: Date.now() }, ...notes], message: `Added “${text}”.` };
    }
    case 'edit': {
      const n = byId(o.id);
      const text = clean(o.text, MAX_NOTE);
      if (!n) return { ok: false, message: 'I couldn’t find that note.' };
      if (!text) return { ok: false, message: 'The note is empty.' };
      return { ok: true, value: notes.map((x) => (x.id === n.id ? { ...x, text } : x)) };
    }
    case 'done':
    case 'undone': {
      const n = byId(o.id);
      if (!n) return { ok: false, message: 'I couldn’t find that on your list.' };
      return { ok: true, value: notes.map((x) => (x.id === n.id ? { ...x, done: o.op === 'done' } : x)), message: o.op === 'done' ? `Ticked off “${n.text}”.` : `“${n.text}” is back on your list.` };
    }
    case 'remove': {
      const n = byId(o.id);
      if (!n) return { ok: false, message: 'I couldn’t find that note.' };
      return { ok: true, value: notes.filter((x) => x.id !== n.id), message: `Removed “${n.text}”.` };
    }
    case 'clear_done': {
      const left = notes.filter((x) => !x.done);
      return { ok: true, value: left, message: `Cleared ${notes.length - left.length} ticked item${notes.length - left.length === 1 ? '' : 's'}.` };
    }
    default:
      return { ok: false, message: 'Unknown action.' };
  }
}

// ── agents ─────────────────────────────────────────────────────────────────
function checkAgent(raw: Record<string, unknown>, existing?: Agent): Result<Agent> {
  const name = clean(raw.name, 24);
  if (!NAME.test(name)) return { ok: false, message: 'Give the agent a name of up to 24 letters, numbers or spaces.' };
  if (/^divina$/i.test(name)) return { ok: false, message: 'Divina is taken — pick another name.' };
  const instructions = cleanBlock(raw.instructions, MAX_INSTRUCTIONS);
  if (!instructions) return { ok: false, message: 'Tell the agent what it’s for, in a sentence or two.' };
  const provider = (raw.provider ?? '') as string;
  if (provider !== '' && !(AI_PROVIDERS as readonly string[]).includes(provider)) return { ok: false, message: 'Pick an AI from the list.' };
  const model = clean(raw.model, 81);
  if (model && !MODEL.test(model)) return { ok: false, message: 'A model name looks like claude-sonnet-5-5 or gpt-6-luna.' };
  const voice = clean(raw.voice, 40);
  if (voice && !VOICE.test(voice)) return { ok: false, message: 'Pick a voice from the list.' };
  return { ok: true, value: { id: existing?.id ?? newId(), name, instructions, provider: provider as AgentProvider, model, voice, at: existing?.at ?? Date.now() } };
}

export function readAgents(raw: unknown): Agent[] {
  if (!Array.isArray(raw)) return [];
  const out: Agent[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const r = checkAgent(a as Record<string, unknown>, { id: isId((a as Agent).id) ? (a as Agent).id : newId(), at: Number((a as Agent).at) || Date.now() } as Agent);
    if (r.ok) out.push(r.value);
  }
  return out.slice(0, MAX_AGENTS);
}

/** The agent a spoken name means ("coach" → "Coach"), or null. */
export function findAgent(agents: Agent[], spoken: string): Agent | null {
  const s = spoken.toLowerCase().replace(/^(my|the)\s+/, '').replace(/\s+(agent|bot|assistant)$/, '').trim();
  if (!s) return null;
  return agents.find((a) => a.name.toLowerCase() === s) ?? agents.find((a) => a.name.toLowerCase().startsWith(s) || s.startsWith(a.name.toLowerCase())) ?? null;
}

export function agentsOp(agents: Agent[], op: unknown): Result<Agent[]> {
  if (!op || typeof op !== 'object') return { ok: false, message: 'Expected an action.' };
  const o = op as Record<string, unknown>;
  switch (o.op) {
    case 'save': {
      const raw = o.agent && typeof o.agent === 'object' ? (o.agent as Record<string, unknown>) : null;
      if (!raw) return { ok: false, message: 'Expected an agent.' };
      const existing = isId(raw.id) ? agents.find((a) => a.id === raw.id) : undefined;
      if (!existing && agents.length >= MAX_AGENTS) return { ok: false, message: `That’s the limit of ${MAX_AGENTS} agents. Delete one first.` };
      const r = checkAgent(raw, existing);
      if (!r.ok) return r;
      if (agents.some((a) => a.id !== r.value.id && a.name.toLowerCase() === r.value.name.toLowerCase())) return { ok: false, message: `You already have an agent called ${r.value.name}.` };
      return { ok: true, value: existing ? agents.map((a) => (a.id === existing.id ? r.value : a)) : [...agents, r.value], message: existing ? `Saved ${r.value.name}.` : `Created ${r.value.name}.` };
    }
    case 'remove': {
      const a = isId(o.id) ? agents.find((x) => x.id === o.id) : undefined;
      if (!a) return { ok: false, message: 'I couldn’t find that agent.' };
      return { ok: true, value: agents.filter((x) => x.id !== a.id), message: `Deleted ${a.name}.` };
    }
    default:
      return { ok: false, message: 'Unknown action.' };
  }
}

/** Ready-made agents to start from. */
export const AGENT_TEMPLATES: Omit<Agent, 'id' | 'at'>[] = [
  { name: 'Coach', instructions: 'You are my fitness and health coach. Be encouraging but direct. Suggest short workouts, stretches and healthy habits. You are not a doctor: for pain, injury or medical questions, tell me to see a professional.', provider: '', model: '', voice: '' },
  { name: 'Chef', instructions: 'You are my kitchen helper. Suggest simple recipes from what I have, give steps one at a time when I ask, and convert measurements. Always mention common allergens.', provider: '', model: '', voice: '' },
  { name: 'Tutor', instructions: 'You are a patient tutor. Explain things simply, check my understanding with one short question, and never just give homework answers without explaining how.', provider: '', model: '', voice: '' },
  { name: 'Writer', instructions: 'You help me write: captions, emails and posts. Ask who it is for, keep my voice, and give two short options when I ask for ideas.', provider: '', model: '', voice: '' },
];

// ── memory ─────────────────────────────────────────────────────────────────
/** Something the person asked Divina to remember about them. */
export interface Memory {
  id: string;
  text: string;
  at: number;
}
export const MAX_MEMORIES = 100;
export const MAX_MEMORY = 300;

export function readMemories(raw: unknown): Memory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({ id: isId(m.id) ? m.id : newId(), text: clean(m.text, MAX_MEMORY), at: typeof m.at === 'number' ? m.at : Date.now() }))
    .filter((m) => m.text)
    .slice(0, MAX_MEMORIES);
}

export function memoryOp(items: Memory[], op: unknown): Result<Memory[]> {
  if (!op || typeof op !== 'object') return { ok: false, message: 'Expected an action.' };
  const o = op as Record<string, unknown>;
  switch (o.op) {
    case 'add': {
      const text = clean(o.text, MAX_MEMORY);
      if (!text) return { ok: false, message: 'There’s nothing to remember.' };
      if (items.some((m) => m.text.toLowerCase() === text.toLowerCase())) return { ok: true, value: items, message: 'I already know that.' };
      if (items.length >= MAX_MEMORIES) return { ok: false, message: `My memory is full (${MAX_MEMORIES} things). Ask me to forget something first.` };
      return { ok: true, value: [...items, { id: newId(), text, at: Date.now() }], message: 'Got it, I’ll remember that.' };
    }
    case 'remove': {
      const p = typeof o.match === 'string' ? o.match.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim() : '';
      const m = (isId(o.id) ? items.find((x) => x.id === o.id) : undefined) ?? (p ? items.find((x) => x.text.toLowerCase().includes(p)) : undefined);
      if (!m) return { ok: false, message: 'I don’t have anything like that in my memory.' };
      return { ok: true, value: items.filter((x) => x.id !== m.id), message: `Forgotten: “${m.text}”.` };
    }
    case 'clear':
      return { ok: true, value: [], message: 'I’ve forgotten everything you told me to remember.' };
    default:
      return { ok: false, message: 'Unknown action.' };
  }
}

// ── routines ───────────────────────────────────────────────────────────────
/**
 * One step of a routine. A closed list: a routine can only do things the
 * person could ask for by voice, and computer actions are limited to these.
 */
export type RoutineStep =
  | { type: 'brief'; module: string }
  | { type: 'open'; module: string }
  | { type: 'world'; world: string }
  | { type: 'say'; text: string }
  | { type: 'ask'; text: string }
  | { type: 'timer'; minutes: number; label: string }
  | { type: 'media'; action: 'play' | 'pause' | 'next' }
  | { type: 'volume'; level: number }
  /** ring your own phone and read text out, or (when empty) everything this routine said so far */
  | { type: 'call'; text: string };

export interface Routine {
  id: string;
  /** what you say to start it: "good morning" */
  name: string;
  steps: RoutineStep[];
  /** run by itself at this time while Divina is open ('' = never) */
  time: string;
  days: 'daily' | 'weekdays' | 'weekends';
  at: number;
}
export const MAX_ROUTINES = 20;
export const MAX_STEPS = 12;

const MODULE_LIKE = /^[a-z]{2,12}$/;
const WORLD_LIKE = /^[a-z0-9-]{2,30}$/;

function readStep(raw: unknown): RoutineStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  switch (s.type) {
    case 'brief':
    case 'open':
      return typeof s.module === 'string' && MODULE_LIKE.test(s.module) ? { type: s.type, module: s.module } : null;
    case 'world':
      return typeof s.world === 'string' && WORLD_LIKE.test(s.world) ? { type: 'world', world: s.world } : null;
    case 'say':
    case 'ask': {
      const text = clean(s.text, 300);
      return text ? { type: s.type, text } : null;
    }
    case 'timer': {
      const minutes = Math.round(Number(s.minutes));
      return minutes >= 1 && minutes <= 600 ? { type: 'timer', minutes, label: clean(s.label, 60) || 'Timer' } : null;
    }
    case 'media':
      return s.action === 'play' || s.action === 'pause' || s.action === 'next' ? { type: 'media', action: s.action } : null;
    case 'volume': {
      const level = Math.round(Number(s.level));
      return level >= 0 && level <= 100 ? { type: 'volume', level } : null;
    }
    case 'call':
      return { type: 'call', text: clean(s.text, 300) };
    default:
      return null;
  }
}

function checkRoutine(raw: Record<string, unknown>, existing?: Routine): Result<Routine> {
  const name = clean(raw.name, 40).toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]{1,39}$/u.test(name)) return { ok: false, message: 'Give the routine a short name to say, like “good morning”.' };
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map(readStep).filter((s): s is RoutineStep => !!s).slice(0, MAX_STEPS);
  if (!steps.length) return { ok: false, message: 'Add at least one step.' };
  const time = typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : '';
  const days = raw.days === 'weekdays' || raw.days === 'weekends' ? raw.days : 'daily';
  return { ok: true, value: { id: existing?.id ?? newId(), name, steps, time, days, at: existing?.at ?? Date.now() } };
}

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'goodmorning',
    name: 'good morning',
    steps: [
      { type: 'say', text: 'Good morning. Here’s your day.' },
      { type: 'brief', module: 'weather' },
      { type: 'brief', module: 'calendar' },
      { type: 'brief', module: 'notes' },
      { type: 'brief', module: 'news' },
    ],
    time: '',
    days: 'daily',
    at: 0,
  },
  {
    id: 'goodnight',
    name: 'good night',
    steps: [
      { type: 'media', action: 'pause' },
      { type: 'brief', module: 'calendar' },
      { type: 'world', world: 'fog' },
      { type: 'say', text: 'Sleep well.' },
    ],
    time: '',
    days: 'daily',
    at: 0,
  },
];

export function readRoutines(raw: unknown): Routine[] {
  if (raw === undefined) return DEFAULT_ROUTINES; // nothing saved yet: start with the built-in ones
  if (!Array.isArray(raw)) return [];
  const out: Routine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    const c = checkRoutine(x, { id: isId(x.id) || x.id === 'goodmorning' || x.id === 'goodnight' ? (x.id as string) : newId(), at: Number(x.at) || 0 } as Routine);
    if (c.ok) out.push(c.value);
  }
  return out.slice(0, MAX_ROUTINES);
}

export function routinesOp(items: Routine[], op: unknown): Result<Routine[]> {
  if (!op || typeof op !== 'object') return { ok: false, message: 'Expected an action.' };
  const o = op as Record<string, unknown>;
  const idOk = (v: unknown) => isId(v) || v === 'goodmorning' || v === 'goodnight';
  switch (o.op) {
    case 'save': {
      const raw = o.routine && typeof o.routine === 'object' ? (o.routine as Record<string, unknown>) : null;
      if (!raw) return { ok: false, message: 'Expected a routine.' };
      const existing = idOk(raw.id) ? items.find((r) => r.id === raw.id) : undefined;
      if (!existing && items.length >= MAX_ROUTINES) return { ok: false, message: `That’s the limit of ${MAX_ROUTINES} routines.` };
      const r = checkRoutine(raw, existing);
      if (!r.ok) return r;
      if (items.some((x) => x.id !== r.value.id && x.name === r.value.name)) return { ok: false, message: `You already have a routine called “${r.value.name}”.` };
      return { ok: true, value: existing ? items.map((x) => (x.id === existing.id ? r.value : x)) : [...items, r.value], message: `Saved “${r.value.name}”.` };
    }
    case 'remove': {
      const r = idOk(o.id) ? items.find((x) => x.id === o.id) : undefined;
      if (!r) return { ok: false, message: 'I couldn’t find that routine.' };
      return { ok: true, value: items.filter((x) => x.id !== r.id), message: `Deleted “${r.name}”.` };
    }
    default:
      return { ok: false, message: 'Unknown action.' };
  }
}

/** The routine a phrase starts: its name said on its own, or "run …" / "start …". */
export function routineFor(items: Routine[], phrase: string): Routine | null {
  const t = phrase
    .toLowerCase()
    .replace(/[.!?,]+$/g, '')
    .replace(/^(?:run|start|do|play|begin)\s+(?:my |the )?/, '')
    .replace(/\s+routine$/, '')
    .trim();
  return items.find((r) => r.name === t) ?? null;
}
