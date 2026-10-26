/**
 * Divina's mind: everything she knows and can do, sorted into branches for
 * the constellation view ("Divina, open your mind"). Built on the device
 * from what's already stored there (memory, notes, agents, routines,
 * worlds) plus her built-in skills. Nothing here is sent anywhere.
 *
 * Sorting is by plain word matching, so it works without an AI key.
 */
import type { Agent, Memory, Note, Routine } from './personal';
import type { CustomWorld } from './worlds';

export type BranchId = 'you' | 'people' | 'health' | 'work' | 'places' | 'plans' | 'routines' | 'agents' | 'worlds' | 'skills';

export interface MindNode {
  id: string;
  branch: BranchId;
  /** short text on the constellation */
  label: string;
  /** the full item, for the detail card */
  detail: string;
  /** what it is, so the detail card can offer the right actions */
  kind: 'memory' | 'note' | 'agent' | 'routine' | 'world' | 'skill' | 'place';
  /** the stored item's id (memory, note, agent, routine, world) */
  ref?: string;
  /** when it was learned (ms), 0 for built-in */
  at: number;
  /** a skill's example phrase */
  example?: string;
}

export interface Branch {
  id: BranchId;
  label: string;
  /** degrees, for the node colours */
  hue: number;
  nodes: MindNode[];
}

export interface Mind {
  branches: Branch[];
  /** pairs of node ids that share something (a name, a place, a word) */
  links: [string, string][];
  total: number;
}

export const BRANCHES: { id: BranchId; label: string; hue: number }[] = [
  { id: 'you', label: 'About you', hue: 205 },
  { id: 'people', label: 'People', hue: 330 },
  { id: 'health', label: 'Food & health', hue: 150 },
  { id: 'work', label: 'Work & study', hue: 45 },
  { id: 'places', label: 'Places', hue: 185 },
  { id: 'plans', label: 'Plans & to-dos', hue: 28 },
  { id: 'routines', label: 'Routines', hue: 265 },
  { id: 'agents', label: 'Agents', hue: 295 },
  { id: 'worlds', label: 'Worlds', hue: 55 },
  { id: 'skills', label: 'Skills', hue: 220 },
];

const PEOPLE = /\b(sister|brother|mum|mom|mother|dad|father|parents?|wife|husband|partner|girlfriend|boyfriend|fianc[ée]e?|son|daughter|kids?|children|baby|friend|best mate|mate|boss|manager|colleague|cousin|aunt|uncle|nan|nana|gran|grandma|grandad|grandpa|grandmother|grandfather|niece|nephew|neighbou?r|flatmate|roommate|called|named)\b/i;
const HEALTH = /\b(vegetarian|vegan|pescatarian|allerg(?:y|ic)|gluten|lactose|dairy|nut|diet|food|eat|eats|eating|cook|cooking|recipe|drink|coffee|tea|gym|run|running|workout|fitness|yoga|sleep|steps|weight|health|doctor|medicine|meds|calories|protein|swim|cycling|football training)\b/i;
const WORK = /\b(work|job|office|boss|manager|client|meeting|project|deadline|career|company|business|startup|shift|study|studying|exam|exams|uni|university|college|school|course|class|degree|homework|assignment)\b/i;
const PLACE = /\b(live in|living in|from|born in|move to|moving to|grew up in|holiday in|trip to|visit|visiting|flight to|flights to|travel to|city|town|country)\b/i;

/** Which branch a remembered fact belongs to. */
export function branchFor(text: string): BranchId {
  if (PEOPLE.test(text)) return 'people';
  if (HEALTH.test(text)) return 'health';
  if (WORK.test(text)) return 'work';
  if (PLACE.test(text)) return 'places';
  return 'you';
}

/** What Divina can do, with something to say to try it. */
export const SKILLS: { label: string; detail: string; example: string; ios?: false }[] = [
  { label: 'Weather', detail: 'Forecasts for where you are or the city you set.', example: 'what’s the weather?' },
  { label: 'Notes & lists', detail: 'To-dos and lists, by voice.', example: 'add milk to my list' },
  { label: 'Timers', detail: 'Timers and heads-ups before meetings and rain.', example: 'set a timer for 10 minutes' },
  { label: 'Memory', detail: 'Remembers what you tell her and uses it in answers.', example: 'remember that my sister is called Amy' },
  { label: 'Routines', detail: 'Several steps from one phrase.', example: 'good morning' },
  { label: 'Agents', detail: 'Assistants you make, each with its own personality.', example: 'talk to Coach' },
  { label: 'Round table', detail: 'Your agents answer one question in turn.', example: 'ask Coach and Chef together what to do tonight' },
  { label: 'Worlds', detail: 'Rooms with their own planet, colours and light.', example: 'take me to Saturn' },
  { label: 'Translator', detail: 'Live translation in 30 languages.', example: 'translate to Spanish' },
  { label: 'Music', detail: 'Opens a song or artist on your music service.', example: 'play Drake on Spotify' },
  { label: 'Calendar', detail: 'What’s coming up today and this week.', example: 'what’s on today?' },
  { label: 'Crypto', detail: 'Your coins at a glance.', example: 'how’s bitcoin?' },
  { label: 'Share a card', detail: 'Turns a card into a picture to post.', example: 'share this card' },
  { label: 'Screen help', detail: 'Answers questions about what’s on your screen, after you allow it.', example: 'what’s on my screen?', ios: false },
  { label: 'Hands', detail: 'Control the room with your hand and the camera.', example: 'tap Hands' },
];

const STOP = new Set('about after again also always another because before being called could every first from have just like make more most much named never only other over really should since some still than that their them then there these they thing this those through today tomorrow under until very want what when where which while with would your yours mine'.split(' '));
/** The words that can tie two things together: names, places, and longer words. */
function keywords(text: string): Set<string> {
  const out = new Set<string>();
  const found = text.match(/[\p{L}][\p{L}'-]+/gu) ?? [];
  found.forEach((w, i) => {
    const lower = w.toLowerCase().replace(/'s$/, '');
    // names count however short they are ("Amy"); other words need four letters
    const name = i > 0 && /^\p{Lu}/u.test(w) && lower.length >= 3;
    if ((!name && lower.length < 4) || STOP.has(lower)) return;
    out.add(lower);
  });
  return out;
}

const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function buildMind(input: { memory: Memory[]; notes: Note[]; agents: Agent[]; routines: Routine[]; worlds: CustomWorld[]; city?: string; ios?: boolean }): Mind {
  const nodes: MindNode[] = [];
  for (const m of input.memory) nodes.push({ id: `m:${m.id}`, branch: branchFor(m.text), label: short(m.text), detail: m.text, kind: 'memory', ref: m.id, at: m.at });
  for (const n of input.notes.filter((x) => !x.done)) nodes.push({ id: `n:${n.id}`, branch: 'plans', label: short(n.text), detail: n.text, kind: 'note', ref: n.id, at: n.at });
  for (const a of input.agents) nodes.push({ id: `a:${a.id}`, branch: 'agents', label: a.name, detail: a.instructions, kind: 'agent', ref: a.id, at: a.at });
  for (const r of input.routines) nodes.push({ id: `r:${r.id}`, branch: 'routines', label: `“${r.name}”`, detail: `${r.steps.length} step${r.steps.length === 1 ? '' : 's'}${r.time ? `, runs at ${r.time} (${r.days})` : ''}`, kind: 'routine', ref: r.id, at: r.at });
  for (const w of input.worlds) nodes.push({ id: `w:${w.id}`, branch: 'worlds', label: w.name, detail: `${w.planet.type === 'none' ? 'No planet' : `A ${w.planet.type === 'gas' ? 'gas giant' : w.planet.type} planet`}${w.planet.rings ? ' with rings' : ''}${w.planet.moons ? `, ${w.planet.moons} moon${w.planet.moons > 1 ? 's' : ''}` : ''}.`, kind: 'world', ref: w.id, at: w.at });
  if (input.city) nodes.push({ id: 'p:city', branch: 'places', label: input.city, detail: `Your weather city.`, kind: 'place', at: 0 });
  for (const s of SKILLS) if (!(input.ios && s.ios === false)) nodes.push({ id: `s:${s.label}`, branch: 'skills', label: s.label, detail: s.detail, kind: 'skill', at: 0, example: s.example });

  // links: things you told her that share a name, a place or a word (skills are hers, not yours)
  const links: [string, string][] = [];
  const personal = nodes.filter((n) => n.kind !== 'skill');
  const words = new Map(personal.map((n) => [n.id, keywords(`${n.label} ${n.detail}`)]));
  for (let i = 0; i < personal.length; i++) {
    for (let j = i + 1; j < personal.length; j++) {
      const a = words.get(personal[i].id)!;
      const b = words.get(personal[j].id)!;
      for (const w of a) {
        if (b.has(w)) {
          links.push([personal[i].id, personal[j].id]);
          break;
        }
      }
      if (links.length >= 120) break;
    }
  }
  const branches = BRANCHES.map((b) => ({ ...b, nodes: nodes.filter((n) => n.branch === b.id) })).filter((b) => b.nodes.length || b.id === 'you');
  return { branches, links, total: nodes.length };
}
