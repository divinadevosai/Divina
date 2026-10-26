/**
 * DIVINA: the assistant.
 *
 *   wake (phrase or circle) → listening → thinking → streaming → speaking
 *
 * Local commands act immediately. Everything else streams from the AI the person picked;
 * sentences are spoken as soon as they complete, before the answer ends.
 * Speaking over DIVINA interrupts it at once.
 */
import { setClientFacts } from '@/render/cards/faces';
import { refresh } from '@/modules/feeds';
import { bus } from '@/core/bus';
import { clock } from '@/core/clock/masterClock';
import { useAI, type Turn } from '@/stores/ai';
import { useRing, frontModule } from '@/stores/ring';
import { useWorld } from '@/stores/world';
import { useEmbody } from '@/stores/embody';
import { useData } from '@/stores/data';
import { log } from '@/stores/system';
import { useToasts } from '@/stores/toasts';
import { useConfirm } from '@/stores/confirm';
import { audio } from '@/audio/engine';
import { voice } from './tts';
import { listener } from './listen';
import { parseCommand, mentionedModule, stripWake, type Command, type SmallTalk } from './commands';
import { cancelTimers, installHeadsUps, spokenDuration, startTimer, timeLeft, useTimers } from './headsup';
import { routineFor, type Routine } from '@/lib/personal';
import { asWorld, findWorld } from '@/lib/worlds';
import { captureScreen, type Shot } from './screen';
import { useTranslator, translateLine, langName, langTag } from './translator';
import { LANG_BY_CODE } from '@/lib/languages';
import { AI_NAMES } from '@/lib/ai/providers';
import { MODULES, MODULE_BY_ID } from '@/modules/meta';
import { isModuleId, type ModuleId } from '@/modules/ids';
import { summarize } from '@/modules/summary';
import { desktop, webUrl } from '@/lib/client/desktop';
import { callMe } from '@/lib/client/phone';
import { IOS, WEB } from '@/lib/edition';
import { activeAgent, knownAgents, notesOp, loadPersonal, personalOp, usePersonal, useSpeaker } from '@/lib/client/personal';
import { findAgent } from '@/lib/personal';
import { usePrefs } from '@/stores/prefs';
import { SERVICE_NAMES, musicSearchUrl, serviceFrom, type MusicService } from '@/lib/music';
import { transformTo, setEmbodimentVoice } from '@/embodiment/control';
import { setRefusalVoice } from '@/interaction/controller';
import { rig } from '@/embodiment/rig';
import { WORLDS, WORLD_IDS, type WorldId } from '@/render/world/worlds';
import type { InstagramData } from '@/modules/types';
import { fmt } from '@/modules/format';
import { loadSettings, openSettings, saveSettings } from '@/lib/client/settings';
import { MAX_LEAGUES, parseLeagueList, LEAGUE_BY_CODE } from '@/modules/leagues';
import { openMind, closeMind } from '@/stores/mind';

let spokenRecently = '';
let stream: AbortController | null = null;
let sleepTimer: number | undefined;

function ai() {
  return useAI.getState();
}

// ── speaking ──────────────────────────────────────────────────────
export function say(text: string, show = true) {
  spokenRecently = `${spokenRecently} ${text}`.slice(-400);
  if (show) ai().setResponse(text);
  voice.say(text);
}

function record(user: string | null, model: string, calls?: Turn['calls']) {
  const a = ai();
  if (user) a.push({ role: 'user', text: user, at: Date.now() });
  a.push({ role: 'model', text: model, at: Date.now(), calls });
}

export function interrupt() {
  if (!voice.speaking && !stream) return;
  stream?.abort();
  stream = null;
  voice.stop();
  ai().setStatus('interrupted');
  log('info', 'interrupted');
  window.setTimeout(() => ai().status === 'interrupted' && ai().setStatus(ai().awake ? 'listening' : 'idle'), 900);
}

// ── wake ──────────────────────────────────────────────────────────
export function wake(source: string) {
  const a = ai();
  audio.unlock();
  if (voice.speaking) interrupt();
  clock.wake();
  audio.play('wake');
  a.setAwake(true);
  a.setStatus('listening');
  listener.openFloor();
  log('info', `wake · ${source}`);
  window.clearTimeout(sleepTimer);
  sleepTimer = window.setTimeout(() => {
    if (ai().status === 'listening') {
      ai().setAwake(false);
      ai().setStatus('idle');
    }
  }, 9000);
}

// ── context ───────────────────────────────────────────────────────
function context(): string {
  const ring = useRing.getState();
  const emb = useEmbody.getState();
  const data = useData.getState().modules;
  const current: ModuleId | null = clock.embodied ? (emb.presented[emb.presented.length - 1] ?? null) : (ring.expanded ?? null);
  const lines = [
    `Time: ${new Date().toString()}`,
    `Form: ${clock.embodied ? 'human figure (no ring; modules are presented beside you, rotating is impossible)' : 'spatial ring of cards'}`,
    `Environment: ${WORLDS[useWorld.getState().world].name}`,
    current ? `CURRENT MODULE (what "this" means): ${MODULE_BY_ID[current].title} — ${summarize(current, data[current]).sentence}` : `Card in front: ${MODULE_BY_ID[frontModule(ring.frontStep)].title}`,
    clock.embodied && emb.presented.length ? `Presented panels: ${emb.presented.map((m) => MODULE_BY_ID[m].title).join(', ')}` : '',
    'Modules:',
    ...MODULES.map((m) => `- ${m.title}: ${summarize(m.id, data[m.id]).sentence}`),
  ];
  const mem = usePersonal.getState().memory;
  if (mem.length) lines.push('THINGS THE USER ASKED YOU TO REMEMBER (use them when relevant):', ...mem.slice(-60).map((m) => `- ${m.text}`));
  return lines.filter(Boolean).join('\n');
}

// ── local commands ────────────────────────────────────────────────
async function runDesktop(verb: string, args: Record<string, unknown>) {
  const r = await desktop(verb, args);
  if (!r.ok && verb === 'play_search' && (r.status === 403 || r.status === 501)) {
    // browser edition (or no desktop bridge): open the service's search in a new tab
    const service = (String(args.service) in SERVICE_NAMES ? args.service : 'spotify') as MusicService;
    window.open(musicSearchUrl(service, String(args.query ?? '')), '_blank', 'noopener');
    return say(`Searching ${SERVICE_NAMES[service]} for ${String(args.query)} in a new tab. Pick a result to play.`);
  }
  if (!r.ok && verb === 'open_url' && (r.status === 403 || r.status === 501)) {
    const url = webUrl(String(args.url ?? ''));
    if (!url) return say('That isn’t a web address I can open.');
    window.open(url, '_blank', 'noopener');
    return say(WEB ? 'Opened it in a new tab.' : 'Opened it in a new tab here. The desktop bridge would put it in its own window on your other display.');
  }
  if (r.ok && verb === 'screenshot') {
    useToasts.getState().push({ kind: 'ok', text: 'Screen captured', image: (r.data as { dataUrl: string }).dataUrl });
  }
  if (r.ok && verb === 'clipboard_read') {
    const text = (r.data as { text: string }).text;
    useToasts.getState().push({ kind: 'info', text: 'Clipboard', detail: text.slice(0, 400) });
    return say(text ? `Your clipboard says: ${text.slice(0, 160)}` : 'The clipboard is empty.');
  }
  if (!r.ok) useToasts.getState().push({ kind: 'warn', text: r.message, detail: r.setting });
  audio.play(r.ok ? 'confirm' : 'error');
  say(r.message);
}

/**
 * Talk to a custom agent (or back to Divina). Each starts a fresh
 * conversation, so one agent's chat never leaks into another's.
 */
export function switchAgent(id: string | null) {
  interrupt();
  usePrefs.getState().set({ agent: id });
  useAI.setState({ history: [] });
  setClientFacts({ agent: activeAgent()?.name });
  void refresh('agents'); // redraw the card with who's talking now
  bus.emit({ type: 'open', module: 'agents', source: 'voice' });
}

/** Wait until Divina has finished speaking (or 40 seconds pass). */
async function untilQuiet() {
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 300));
  while ((voice.speaking || stream) && Date.now() - t0 < 40_000) await new Promise((r) => setTimeout(r, 250));
}

/** Run a routine's steps in order, each waiting for the last to finish speaking. */
export async function runRoutine(r: Routine) {
  log('info', `routine · ${r.name}`);
  const data = () => useData.getState().modules;
  const said: string[] = []; // what this routine has said, for a "phone me" step with no text
  for (const s of r.steps) {
    switch (s.type) {
      case 'say':
        say(s.text);
        said.push(s.text);
        break;
      case 'brief':
        if (isModuleId(s.module)) {
          bus.emit({ type: 'open', module: s.module, source: 'voice' });
          const line = summarize(s.module, data()[s.module]).sentence;
          say(line);
          said.push(line);
        }
        break;
      case 'open':
        if (isModuleId(s.module)) bus.emit({ type: 'open', module: s.module, source: 'voice' });
        break;
      case 'world': {
        if ((WORLD_IDS as string[]).includes(s.world)) bus.emit({ type: 'world', world: s.world as WorldId, source: 'voice' });
        else {
          const w = findWorld(usePersonal.getState().worlds, s.world);
          if (w) useWorld.getState().setCustom(asWorld(w));
        }
        break;
      }
      case 'ask':
        ai().push({ role: 'user', text: s.text, at: Date.now() });
        await ask(s.text);
        break;
      case 'timer':
        startTimer(s.minutes, s.label);
        say(`${s.label === 'Timer' ? 'Timer' : s.label} set for ${spokenDuration(s.minutes * 60_000)}.`);
        break;
      case 'media':
        if (!WEB) await desktop('media', { action: s.action });
        break;
      case 'volume':
        if (!WEB) await desktop('volume', { level: s.level });
        break;
      case 'call': {
        if (WEB) break;
        const text = s.text || said.join(' ') || `Your ${r.name} routine is running.`;
        const res = await callMe(text);
        if (!res.ok && res.message) useToasts.getState().push({ kind: 'warn', text: 'Couldn’t phone you', detail: res.message, ms: 9000 });
        break;
      }
    }
    await untilQuiet();
  }
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const cardList = () => {
  const names = MODULES.filter((m) => !WEB || !['stocks', 'sports', 'instagram', 'projects', 'email'].includes(m.id)).map((m) => m.title);
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const JOKES = [
  'I tried to organise my cards alphabetically. Now the weather comes before the news, and nobody is happy.',
  'Why did the hologram break up with the screen? It needed more depth in the relationship.',
  'I’d tell you a joke about the cloud, but it’s a bit over your head.',
  'My ring of cards never gets lost. It always comes back around.',
  'I asked the weather card for a joke. It said: expect scattered chuckles.',
];

/** Replies for everyday talk. They work with no AI key at all. */
function smallTalk(topic: SmallTalk): string {
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  switch (topic) {
    case 'hello':
      return pick([`Good ${part}. What can I do for you?`, 'Hello. I’m here — what do you need?', `Hi. Say “open” and a card, or ask me anything.`]);
    case 'thanks':
      return pick(['You’re welcome.', 'Any time.', 'Happy to help.']);
    case 'howareyou':
      return pick(['All systems running smoothly, thanks for asking. How can I help?', 'I’m good — everything’s in its place. What would you like?']);
    case 'who':
      return `I’m Divina, the voice of this room. I can open your cards — ${cardList()} — move the room around, ${WEB ? '' : 'control your computer, '}and, with your own AI key in Settings, answer pretty much anything.`;
    case 'time':
      return `It’s ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    case 'date':
      return `It’s ${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;
    case 'joke':
      return pick(JOKES);
    case 'bye':
      return pick(['Okay. I’m here when you need me.', 'Goodbye for now.', 'Talk soon.']);
    case 'yes':
      return 'Okay. What would you like me to do?';
    case 'no':
      return 'No problem.';
  }
}

const HELP = () =>
  `Here are some things you can say. “Open crypto”, or any card: ${cardList()}. “What’s the weather?” “Add milk to my list.” “What’s on my list?” “Talk to Coach,” or any agent you make in the Agents card, and “back to Divina.” “What’s on my calendar?” “Rotate right.” “Take me to the observatory.” “Turn into a human.” “Play Drake on Spotify.” “Play some jazz on Apple Music.” ${WEB ? '' : '“Pause.” “Next song.” “Volume 40.” “Remind me to call Sam in ten minutes.” '}“Open settings.” With an AI key in Settings, you can ask me anything else too.`;

async function runLocal(c: Command, utterance: string): Promise<boolean> {
  const data = useData.getState().modules;
  switch (c.kind) {
    case 'transform':
      transformTo(c.to, 'voice', utterance);
      return true;
    case 'open':
      bus.emit({ type: 'open', module: c.module, source: 'voice' });
      if (clock.embodied) say(summarize(c.module, data[c.module]).sentence);
      else audio.play('confirm');
      return true;
    case 'rotate':
      bus.emit({ type: 'rotate', steps: c.steps, source: 'voice' });
      return true;
    case 'collapse':
      bus.emit({ type: 'collapse', source: 'voice' });
      return true;
    case 'world':
      bus.emit({ type: 'world', world: c.world, source: 'voice' });
      say(WORLDS[c.world].name + '.');
      return true;
    case 'motion':
      useWorld.getState().setMotion(c.on);
      say(c.on ? 'Letting the room drift.' : 'Holding still.');
      return true;
    case 'desktop':
      await runDesktop(c.verb, c.args);
      return true;
    case 'personal': {
      const ig = data.instagram;
      if (ig?.status !== 'ok') {
        say(ig?.message ?? 'I can’t see your Instagram feed yet.');
        return true;
      }
      const dest = (ig.data as InstagramData).destinations;
      const url = c.target === 'reels' ? dest.reels : c.target === 'latest' ? dest.latest : dest.profile;
      if (!url) say('I couldn’t find a recent post in your feed.');
      else await runDesktop('open_url', { url });
      return true;
    }
    case 'quote': {
      try {
        const r = await fetch(`/api/quote?symbol=${encodeURIComponent(c.symbol)}`);
        const q = (await r.json()) as { price: number; changePct: number; currency: string; name: string; error?: string };
        if (q.error) throw new Error(q.error);
        const dir = q.changePct >= 0 ? 'up' : 'down';
        say(`${q.name} is at ${fmt.money(q.price, q.currency)}, ${dir} ${Math.abs(q.changePct).toFixed(2)} percent today.`);
      } catch (err) {
        say(`I couldn’t get a quote for ${c.name}: ${(err as Error).message}.`);
      }
      return true;
    }
    case 'schedule':
      bus.emit({ type: 'open', module: 'calendar', source: 'voice' });
      say(summarize('calendar', data.calendar).sentence);
      return true;
    case 'news':
      say(summarize('news', data.news).sentence);
      return true;
    case 'weather':
      bus.emit({ type: 'open', module: 'weather', source: 'voice' });
      say(summarize('weather', data.weather).sentence);
      return true;
    case 'settings':
      openSettings();
      audio.play('confirm');
      return true;
    case 'voiceMode': {
      const r = await saveSettings({ DIVINA_VOICE_MODE: c.fast ? 'fast' : 'studio' });
      say(r.ok ? (c.fast ? 'Switched to the fast voice.' : 'Switched to the natural voice.') : `I couldn’t change that: ${r.message}`);
      return true;
    }
    case 'thinking': {
      const r = await saveSettings({ DIVINA_THINKING: c.fast ? 'fast' : 'deep' });
      say(r.ok ? (c.fast ? 'I’ll keep my answers quick.' : 'I’ll take more time to think.') : `I couldn’t change that: ${r.message}`);
      return true;
    }
    case 'league': {
      const st = await loadSettings();
      const current = parseLeagueList(st?.settings.DIVINA_LEAGUE.value);
      let next =
        c.op === 'only' ? [...c.codes] : c.op === 'add' ? [...current, ...c.codes.filter((x) => !current.includes(x))] : current.filter((x) => !c.codes.includes(x));
      if (!next.length) {
        say('I need at least one league to follow.');
        return true;
      }
      const dropped = next.length > MAX_LEAGUES;
      next = next.slice(0, MAX_LEAGUES);
      const r = await saveSettings({ DIVINA_LEAGUE: next.join(', ') });
      if (!r.ok) {
        say(`I couldn’t change your leagues: ${r.message}`);
        return true;
      }
      const list = next.map((x) => LEAGUE_BY_CODE[x]?.name ?? x);
      const names = c.names.join(' and ');
      const lead = c.op === 'remove' ? `Stopped following ${names}.` : c.op === 'only' ? `Now following only ${names}.` : `Following ${names}.`;
      say(`${lead}${c.op !== 'only' ? ` Your leagues: ${list.join(', ')}.` : ''}${dropped ? ` That’s the limit of ${MAX_LEAGUES}.` : ''}`);
      bus.emit({ type: 'open', module: 'sports', source: 'voice' });
      return true;
    }
    case 'playSearch': {
      // no service named: whatever is already playing, else Spotify
      const music = data.music?.status === 'ok' ? (data.music.data as { player?: string }) : null;
      const service = c.service ?? (music?.player ? serviceFrom(music.player) : null) ?? 'spotify';
      await runDesktop('play_search', { service, query: c.query });
      return true;
    }
    case 'note': {
      const r = await notesOp(c.op === 'add' ? { op: 'add', text: c.text } : { op: c.op, match: c.text });
      say(r.message ?? (r.ok ? 'Done.' : 'I couldn’t change your list.'));
      if (r.ok) bus.emit({ type: 'open', module: 'notes', source: 'voice' });
      return true;
    }
    case 'agent': {
      if (c.name === null) {
        const was = activeAgent();
        switchAgent(null);
        say(was ? `I’m back. ${was.name} is still in your Agents card.` : 'I’m here.');
        return true;
      }
      const agent = findAgent(knownAgents(), c.name);
      if (!agent) {
        if (!c.strict) return false; // "switch to …" that isn't an agent: let the AI work it out
        const names = knownAgents().map((a) => a.name);
        say(names.length ? `I don’t have an agent called ${c.name}. Your agents are ${names.join(', ')}.` : `You don’t have any agents yet. Open the Agents card to make one.`);
        return true;
      }
      switchAgent(agent.id);
      if (c.then) {
        ai().push({ role: 'user', text: c.then, at: Date.now() });
        await ask(c.then);
      } else say(`Hi, it’s ${agent.name}. What can I do for you?`);
      return true;
    }
    case 'memory': {
      if (c.op === 'list') {
        const mem = usePersonal.getState().memory;
        say(mem.length ? `Here’s what I remember: ${mem.slice(0, 12).map((m) => m.text).join('. ')}.${mem.length > 12 ? ` And ${mem.length - 12} more, in Settings under Memory.` : ''}` : 'You haven’t asked me to remember anything yet. Try “remember that my sister is called Amy”.');
        return true;
      }
      if (c.op === 'clear' && !(await useConfirm.getState().ask('Forget everything you asked Divina to remember'))) {
        say('Okay, I’ll keep it.');
        return true;
      }
      const r = await personalOp('memory', c.op === 'add' ? { op: 'add', text: c.text } : c.op === 'forget' ? { op: 'remove', match: c.text } : { op: 'clear' });
      say(r.message ?? (r.ok ? 'Done.' : 'I couldn’t change my memory.'));
      return true;
    }
    case 'mind': {
      if (c.close) {
        closeMind();
        say('Closing my mind.');
        return true;
      }
      openMind();
      const mem = usePersonal.getState().memory.length;
      say(mem ? `This is my mind: ${mem} thing${mem === 1 ? '' : 's'} you’ve told me, your plans and agents, and everything I can do. Tap a branch to look closer.` : 'This is my mind: everything I can do. Tell me things to remember and it grows.');
      return true;
    }
    case 'timer': {
      if (c.op === 'start') {
        startTimer(c.minutes, c.label);
        const d = spokenDuration(c.minutes * 60_000);
        say(c.label === 'Timer' ? `Timer set for ${d}.` : `Okay, I’ll remind you to ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)} in ${d}.`);
      } else if (c.op === 'cancel') {
        const n = cancelTimers();
        say(n ? `Cancelled ${n === 1 ? 'your timer' : `${n} timers`}.` : 'There’s no timer running.');
      } else {
        const ts = useTimers.getState().timers;
        say(ts.length ? ts.map((t) => `${t.label === 'Timer' ? 'Your timer' : t.label} has ${spokenDuration(timeLeft(t))} left`).join('. ') + '.' : 'There’s no timer running.');
      }
      return true;
    }
    case 'screen': {
      if (IOS) {
        say('Apple doesn’t let apps see your screen on iPhone, so I can’t look at it here. On a computer, Divina can.');
        return true;
      }
      // asks every time: a picture of the screen can show anything
      const who = ai().online ? 'your AI' : null;
      if (!who) {
        say('To look at your screen I need an AI connected. Add your own key in Settings, under AI.');
        return true;
      }
      if (!(await useConfirm.getState().ask(`Take a picture of your screen and send it to ${aiCompany()} with your question`))) {
        say('Okay, I won’t look.');
        return true;
      }
      const shot = await captureScreen();
      if ('error' in shot) {
        say(shot.error);
        return true;
      }
      useToasts.getState().push({ kind: 'info', text: 'Sent this picture of your screen', image: shot.preview, ms: 8000 });
      await ask(c.question, shot);
      return true;
    }
    case 'translate': {
      const tr = useTranslator.getState();
      if (c.op === 'stop') {
        if (!tr.on) say('The translator isn’t on.');
        else stopTranslator();
        return true;
      }
      if (c.op === 'swap') {
        if (tr.on) swapTranslator();
        else say('The translator isn’t on. Say “translate into Spanish”.');
        return true;
      }
      if (!ai().online) {
        say('The translator needs an AI connected. Add your own key in Settings, under AI.');
        return true;
      }
      const from = c.from ?? (usePrefs.getState().lang || 'en');
      const to = c.to ?? 'es';
      if (from === to) {
        say(`You’re already speaking ${langName(to)}.`);
        return true;
      }
      setTranslator(from, to, !!c.turns);
      say(c.turns ? `Okay. I’ll translate between ${langName(from)} and ${langName(to)}, taking turns. Speak in ${langName(from)} first.` : `Okay. Speak in ${langName(from)} and I’ll say it in ${langName(to)}. Say “stop translating” when you’re done.`);
      return true;
    }
    case 'tour': {
      const { startTour } = await import('@/hud/Tour');
      startTour();
      return true;
    }
    case 'share': {
      const ring = useRing.getState();
      const id = c.module ?? ring.expanded ?? frontModule(ring.frontStep);
      const { shareCard } = await import('@/hud/ShareCard');
      shareCard(id);
      say(`Here’s your ${MODULE_BY_ID[id].title} card as a picture. Check it before you share.`);
      return true;
    }
    case 'customWorld': {
      const w = findWorld(usePersonal.getState().worlds, c.name);
      if (w) {
        useWorld.getState().setCustom(asWorld(w));
        say(`${w.name}.`);
        return true;
      }
      // "switch to Coach" is an agent, not a world
      const agent = findAgent(knownAgents(), c.name);
      if (agent) return runLocal({ kind: 'agent', name: c.name, strict: true }, utterance);
      return false; // let the AI work out what was meant
    }
    case 'roundtable': {
      const all = knownAgents();
      const picked = c.names === 'all' ? all : c.names.map((n) => findAgent(all, n)).filter((a): a is NonNullable<typeof a> => !!a);
      const unique = [...new Map(picked.map((a) => [a.id, a])).values()].slice(0, 5);
      if (!ai().online) {
        say('A round-table needs an AI connected. Add your own key in Settings, under AI.');
        return true;
      }
      if (unique.length < 2) {
        say(all.length < 2 ? 'A round-table needs at least two agents. Make some in the Agents card.' : `I need at least two of your agents for that. You have ${all.map((a) => a.name).join(', ')}.`);
        return true;
      }
      await roundTable(unique, c.question);
      return true;
    }
    case 'brief':
      bus.emit({ type: 'open', module: c.module, source: 'voice' });
      say(summarize(c.module, data[c.module]).sentence);
      return true;
    case 'unknownCard': {
      const near = mentionedModule(c.name);
      if (near) {
        bus.emit({ type: 'open', module: near, source: 'voice' });
        audio.play('confirm');
        return true;
      }
      say(`I don’t have a ${c.name} card. Your cards are ${cardList()}.`);
      return true;
    }
    case 'help':
      say(HELP());
      return true;
    case 'smalltalk':
      say(smallTalk(c.topic));
      return true;
    case 'ask':
      return false;
  }
}

// ── the model ─────────────────────────────────────────────────────
/**
 * What the MODEL may do on the computer by itself. The model reads outside
 * text (headlines, captions, calendar titles) that could contain planted
 * instructions, so anything that could leak data or change something needs
 * the person's yes, and reading the clipboard or the screen is never done
 * on the model's initiative. Commands the person speaks are not affected.
 */
const AI_DESKTOP_POLICY: Record<string, 'auto' | 'ask' | 'never'> = {
  media: 'auto',
  volume: 'auto',
  now_playing: 'auto',
  play_search: 'auto',
  list_apps: 'auto',
  list_displays: 'auto',
  launch_app: 'ask',
  open_url: 'ask',
  quit_app: 'ask',
  hide_others: 'ask',
  lock_screen: 'ask',
  sleep_display: 'ask',
  dnd: 'ask',
  clipboard_write: 'ask',
  create_note: 'ask',
  create_reminder: 'ask',
  clipboard_read: 'never',
  screenshot: 'never',
};

function describeAction(verb: string, a: Record<string, unknown>): string {
  switch (verb) {
    case 'launch_app':
      return `Open ${String(a.name ?? 'an app')}`;
    case 'open_url':
      return 'Open this website';
    case 'play_search':
      return `Search ${SERVICE_NAMES[a.service as MusicService] ?? 'music'} for “${String(a.query ?? '')}”`;
    case 'quit_app':
      return `Close ${String(a.name ?? 'an app')}`;
    case 'hide_others':
      return 'Hide your other windows';
    case 'lock_screen':
      return 'Lock your screen';
    case 'sleep_display':
      return 'Turn off your display';
    case 'dnd':
      return `Turn Do Not Disturb ${a.on ? 'on' : 'off'}`;
    case 'clipboard_write':
      return 'Replace what’s on your clipboard';
    case 'create_note':
      return `Create a note “${String(a.title ?? '')}”`;
    case 'create_reminder':
      return `Add a reminder “${String(a.title ?? '')}”`;
    default:
      return verb;
  }
}

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'open_module':
      if (typeof args.module === 'string' && isModuleId(args.module)) bus.emit({ type: 'open', module: args.module, source: 'ai' });
      return;
    case 'rotate_carousel':
      bus.emit({ type: 'rotate', steps: Number(args.steps) || 1, source: 'voice' });
      return;
    case 'set_environment':
      if (typeof args.world === 'string' && (WORLD_IDS as string[]).includes(args.world)) bus.emit({ type: 'world', world: args.world as WorldId, source: 'ai' });
      return;
    case 'transform_form':
      if (args.to === 'human' || args.to === 'spatial') transformTo(args.to, 'ai');
      return;
    case 'memory': {
      // Memory lasts, so it must come from the person: without "remember" (or similar) in what they
      // just said, the model is asked to show it first. Headlines can't plant memories.
      const text = typeof args.text === 'string' ? args.text : '';
      const said = [...ai().history].reverse().find((t) => t.role === 'user')?.text ?? '';
      if (args.action === 'add') {
        if (!/\b(remember|don'?t forget|keep in mind|note that|for future|from now on)\b/i.test(said) && !(await useConfirm.getState().ask(`Remember: “${text}”`))) return;
        const r = await personalOp('memory', { op: 'add', text });
        if (!r.ok) log('warn', `memory: ${r.message}`);
      } else if (args.action === 'forget') {
        if (!(await useConfirm.getState().ask(`Forget: “${text}”`))) return;
        await personalOp('memory', { op: 'remove', match: text });
      }
      return;
    }
    case 'notes': {
      // the person's own list: adding and ticking go ahead, removing asks first
      const action = args.action;
      const text = typeof args.text === 'string' ? args.text : '';
      if (action !== 'add' && action !== 'done' && action !== 'remove') return;
      if (action === 'remove' && !(await useConfirm.getState().ask(`Remove “${text}” from your notes`))) return;
      const r = await notesOp(action === 'add' ? { op: 'add', text } : { op: action, match: text });
      if (!r.ok) log('warn', `notes: ${r.message}`);
      return;
    }
    case 'desktop_action': {
      if (typeof args.verb !== 'string') return;
      const verbArgs = (args.args as Record<string, unknown>) ?? {};
      const policy = Object.hasOwn(AI_DESKTOP_POLICY, args.verb) ? AI_DESKTOP_POLICY[args.verb] : 'never';
      if (policy === 'never') {
        log('warn', `blocked AI request: ${args.verb}`);
        say('I won’t do that on my own. Ask me directly if you want it.');
        return;
      }
      if (policy === 'ask') {
        const ok = await useConfirm.getState().ask(describeAction(args.verb, verbArgs), args.verb === 'open_url' ? String(verbArgs.url ?? '') : undefined);
        if (!ok) {
          say('Okay, I won’t.');
          return;
        }
      }
      await runDesktop(args.verb, verbArgs);
      return;
    }
  }
}

/** Listen, speak and answer in the chosen language (Settings → Language). */
export function applyLanguage() {
  const code = usePrefs.getState().lang;
  const tag = code ? (LANG_BY_CODE[code]?.tag ?? '') : '';
  listener.setLang(tag);
  voice.lang = tag;
}

// ── agent round-table ─────────────────────────────────────────────
/** One answer, spoken sentence by sentence as it streams. Tool calls are ignored here. */
async function speakOnce(agentId: string | undefined, history: { role: 'user' | 'model'; text: string }[]): Promise<string> {
  const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ history, context: context(), agent: agentId, lang: usePrefs.getState().lang || undefined }) });
  if (!res.ok || !res.body) return '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let pending = '';
  const flush = (final: boolean) => {
    const re = /[^.!?…]+[.!?…]+(\s|$)/g;
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = re.exec(pending))) {
      voice.say(m[0]);
      last = re.lastIndex;
    }
    pending = pending.slice(last);
    if (final && pending.trim()) {
      voice.say(pending);
      pending = '';
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (/event: token/.test(block)) {
        const t = (JSON.parse(/data: (.*)/s.exec(block)?.[1] ?? '{}') as { text?: string }).text ?? '';
        full += t;
        pending += t;
        ai().setResponse(full);
        flush(false);
      }
    }
  }
  flush(true);
  return full.trim();
}

/**
 * Several agents answer the same question in turn, each hearing what the
 * others said, then Divina sums up. Each speaks with its own voice and name.
 */
async function roundTable(agents: { id: string; name: string }[], question: string) {
  interrupt();
  say(`Round-table with ${agents.map((a) => a.name).join(', ')}.`);
  await untilQuiet();
  const said: { name: string; text: string }[] = [];
  try {
    for (const a of agents) {
      useSpeaker.setState({ agent: a.id, divina: false });
      const earlier = said.length ? `\n\nThe others in this round-table already said:\n${said.map((s) => `${s.name}: ${s.text}`).join('\n')}\nAdd your own view in two or three sentences; build on or disagree with them, don't repeat them.` : '\n\nAnswer in two or three sentences; others will add their views after you.';
      const text = await speakOnce(a.id, [{ role: 'user', text: `${question}${earlier}` }]);
      if (text) said.push({ name: a.name, text });
      await untilQuiet();
    }
    useSpeaker.setState({ agent: null, divina: true });
    if (said.length) {
      const summary = await speakOnce(undefined, [{ role: 'user', text: `My agents discussed: "${question}"\n${said.map((s) => `${s.name}: ${s.text}`).join('\n')}\nSum it up in two sentences and give me one clear combined recommendation.` }]);
      record(`Round-table: ${question}`, [...said.map((s) => `${s.name}: ${s.text}`), `Divina: ${summary}`].join('\n'));
      await untilQuiet();
    }
  } finally {
    useSpeaker.setState({ agent: null, divina: false });
  }
}

// ── live translator ───────────────────────────────────────────────
export function setTranslator(from: string, to: string, turns: boolean) {
  if (from === to) return;
  useTranslator.setState({ on: true, from, to, turns, busy: false });
  listener.setLang(langTag(from));
  bus.emit({ type: 'collapse', source: 'voice' });
}
export function swapTranslator() {
  const t = useTranslator.getState();
  setTranslator(t.to, t.from, t.turns);
  ai().setResponse(`${langName(t.to)} → ${langName(t.from)}`);
}
export function stopTranslator() {
  useTranslator.setState({ on: false, last: null, busy: false });
  listener.setLang(LANG_BY_CODE[usePrefs.getState().lang || 'en']?.tag ?? '');
  say('Translator off.');
}

/** One line through the translator: translate, show it big, speak it in the other language. */
async function translateHeard(text: string) {
  const t = useTranslator.getState();
  useTranslator.setState({ busy: true });
  try {
    const said = await translateLine(text, t.from, t.to);
    useTranslator.setState({ last: { heard: text, said, from: t.from, to: t.to }, busy: false });
    ai().setResponse(said);
    voice.say(said, langTag(t.to));
    if (t.turns) {
      // the other person answers next, in their language
      useTranslator.setState({ from: t.to, to: t.from });
      listener.setLang(langTag(t.to));
    }
  } catch (err) {
    useTranslator.setState({ busy: false });
    say((err as Error).message);
  }
}

/** The AI company the person picked, for plain-language prompts. */
function aiCompany(): string {
  const p = useAI.getState().provider;
  return p && p in AI_NAMES ? AI_NAMES[p as keyof typeof AI_NAMES] : 'your AI';
}

async function ask(text: string, image?: Shot) {
  const a = ai();
  a.setStatus('thinking');
  a.setResponse('');
  stream?.abort();
  const ctrl = new AbortController();
  stream = ctrl;
  const history = a.history.map((t) => ({ role: t.role, text: t.text, calls: t.calls }));
  let res: Response;
  try {
    res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ history, context: context(), agent: activeAgent()?.id, lang: usePrefs.getState().lang || undefined, image: image ? { mime: image.mime, data: image.data } : undefined }), signal: ctrl.signal });
  } catch {
    if (ctrl.signal.aborted) return;
    return offline(text, WEB ? 'I can’t reach the internet right now.' : 'The Divina server is unreachable.');
  }
  if (res.status === 429 || res.status === 403) {
    const j = (await res.json().catch(() => ({}))) as { message?: string };
    const msg = j.message ?? 'That request was refused.';
    say(msg);
    record(null, msg);
    ai().setStatus('idle');
    return;
  }
  if (res.status === 503 || !res.body) {
    a.setOnline(false);
    return offline(text);
  }
  a.setOnline(true);
  a.setStatus('streaming');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let pending = '';
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let finishReason = '';
  const flushSentences = (final: boolean) => {
    const re = /[^.!?…]+[.!?…]+(\s|$)/g;
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = re.exec(pending))) {
      voice.say(m[0]);
      spokenRecently = `${spokenRecently} ${m[0]}`.slice(-400);
      last = re.lastIndex;
    }
    pending = pending.slice(last);
    if (final && pending.trim()) {
      voice.say(pending);
      pending = '';
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /event: (\w+)/.exec(block)?.[1];
        const data = JSON.parse(/data: (.*)/s.exec(block)?.[1] ?? '{}');
        if (ev === 'token') {
          full += data.text;
          pending += data.text;
          ai().setResponse(full);
          flushSentences(false);
        } else if (ev === 'call') {
          calls.push(data);
          await executeTool(data.name, data.args);
        } else if (ev === 'finish') {
          finishReason = String(data.reason);
        } else if (ev === 'error') {
          log('warn', `model: ${data.message}`);
          if (!full) say('The model returned an error. ' + String(data.message).slice(0, 120));
        }
      }
    }
    flushSentences(true);
  } catch {
    if (ctrl.signal.aborted) {
      record(null, `${full} [interrupted]`, calls);
      return;
    }
  } finally {
    if (stream === ctrl) stream = null;
  }
  if (!full && calls.length) {
    full = 'Done.';
    ai().setResponse(full);
  } else if (!full) {
    // Never go silent: say what happened.
    full = finishReason === 'MAX_TOKENS' ? 'I ran out of room before I could answer. Try asking a shorter question.' : finishReason === 'SAFETY' ? 'The model declined to answer that one.' : 'I didn’t get an answer back from the model. Try again in a moment.';
    say(full);
    log('warn', `model returned no text${finishReason ? ` (${finishReason})` : ''}`);
  }
  record(null, full, calls);
  if (!voice.speaking) ai().setStatus('idle');
}

function offline(text: string, why?: string) {
  const a = ai();
  a.setStatus('offline');
  const data = useData.getState().modules;
  const ring = useRing.getState();
  const emb = useEmbody.getState();
  const current: ModuleId | null = clock.embodied ? (emb.presented[emb.presented.length - 1] ?? null) : (ring.expanded ?? frontModule(ring.frontStep));
  let answer: string;
  const named = mentionedModule(text);
  if (/\b(this|that|it)\b/i.test(text) && current) answer = summarize(current, data[current]).sentence;
  else if (named) {
    // not a command I know, but it's about one of the cards: show it and say what's on it
    bus.emit({ type: 'open', module: named, source: 'voice' });
    answer = summarize(named, data[named]).sentence;
  } else if (why) answer = `${why} I can still open cards and move the room${WEB ? '' : ' and control your computer'}. Say “help” to hear what I can do.`;
  else
    answer = `I can’t answer questions like that yet, because no AI is connected. Add your own Gemini, Claude or OpenAI key in Settings, under AI, and I’ll answer anything. Until then, say “help” to hear what I can do.`;
  say(answer);
  record(null, answer);
}

// ── entry point ───────────────────────────────────────────────────
export async function handle(text: string, source: 'voice' | 'palette' = 'voice') {
  const clean = text.trim();
  if (!clean) return;
  audio.unlock();
  window.clearTimeout(sleepTimer);
  if (voice.speaking) interrupt();
  const a = ai();
  a.setHearing('');
  log('info', `“${clean}”`);
  if (useTranslator.getState().on) {
    const c = parseCommand(clean)[0];
    if (c?.kind === 'translate') await runLocal(c, clean);
    else await translateHeard(stripWake(clean) || clean);
    return;
  }
  const routine = routineFor(usePersonal.getState().routines, stripWake(clean));
  if (routine) {
    a.push({ role: 'user', text: clean, at: Date.now() });
    await runRoutine(routine);
    a.push({ role: 'model', text: `[ran routine: ${routine.name}]`, at: Date.now() });
    if (!voice.speaking) a.setStatus('idle');
    return;
  }
  const cmds = parseCommand(clean);
  const localOnly = cmds.length && cmds.every((c) => c.kind !== 'ask');
  if (localOnly) {
    // transform records both sides itself
    if (cmds[0].kind !== 'transform') a.push({ role: 'user', text: clean, at: Date.now() });
    let handled = true;
    for (const c of cmds) handled = (await runLocal(c, clean)) && handled;
    if (!handled) {
      await ask(clean);
      return;
    }
    if (cmds[0].kind !== 'transform') a.push({ role: 'model', text: `[acted: ${cmds.map((c) => c.kind).join(', ')}]`, at: Date.now() });
    if (!voice.speaking) a.setStatus('idle');
    return;
  }
  a.push({ role: 'user', text: clean, at: Date.now() });
  await ask(clean);
  void source;
}

// ── install ───────────────────────────────────────────────────────
export function installAssistant() {
  void loadPersonal();
  applyLanguage();
  installHeadsUps({ say, routines: () => usePersonal.getState().routines, runRoutine });
  voice.onStart = () => {
    ai().setStatus('speaking');
    rig.speaking = true;
  };
  voice.onIdle = () => {
    rig.speaking = false;
    const s = ai().status;
    if (s === 'speaking' || s === 'streaming') ai().setStatus(ai().awake && listener.floorOpen ? 'listening' : 'idle');
  };
  listener.install({
    onWake: () => wake('phrase'),
    onUtterance: (t) => void handle(t, 'voice'),
    onBargeIn: interrupt,
    isSpeaking: () => voice.speaking,
    recentlySpoken: () => spokenRecently,
  });
  setEmbodimentVoice(
    (t) => say(t),
    (user, model) => record(user, model),
  );
  setRefusalVoice((t) => say(t));
  void fetch('/api/ai')
    .then((r) => r.json())
    .then((j: { online: boolean; studioVoice?: boolean; provider?: string | null }) => {
      ai().setOnline(j.online);
      useAI.setState({ provider: j.provider ?? null });
      voice.studio = j.studioVoice ?? j.online;
      if (!j.online) ai().setStatus('offline');
    })
    .catch(() => ai().setStatus('offline'));
  return bus.on((i) => {
    if (i.type === 'wake') wake(i.source);
  });
}
