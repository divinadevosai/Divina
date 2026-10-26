/**
 * Local command engine. Pure: text in, commands out. Whatever it cannot
 * place goes to the model as an `ask`.
 */
import { MODULES } from '@/modules/meta';
import type { ModuleId } from '@/modules/ids';
import { WORLD_ALIASES, type WorldId } from '@/render/world/worlds';
import { matchTransform } from '@/embodiment/control';
import { leagueFromSpeech } from '@/modules/leagues';
import { serviceFrom, cleanQuery, type MusicService } from '@/lib/music';
import { languageFrom } from '@/lib/languages';

export type Command =
  | { kind: 'transform'; to: 'human' | 'spatial' }
  | { kind: 'open'; module: ModuleId }
  | { kind: 'rotate'; steps: number }
  | { kind: 'collapse' }
  | { kind: 'world'; world: WorldId }
  | { kind: 'motion'; on: boolean }
  | { kind: 'desktop'; verb: string; args: Record<string, unknown> }
  | { kind: 'personal'; target: 'profile' | 'reels' | 'latest' }
  | { kind: 'quote'; symbol: string; name: string }
  | { kind: 'schedule' }
  | { kind: 'news' }
  | { kind: 'weather' }
  | { kind: 'settings' }
  | { kind: 'league'; op: 'add' | 'remove' | 'only'; codes: string[]; names: string[] }
  | { kind: 'voiceMode'; fast: boolean }
  | { kind: 'thinking'; fast: boolean }
  | { kind: 'brief'; module: ModuleId }
  | { kind: 'unknownCard'; name: string }
  | { kind: 'help' }
  | { kind: 'tour' }
  | { kind: 'share'; module: ModuleId | null }
  | { kind: 'customWorld'; name: string }
  | { kind: 'roundtable'; names: string[] | 'all'; question: string }
  | { kind: 'mind'; close?: boolean }
  | { kind: 'translate'; op: 'start' | 'stop' | 'swap'; to?: string; from?: string; turns?: boolean }
  | { kind: 'screen'; question: string }
  | { kind: 'timer'; op: 'start' | 'cancel' | 'status'; minutes: number; label: string }
  | { kind: 'memory'; op: 'add' | 'list' | 'forget' | 'clear'; text: string }
  | { kind: 'note'; op: 'add' | 'done' | 'remove' | 'clear_done'; text: string }
  | { kind: 'agent'; name: string | null; then?: string; strict: boolean }
  | { kind: 'playSearch'; query: string; service: MusicService | null }
  | { kind: 'smalltalk'; topic: SmallTalk }
  | { kind: 'ask'; text: string };

/** The note as the person said it (original casing), from its lower-case match. */
function cleanNote(original: string, lower: string): string {
  const i = original.toLowerCase().lastIndexOf(lower);
  const out = (i >= 0 ? original.slice(i, i + lower.length) : lower).replace(/^(?:to |that )/i, '').trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export type SmallTalk = 'hello' | 'thanks' | 'howareyou' | 'who' | 'time' | 'date' | 'joke' | 'bye' | 'yes' | 'no';

/** Everyday things people say, answered on the spot, key or no key. */
const SMALL_TALK: [RegExp, SmallTalk][] = [
  [/^(hi|hello|hey|hiya|yo|good (morning|afternoon|evening)|morning|evening|hey there|hello there|hi there|sup|what'?s up|howdy)$/, 'hello'],
  [/^(thanks|thank you|cheers|ta|nice one|great|perfect|awesome|brilliant|lovely|good job|well done|nice)( (so much|very much|divina))?$/, 'thanks'],
  [/^(how are you|how are you doing|how'?s it going|you ok|are you ok(ay)?|how do you feel)( today)?$/, 'howareyou'],
  [/^(who are you|what are you|what'?s your name|who made you|who built you|what is divina|introduce yourself)$/, 'who'],
  [/^(what('?s| is) the time|what time is it|the time|time|what time)( now| right now)?$/, 'time'],
  [/^(what('?s| is) (the |today'?s )?(date|day)|what day is it|what'?s today|what is today|the date|date|what'?s the date today)( today)?$/, 'date'],
  [/^(tell me a joke|say something funny|make me laugh|a joke|joke)$/, 'joke'],
  [/^(bye|goodbye|good night|night|see you|see ya|that'?s all|that is all|go to sleep|sleep|stop listening)$/, 'bye'],
  [/^(yes|yeah|yep|sure|ok|okay|alright)$/, 'yes'],
  [/^(no|nope|nah|not now|no thanks)$/, 'no'],
];

/**
 * A card named anywhere in a sentence ("I'd love the weather forecast
 * thing"), for when nothing else understood it. Null if none is.
 */
export function mentionedModule(text: string): ModuleId | null {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
  for (let i = 0; i < words.length; i++) {
    const two = i + 1 < words.length ? moduleFrom(`${words[i]} ${words[i + 1]}`) : null;
    if (two) return two;
    if (/^(the|and|for|you|can|what|open|show|this|that|with|about|how|me|my|now|please|like|want|see)$/.test(words[i])) continue;
    const one = moduleFrom(words[i]);
    if (one) return one;
  }
  return null;
}

const COMPANIES: Record<string, string> = {
  nvidia: 'NVDA', apple: 'AAPL', microsoft: 'MSFT', google: 'GOOGL', alphabet: 'GOOGL', amazon: 'AMZN', meta: 'META', facebook: 'META',
  tesla: 'TSLA', netflix: 'NFLX', amd: 'AMD', intel: 'INTC', asml: 'ASML', tsmc: 'TSM', broadcom: 'AVGO', arm: 'ARM', palantir: 'PLTR',
  oracle: 'ORCL', salesforce: 'CRM', adobe: 'ADBE', spotify: 'SPOT', uber: 'UBER', coinbase: 'COIN', bitcoin: 'BTC-USD', ethereum: 'ETH-USD',
  'the s&p': '^GSPC', 's&p': '^GSPC', 'the nasdaq': '^IXIC', nasdaq: '^IXIC', 'the dow': '^DJI',
};

/** "ten", "a", "half an", "90" → minutes multiplier input. */
const WORDNUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  twenty: 20, 'twenty five': 25, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, sixty: 60, ninety: 90, half: 0.5, 'a half': 0.5,
};
function minutesFrom(n: string, unit: string): number {
  const k = n.replace(/-/g, ' ').replace(/^half an?$/, 'half');
  const v = Number(k) || WORDNUM[k] || 0;
  return /^h/.test(unit) ? v * 60 : /^s/.test(unit) ? v / 60 : v;
}

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, once: 1, twice: 2 };

/** Edit distance, for names speech recognition gets slightly wrong ("cripto", "whether"). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return d[b.length];
}

// what people call a card, including how speech recognition mishears it
const CARD_WORD = '(?:cards?|car|cart|carts|tabs?|tiles?|panels?|pages?|sections?|screens?|widgets?|windows?|modules?|apps?)';

/** The card being talked about, or null. Forgiving about plurals, spacing and near-misses. */
function moduleFrom(s: string): ModuleId | null {
  const t = s
    .toLowerCase()
    .replace(/^(up\s+)?(the|my|your)\s+/, '')
    .replace(new RegExp(`\\s*${CARD_WORD}$`), '')
    .replace(/^k(?=r[iy]pto)/, 'c')
    .trim();
  if (!t) return null;
  const squash = (x: string) => x.replace(/[\s-]+/g, '');
  const names = MODULES.flatMap((m) => [m.title.toLowerCase(), ...m.aliases].map((n) => ({ id: m.id, n })));
  for (const { id, n } of names) if (n === t || squash(n) === squash(t) || n + 's' === t) return id;
  // a close miss on a name long enough that it can't be confused with another word
  let best: { id: ModuleId; d: number } | null = null;
  for (const { id, n } of names) {
    if (n.length < 5) continue;
    const d = distance(squash(t), squash(n));
    const allowed = n.length >= 6 ? 2 : 1;
    if (d <= allowed && (!best || d < best.d)) best = { id, d };
  }
  return best?.id ?? null;
}

function worldFrom(s: string): WorldId | null {
  const t = s.toLowerCase().replace(/^(the)\s+/, '').replace(/\s+(environment|world|mode|room)$/, '').trim();
  for (const [id, aliases] of Object.entries(WORLD_ALIASES)) if (aliases.includes(t)) return id as WorldId;
  return null;
}

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|ai|app|co|uk|de|fr|me|tv|gg|so|xyz|edu|gov)(\/\S*)?$/i;

/** The words after "Divina," (and without trailing punctuation). */
export function stripWake(input: string): string {
  return input
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/^(?:(?:hey|hi|ok|okay)[,\s]+)?(?:d[aeiy]\s?v[iey]{1,2}n+(?:a|ah|er|e|o)?|the\s+vina|vina)\b[,\s]*/i, '')
    .trim();
}

export function parseCommand(input: string): Command[] {
  const raw = input.trim().replace(/[.!?]+$/, '');
  // the wake word, however speech recognition spells it: Divina, Davina, Devina, Deviner, Divine…, Vina
  let text = raw.replace(/^(?:(?:hey|hi|ok|okay)[,\s]+)?(?:d[aeiy]\s?v[iey]{1,2}n+(?:a|ah|er|e|o)?|the\s+vina|vina)\b[,\s]*/i, '').trim();
  // politeness is welcome but isn't the command: "can you please open…" → "open…"
  for (let i = 0; i < 4; i++) {
    const before = text;
    text = text
      .replace(/^(?:(?:can|could|would|will) you(?: please)?|please|just|now|go ahead and|kindly)[,\s]+/i, '')
      .replace(/^(?:i(?:'d| would) like to see|i want to see|let me see|let's see|i wanna see)\s+/i, 'show ')
      .replace(/^(?:i(?:'d| would) like you to|i want you to|i need you to)\s+/i, '')
      .replace(/[,\s]+(?:please|for me|now|right now|thanks|thank you|if you can|would you)$/i, '')
      .trim();
    if (text === before) break;
  }
  const t = text.toLowerCase();
  if (!t) return [];

  for (const [re, topic] of SMALL_TALK) if (re.test(t)) return [{ kind: 'smalltalk', topic }];
  // "what's on the crypto card", "tell me about my calendar", "read my email"
  const bm = /^(?:what'?s (?:on|in)|what is (?:on|in)|tell me about|read(?: me)?|summari[sz]e|brief me on|update me on|how'?s|how is|what about|check)\s+(.+)$/.exec(t);
  if (bm && moduleFrom(bm[1])) return [{ kind: 'brief', module: moduleFrom(bm[1])! }];

  if (/^(?:show me around|give me a tour|(?:start|replay|show me) the tour|tour|tutorial|how does this work|i'?m new here)$/.test(t)) return [{ kind: 'tour' }];
  if (/^(help|help me|what can (you|i) (do|say|ask)|what (commands|can i say|should i say)|how do (i|you) use (this|you|divina|it)|what are (the|your) commands)$/.test(t)) return [{ kind: 'help' }];

  const tf = matchTransform(t);
  if (tf) return [{ kind: 'transform', to: tf }];

  // settings, spoken
  if (/^(open |show )?(the )?settings$|^(open|show) (the )?(settings|preferences|options)( panel)?$/.test(t)) return [{ kind: 'settings' }];
  if (/\b(use|switch to) (the )?(fast|quick|browser|robot) voice\b/.test(t)) return [{ kind: 'voiceMode', fast: true }];
  if (/\b(use|switch to) (the )?(natural|nice|studio|google|normal) voice\b/.test(t)) return [{ kind: 'voiceMode', fast: false }];
  if (/\b(reply|answer|respond|be) (faster|quicker|quick)\b|\bspeed up\b/.test(t)) return [{ kind: 'thinking', fast: true }];
  if (/\b(think (harder|deeper|more)|deep (mode|thinking)|take your time)\b/.test(t)) return [{ kind: 'thinking', fast: false }];
  // memory: things about the person ("remember that my sister is called Amy")
  let mm = /^(?:remember|don'?t forget|keep in mind|please remember)\s+(?:that\s+)?((?:i|i'm|i am|i've|my|me|we|our|i'd)\b.+)$/.exec(t) ?? /^(?:remember|don'?t forget|keep in mind)\s+that\s+(.+)$/.exec(t);
  if (mm) return [{ kind: 'memory', op: 'add', text: cleanNote(text, mm[1]) }];
  // her mind: everything she knows and can do, as a constellation
  if (/^(?:open|show(?: me)?|let me see|take me (?:in)?to|go (?:in)?to)\s+(?:your|the|divina'?s)\s+(?:mind|brain|memory map|knowledge)$|^(?:what do you know about me|what do you know|what have you learned|what have you learnt|how much do you know)$/.test(t)) return [{ kind: 'mind' }];
  if (/^(?:close|leave|exit|shut)\s+(?:your|the)\s+(?:mind|brain)$/.test(t)) return [{ kind: 'mind', close: true }];
  if (/^(?:what do you remember about me|what have you remembered|what's in your memory|what do you remember|show (?:me )?your memory|show (?:me )?what you remember)$/.test(t)) return [{ kind: 'memory', op: 'list', text: '' }];
  if (/^(?:forget everything|forget everything (?:you know )?about me|clear your memory|wipe your memory|erase your memory)$/.test(t)) return [{ kind: 'memory', op: 'clear', text: '' }];
  mm = /^(?:forget|stop remembering)\s+(?:that\s+|about\s+)?(.+)$/.exec(t);
  if (mm && !/^(it|that|this)$/.test(mm[1])) return [{ kind: 'memory', op: 'forget', text: mm[1] }];

  // notes and to-dos (the Notes card)
  const LIST = '(?:my |the )?(?:list|notes?|to ?-?do(?: list)?|shopping list|reminders)';
  let nm = new RegExp(`^(?:add|put|stick)\\s+(.+?)\\s+(?:to|on|onto|in)\\s+${LIST}$`).exec(t);
  if (!nm) nm = /^(?:note|note down|note that|write down|jot down|remember to)\s+(.+)$/.exec(t);
  if (!nm) nm = /^(?:make|take|create|write|add) a note(?: (?:saying|that says|that|to|about))?[:,]?\s+(.+)$/.exec(t);
  if (nm) return [{ kind: 'note', op: 'add', text: cleanNote(text, nm[1]) }];
  nm = new RegExp(`^(?:tick off|cross off|check off|mark)\\s+(.+?)(?:\\s+(?:as )?(?:done|complete|completed|finished))?(?:\\s+(?:on|from|in)\\s+${LIST})?$`).exec(t);
  if (nm) return [{ kind: 'note', op: 'done', text: nm[1].replace(/^(the|my)\s+/, '') }];
  nm = new RegExp(`^(?:remove|delete|take|cross)\\s+(.+?)\\s+(?:from|off|out of)\\s+${LIST}$`).exec(t);
  if (nm) return [{ kind: 'note', op: 'remove', text: nm[1].replace(/^(the|my)\s+/, '') }];
  if (new RegExp(`^(?:clear|empty|tidy)(?: up)? (?:the )?(?:ticked|done|finished|completed)(?: items| things| notes)?(?: (?:on|from) ${LIST})?$`).test(t)) return [{ kind: 'note', op: 'clear_done', text: '' }];

  // share a card as an image
  const sh = /^(?:share|post|export|make an image of) (?:this|that|the|my) (.+?)(?: card)?$|^share (?:this|it|that)$/.exec(t);
  if (sh) return [{ kind: 'share', module: sh[1] && !/^(card|one)$/.test(sh[1]) ? moduleFrom(sh[1]) : null }];

  // live translator
  if (/^(?:stop|end|exit|turn off|cancel|quit|finish) (?:the )?(?:translat(?:ing|or|ion)|interpret(?:ing|er))(?: mode)?$/.test(t)) return [{ kind: 'translate', op: 'stop' }];
  if (/^(?:swap|switch|reverse|flip)(?: the)? (?:languages?|direction|over|round|sides)$|^(?:your|their|my) turn$/.test(t)) return [{ kind: 'translate', op: 'swap' }];
  let tm = /^(?:translate|interpret)(?: (?:between|from))? (\S+(?: \S+)?) (?:and|to|into) (\S+(?: \S+)?)$/.exec(t);
  if (tm && languageFrom(tm[1]) && languageFrom(tm[2])) return [{ kind: 'translate', op: 'start', from: languageFrom(tm[1])!.code, to: languageFrom(tm[2])!.code, turns: /between| and /.test(t) }];
  tm = /^(?:(?:start|turn on|open) )?(?:the )?(?:translat(?:e|or|ing)|interpret(?:er|ing)?)(?: mode)?(?: (?:what i say|for me|everything))?(?: (?:in)?to| in| for)? (.+)$/.exec(t);
  if (tm && languageFrom(tm[1])) return [{ kind: 'translate', op: 'start', to: languageFrom(tm[1])!.code, turns: false }];
  tm = /^(?:help me )?(?:talk|speak|chat) (?:to|with) (?:someone|somebody|a person|people|them|him|her)(?: who speaks| in) (.+)$/.exec(t) ?? /^i need (?:to talk to someone|an interpreter|a translator) (?:in|for|who speaks) (.+)$/.exec(t);
  if (tm && languageFrom(tm[1])) return [{ kind: 'translate', op: 'start', to: languageFrom(tm[1])!.code, turns: true }];

  // "what's on my screen?" / "summarise this page" / "what does this error mean?"
  if (/\b(?:my |the |this )?(?:screen|desktop|display)\b/.test(t) && /^(?:what'?s|what is|what do you see|look|read|summari[sz]e|explain|help|describe|check|can you see|tell me|translate)/.test(t))
    return [{ kind: 'screen', question: text }];
  if (/^(?:summari[sz]e|explain|translate|proofread|check) (?:this|the|what'?s on (?:the|this)) (?:page|article|email|document|error|message|website|chart|code)\b/.test(t) || /^what does this (?:error|message|page|chart|code) (?:mean|say)/.test(t))
    return [{ kind: 'screen', question: text }];

  // custom agents: back to Divina
  if (/^(?:(?:go |come |switch |get )?back to divina|talk to divina|speak to divina|switch to divina|stop (?:talking to )?(?:the |this |my )?agent|exit (?:the )?agent|bring (?:back )?divina(?: back)?|divina come back)$/.test(t)) return [{ kind: 'agent', name: null, strict: true }];

  let lm = /^(?:(only )?follow|add|track|watch|show me)\s+(.+?)(?:\s+(?:to|in|on) (?:my |the )?sports)?$/.exec(t);
  if (lm || (lm = /^(?:(just|only) )?(?:follow|show)?\s*(.+?)\s+only$/.exec(t))) {
    const parts = lm[2].split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean);
    const found = parts.map(leagueFromSpeech);
    if (found.length && found.every(Boolean)) {
      const ls = found as NonNullable<(typeof found)[number]>[];
      return [{ kind: 'league', op: lm[1] ? 'only' : 'add', codes: ls.map((l) => l.code), names: ls.map((l) => l.name) }];
    }
  }
  lm = /^(?:stop following|unfollow|remove|drop|hide)\s+(.+?)(?:\s+from (?:my |the )?sports)?$/.exec(t);
  if (lm) {
    const found = lm[1].split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean).map(leagueFromSpeech);
    if (found.length && found.every(Boolean)) {
      const ls = found as NonNullable<(typeof found)[number]>[];
      return [{ kind: 'league', op: 'remove', codes: ls.map((l) => l.code), names: ls.map((l) => l.name) }];
    }
  }

  // motion
  if (/\b(hold still|lock (the )?(room|motion)|stop (drifting|moving)|freeze the room)\b/.test(t)) return [{ kind: 'motion', on: false }];
  if (/\b(start drifting|let it (float|drift)|unlock (the )?(room|motion)|drift mode)\b/.test(t)) return [{ kind: 'motion', on: true }];

  // rotate
  let m = /\b(?:rotate|turn|spin|move)(?: the)?(?: ring| carousel| cards)?\s+(left|right)(?:\s+(?:by\s+)?(\d+|one|two|three|four|five|once|twice))?/.exec(t);
  if (m) {
    const n = m[2] ? (Number(m[2]) || NUM[m[2]] || 1) : 1;
    return [{ kind: 'rotate', steps: m[1] === 'left' ? n : -n }];
  }
  if (/^(next|next card|go right)$/.test(t)) return [{ kind: 'rotate', steps: 1 }];
  if (/^(previous|previous card|back one|go left)$/.test(t)) return [{ kind: 'rotate', steps: -1 }];

  // collapse
  if (/^(close|collapse|dismiss|back|go back|put it back|close (it|this|that)|never mind)$/.test(t)) return [{ kind: 'collapse' }];
  m = /^(?:close|collapse|dismiss|hide|put away|put back)\s+(.+)$/.exec(t);
  if (m && moduleFrom(m[1])) return [{ kind: 'collapse' }];

  // world
  m = /\b(?:switch to|go to|take me to|change (?:the )?(?:environment|world|room) to|environment|world)\s+(?:the\s+)?(.+)$/.exec(t);
  if (m) {
    const w = worldFrom(m[1]);
    if (w) return [{ kind: 'world', world: w }];
    // maybe one of the person's own worlds, or a preset ("take me to Mars")
    if (!/\.(com|org|net|io|co|uk)\b/.test(m[1])) return [{ kind: 'customWorld', name: m[1] }];
  }

  // agent round-table: "ask Coach and Chef together about my weekend", "what do my agents think about…"
  m = /^(?:ask|get) (.+?) (?:together|both|all) (?:to |about |what |how |if |whether |for |on )?(.+)$/.exec(t) ?? /^ask (.+? and .+?) (about|what|how|if|whether|for|to|which|should) (.+)$/.exec(t);
  if (m) {
    const names = m[1].replace(/^(?:my |the )/, '').split(/\s*(?:,|\band\b|&)\s*/).map((x) => x.replace(/^(?:my |the )/, '').trim()).filter(Boolean);
    const all = /^(?:all )?(?:my |the )?(?:agents|assistants|team)$|^everyone$|^them all$/.test(m[1]);
    const q = m.length === 4 ? `${m[2] === 'to' ? '' : `${m[2]} `}${m[3]}` : m[2];
    if (all || names.length >= 2) return [{ kind: 'roundtable', names: all ? 'all' : names, question: q.trim() }];
  }
  m = /^(?:what do|what would) (?:my |all my |the )?agents (?:think|say|suggest|recommend)(?: about| of| on)? (.+)$/.exec(t) ?? /^(?:round ?table|roundtable|team meeting|agent meeting)(?: about| on| for)? (.+)$/.exec(t);
  if (m) return [{ kind: 'roundtable', names: 'all', question: m[1] }];

  // custom agents: "talk to Coach", "ask Chef what to cook tonight"
  m = /^ask\s+(?:my |the )?(.+?)\s+(to|about|if|whether|what|how|why|for|when|where|which|who|should|can|could)\s+(.+)$/.exec(t);
  if (m && !moduleFrom(m[1])) return [{ kind: 'agent', name: m[1], then: m[2] === 'to' ? m[3] : `${m[2]} ${m[3]}`, strict: false }];
  m = /^(?:talk to|speak to|speak with|chat (?:with|to)|let me (?:talk|speak) to|i want to (?:talk|speak) to|switch to|open agent|use agent)\s+(?:my |the )?(.+?)(?:\s+(?:agent|bot|assistant))?$/.exec(t);
  if (m && !/^(me|you|someone|a human|a person)$/.test(m[1]) && !moduleFrom(m[1])) return [{ kind: 'agent', name: m[1], strict: !/^switch to/.test(t) }];

  // media / volume / system
  if (/^(play|resume|resume music|play music)$/.test(t)) return [{ kind: 'desktop', verb: 'media', args: { action: 'play' } }];
  if (/^(pause|pause music|stop music|stop the music)$/.test(t)) return [{ kind: 'desktop', verb: 'media', args: { action: 'pause' } }];
  if (/\b(next (track|song)|skip( (this|the) (song|track))?)\b/.test(t)) return [{ kind: 'desktop', verb: 'media', args: { action: 'next' } }];
  if (/\b(previous (track|song)|last (track|song)|go back a (track|song))\b/.test(t)) return [{ kind: 'desktop', verb: 'media', args: { action: 'previous' } }];
  m = /\b(?:set )?(?:the )?volume (?:to )?(\d{1,3})(?:%| percent)?\b/.exec(t);
  if (m) return [{ kind: 'desktop', verb: 'volume', args: { level: Number(m[1]) } }];
  if (/\b(volume up|louder|turn it up)\b/.test(t)) return [{ kind: 'desktop', verb: 'volume', args: { delta: 10 } }];
  if (/\b(volume down|quieter|turn it down)\b/.test(t)) return [{ kind: 'desktop', verb: 'volume', args: { delta: -10 } }];
  if (/^(mute|mute (the )?(sound|audio|volume))$/.test(t)) return [{ kind: 'desktop', verb: 'volume', args: { mute: true } }];
  if (/^unmute/.test(t)) return [{ kind: 'desktop', verb: 'volume', args: { mute: false } }];
  if (/\b(take a screenshot|screenshot|capture (the|my) screen)\b/.test(t)) return [{ kind: 'desktop', verb: 'screenshot', args: {} }];
  if (/\b(what'?s on|read) (my |the )?clipboard\b/.test(t)) return [{ kind: 'desktop', verb: 'clipboard_read', args: {} }];
  m = /^copy (.+?)( to (the|my) clipboard)?$/.exec(text);
  if (m) return [{ kind: 'desktop', verb: 'clipboard_write', args: { text: m[1] } }];
  if (/\bhide (all )?(the )?other(s| apps| windows)?\b/.test(t)) return [{ kind: 'desktop', verb: 'hide_others', args: {} }];
  if (/\block (the |my )?(screen|mac|computer)\b/.test(t)) return [{ kind: 'desktop', verb: 'lock_screen', args: {} }];
  if (/\b(sleep (the )?(display|screen)|turn off the (display|screen))\b/.test(t)) return [{ kind: 'desktop', verb: 'sleep_display', args: {} }];
  m = /\b(?:turn )?(on|off)? ?(?:do not disturb|focus mode)(?: (on|off))?\b/.exec(t);
  if (m && /do not disturb|focus mode/.test(t)) return [{ kind: 'desktop', verb: 'dnd', args: { on: (m[1] ?? m[2] ?? 'on') === 'on' } }];
  // timers and reminders (heads-ups, in Divina itself)
  const N = '(\\d+|an?|half an?|[a-z]+(?:[ -][a-z]+)?)';
  const U = '(minutes?|mins?|hours?|hrs?|seconds?|secs?)';
  m = new RegExp(`^remind me (?:in ${N} ${U} to (.+)|to (.+?) in ${N} ${U})$`, 'i').exec(text);
  if (m) {
    const mins = m[1] ? minutesFrom(m[1].toLowerCase(), m[2].toLowerCase()) : minutesFrom(m[5].toLowerCase(), m[6].toLowerCase());
    const label = (m[3] ?? m[4]).trim();
    if (mins > 0) return [{ kind: 'timer', op: 'start', minutes: mins, label: label.charAt(0).toUpperCase() + label.slice(1) }];
  }
  m = /^remind me to (.+)$/i.exec(text);
  if (m) return [{ kind: 'note', op: 'add', text: m[1].charAt(0).toUpperCase() + m[1].slice(1) }];
  m = new RegExp(`^(?:set |start )?(?:a |an )?(?:timer|alarm|countdown)(?: for)? ${N} ${U}(?: (?:for|called|to) (.+))?$`).exec(t) ?? new RegExp(`^(?:set |start )?(?:a |an )?${N}[ -]${U} (?:timer|countdown)(?: (?:for|called) (.+))?$`).exec(t);
  if (m) {
    const mins = minutesFrom(m[1], m[2]);
    if (mins > 0 && mins <= 24 * 60) return [{ kind: 'timer', op: 'start', minutes: mins, label: m[3] ? m[3].charAt(0).toUpperCase() + m[3].slice(1) : 'Timer' }];
  }
  if (/^(?:cancel|stop|clear|delete|turn off) (?:the |my |all |all my )?(?:timers?|alarms?|reminders?|countdowns?)$/.test(t)) return [{ kind: 'timer', op: 'cancel', minutes: 0, label: '' }];
  if (/^(?:how (?:long|much time)(?: is)?(?: left| remaining)(?: on (?:the |my )?(?:timer|alarm))?|time left|what'?s left on (?:the |my )?timer|check (?:the |my )?timer)$/.test(t)) return [{ kind: 'timer', op: 'status', minutes: 0, label: '' }];
  m = /^(?:quit|close) (?:the app )?(.+)$/.exec(t);
  if (m && !moduleFrom(m[1]) && !/^(it|this|that|the card|the panel)$/.test(m[1])) return [{ kind: 'desktop', verb: 'quit_app', args: { name: m[1] } }];

  // "play drake on spotify", "put on some jazz", "listen to the new taylor swift album on apple music"
  const PLAY = /^(?:play me|play|put on|listen to|i want to (?:hear|listen to)|let me hear|search(?: for)?)\s+/;
  m = new RegExp(`${PLAY.source}(.+?)(?:\\s+(?:on|in|with|using|from|through)\\s+([a-z ]+?))?$`).exec(t);
  if (m) {
    const service = m[2] ? serviceFrom(m[2]) : null;
    // "play songs on repeat": not a service, so every word is part of what to find
    const query = cleanQuery(service ? m[1] : t.replace(PLAY, ''));
    if (/^(some |the )?(music|something|anything|songs?|a song|tunes)$/.test(query) && !service) return [{ kind: 'desktop', verb: 'media', args: { action: 'play' } }];
    if (query && !/^(it|this|that|the next (song|track)|next|again)$/.test(query) && !(/^search/.test(t) && !service)) return [{ kind: 'playSearch', query, service }];
  }

  // youtube
  m = /\b(?:search youtube for|youtube search(?: for)?|search on youtube for|find on youtube)\s+(.+)$/.exec(t) ?? /^youtube\s+(.+)$/.exec(t);
  if (m) return [{ kind: 'desktop', verb: 'open_url', args: { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(m[1])}` } }];
  if (/^(search youtube|open youtube)$/.test(t)) return [{ kind: 'desktop', verb: 'open_url', args: { url: 'https://www.youtube.com' } }];

 // questions about coins and mail: open the card and say what's on it
  if (/\b(bitcoin|ethereum|solana|dogecoin|crypto|cryptocurrency|my coins)\b/.test(t) && /\b(how|what|price|doing|worth|value|today)\b/.test(t)) return [{ kind: 'brief', module: 'crypto' }];
  if (/\b(any|new|unread|check)\b.*\b(e-?mails?|mail|inbox|messages)\b|\bdo i have (any )?(new )?(e-?mails?|mail|messages)\b/.test(t)) return [{ kind: 'brief', module: 'email' }];

  // quotes
  m = /\b(?:how(?:'s| is| are)|what(?:'s| is))\s+(.+?)\s+(?:doing\s+)?(?:today|trading|at|stock|shares|price)\b/.exec(t) ?? /\b(?:price of|quote for)\s+(.+)$/.exec(t);
  if (m) {
    const name = m[1].replace(/^(the )/, '').replace(/('s| stock| shares)$/, '').trim();
    // "what's on today", "what's happening today": plans, not a ticker
    const plans = /^(?:on|up|new|happening|going on|planned|good)$/.test(name);
    const sym = plans ? null : (COMPANIES[name] ?? (/^[a-z]{1,5}$/.test(name) && !moduleFrom(name) ? name.toUpperCase() : null));
    if (sym) return [{ kind: 'quote', symbol: sym, name }];
  }

  // briefings
  if (/\b(my schedule|what do i have|what'?s on (my calendar|today)|my agenda|next meeting|my day)\b/.test(t)) return [{ kind: 'schedule' }];
  if (/\b(summari[sz]e|latest|today'?s|what'?s new in)\b.*\b(ai )?news\b|\bai news\b/.test(t)) return [{ kind: 'open', module: 'news' }, { kind: 'news' }];
  if (/\b(weather|temperature|is it (going to )?rain|forecast)\b/.test(t) && !/^(open|show)/.test(t)) return [{ kind: 'weather' }];

  // personal destinations, resolved later from the live feed
  if (/\b(my reels)\b/.test(t)) return [{ kind: 'personal', target: 'reels' }];
  if (/\b(my (instagram )?profile|my instagram page)\b/.test(t)) return [{ kind: 'personal', target: 'profile' }];
  if (/\b(my (latest|last|newest) post)\b/.test(t)) return [{ kind: 'personal', target: 'latest' }];

  // open / show X
  m = /^(?:show me|open up|open|show|launch|start|go to|pull up|display|bring up|present)\s+(.+)$/.exec(t);
  if (m) {
    const target = m[1].trim();
    const mod = moduleFrom(target);
    if (mod) return [{ kind: 'open', module: mod }];
    const w = worldFrom(target);
    if (w) return [{ kind: 'world', world: w }];
    const bare = target.replace(/^(the )?(website )?/, '').replace(/\s+/g, '');
    if (DOMAIN.test(bare) || /^https?:\/\//.test(target)) return [{ kind: 'desktop', verb: 'open_url', args: { url: bare } }];
    // "open the xyz card": a card Divina doesn't have, not an app on the computer
    const card = /^(?:the |my )?(.+?)\s*(?:cards?|car|cart|carts|tiles?|panels?|modules?)$/.exec(target);
    if (card) return [{ kind: 'unknownCard', name: card[1] }];
    const app = target.replace(/^(the|my)\s+/, '').replace(/\s+(app|application|program)$/, '').trim() || target;
    return [{ kind: 'desktop', verb: 'launch_app', args: { name: app } }];
  }
  const bareMod = moduleFrom(t);
  if (bareMod) return [{ kind: 'open', module: bareMod }];

  return [{ kind: 'ask', text }];
}
