/**
 * Heads-ups: timers, meetings about to start, rain on the way, and routines
 * set to run at a time. Checked every 15 seconds while Divina is open; each
 * says what's happening (out loud unless it's quiet hours) and shows a note.
 */
import { create } from 'zustand';
import { useData } from '@/stores/data';
import { useToasts } from '@/stores/toasts';
import { usePrefs } from '@/stores/prefs';
import { audio } from '@/audio/engine';
import type { CalendarData, WeatherData } from '@/modules/types';
import type { Routine } from '@/lib/personal';
import { newId } from '@/lib/personal';
import { callMe } from '@/lib/client/phone';
import { WEB } from '@/lib/edition';

export interface Timer {
  id: string;
  label: string;
  endsAt: number;
}

const KEY = 'divina.timers';
const read = (): Timer[] => {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Timer[];
    return Array.isArray(t) ? t.filter((x) => typeof x.endsAt === 'number' && typeof x.label === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
};
const save = (t: Timer[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* lasts this visit */
  }
};

export const useTimers = create<{ timers: Timer[] }>(() => ({ timers: [] }));

export function startTimer(minutes: number, label = 'Timer'): Timer {
  const t: Timer = { id: newId(), label: label.slice(0, 60), endsAt: Date.now() + minutes * 60_000 };
  const timers = [...useTimers.getState().timers, t].sort((a, b) => a.endsAt - b.endsAt).slice(0, 20);
  useTimers.setState({ timers });
  save(timers);
  return t;
}
export function cancelTimers(): number {
  const n = useTimers.getState().timers.length;
  useTimers.setState({ timers: [] });
  save([]);
  return n;
}
export const timeLeft = (t: Timer, now = Date.now()) => Math.max(0, t.endsAt - now);
export function spokenDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h} hour${h === 1 ? '' : 's'}${m ? ` and ${m} minute${m === 1 ? '' : 's'}` : ''}`;
  if (m) return `${m} minute${m === 1 ? '' : 's'}${m < 5 && sec ? ` and ${sec} seconds` : ''}`;
  return `${sec} seconds`;
}

/** Quiet hours: notes still appear, nothing is said out loud and no routine starts itself. */
export function isQuiet(now = new Date()): boolean {
  const { quietFrom, quietTo } = usePrefs.getState();
  if (!quietFrom || !quietTo || quietFrom === quietTo) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  const [a, b] = [quietFrom, quietTo].map((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5)));
  return a < b ? m >= a && m < b : m >= a || m < b;
}

interface Hooks {
  say: (text: string) => void;
  routines: () => Routine[];
  runRoutine: (r: Routine) => Promise<void>;
}

const told = new Set<string>(); // what's already been said, so nothing repeats

/** Ring your phone too, if you've asked for that: never in quiet hours. */
function phone(text: string) {
  if (WEB || !usePrefs.getState().phoneHeadsUps || isQuiet()) return;
  void callMe(text);
}

function notify(h: Hooks, text: string, detail?: string, call = false) {
  useToasts.getState().push({ kind: 'info', text, detail, ms: 12_000 });
  audio.play('confirm');
  if (!isQuiet()) h.say(detail ? `${text} ${detail}` : text);
  if (call) phone(detail ? `${text} ${detail}` : text);
}

export function check(h: Hooks, now = Date.now()) {
  const prefs = usePrefs.getState();
  // timers
  const { timers } = useTimers.getState();
  const due = timers.filter((t) => t.endsAt <= now);
  if (due.length) {
    const left = timers.filter((t) => t.endsAt > now);
    useTimers.setState({ timers: left });
    save(left);
    for (const t of due) {
      // a timer that went off while Divina was closed is still reported, once
      useToasts.getState().push({ kind: 'info', text: t.label === 'Timer' ? 'Time’s up!' : `Reminder: ${t.label}`, ms: 20_000 });
      audio.play('confirm');
      if (!isQuiet() || now - t.endsAt < 60_000) h.say(t.label === 'Timer' ? 'Time’s up!' : `Reminder: ${t.label}.`);
      // only a timer that's just gone off rings: not one that ended while Divina was closed
      if (now - t.endsAt < 60_000) phone(t.label === 'Timer' ? 'Your timer is up.' : `Reminder: ${t.label}.`);
    }
  }
  const data = useData.getState().modules;
  // meetings about to start
  if (prefs.headsMeetings && data.calendar?.status === 'ok') {
    for (const e of (data.calendar.data as CalendarData).events) {
      if (e.allDay) continue;
      const mins = (new Date(e.start).getTime() - now) / 60_000;
      const key = `meet:${e.id}:${e.start}`;
      if (mins > 0 && mins <= 10 && !told.has(key)) {
        told.add(key);
        notify(h, `${e.title} starts in ${Math.max(1, Math.round(mins))} minute${Math.round(mins) === 1 ? '' : 's'}.`, e.location ? `At ${e.location}.` : undefined, true);
      }
    }
  }
  // rain on the way (once every 3 hours at most)
  if (prefs.headsRain && data.weather?.status === 'ok') {
    const w = data.weather.data as WeatherData;
    const dry = w.condition !== 'rain' && w.condition !== 'storm';
    const soon = w.hourly.slice(1, 4).find((x) => (x.precip ?? 0) >= 60 || (x.mm ?? 0) >= 0.5);
    const key = `rain:${Math.floor(now / (3 * 3600_000))}`;
    if (dry && soon && !told.has(key)) {
      told.add(key);
      const at = new Date(soon.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      notify(h, `Rain is likely around ${at}.`, 'You might want a coat.');
    }
  }
  // routines set to a time
  if (!isQuiet()) {
    const d = new Date(now);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const day = d.getDay();
    for (const r of h.routines()) {
      if (!r.time || r.time !== hhmm) continue;
      if ((r.days === 'weekdays' && (day === 0 || day === 6)) || (r.days === 'weekends' && day > 0 && day < 6)) continue;
      const key = `routine:${r.id}:${d.toDateString()}`;
      if (told.has(key)) continue;
      told.add(key);
      void h.runRoutine(r);
    }
  }
}

export function installHeadsUps(h: Hooks) {
  useTimers.setState({ timers: read() });
  const id = window.setInterval(() => check(h), 15_000);
  window.setTimeout(() => check(h), 4000);
  return () => window.clearInterval(id);
}
