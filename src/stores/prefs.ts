/**
 * Per-browser preferences (not secrets, not shared): how replies are shown
 * and what may interrupt Divina. Kept in localStorage.
 */
import { create } from 'zustand';
import { prefStorage } from '@/lib/consent';

export type ReplyDisplay = 'captions' | 'hologram' | 'both';
export type InterruptMode = 'name' | 'any' | 'off';

interface Prefs {
  replyDisplay: ReplyDisplay;
  interrupt: InterruptMode;
  captionSize: 'normal' | 'large';
  /** the custom agent being talked to (its id), or null for Divina */
  agent: string | null;
  /** heads-ups: a meeting about to start, rain on the way */
  headsMeetings: boolean;
  headsRain: boolean;
  /** also ring your phone for timers, reminders and meetings (Windows and Mac, once set up) */
  phoneHeadsUps: boolean;
  /** quiet hours, "22:00" to "07:00": notes only, nothing said, no routine starts itself */
  quietFrom: string;
  quietTo: string;
  /** the language Divina listens and answers in ('' = the browser's) */
  lang: string;
  set(p: Partial<Omit<Prefs, 'set'>>): void;
}

const KEY = 'divina.prefs';

function read(): Partial<Prefs> {
  try {
    return JSON.parse(prefStorage.get(KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  replyDisplay: 'captions',
  interrupt: 'name',
  captionSize: 'normal',
  agent: null,
  headsMeetings: true,
  headsRain: true,
  phoneHeadsUps: false,
  quietFrom: '22:00',
  quietTo: '07:00',
  lang: '',
  set: (p) => {
    set(p);
    try {
      const { set: _s, ...all } = get();
      void _s;
      prefStorage.set(KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable: preference lasts for this visit */
    }
  },
}));

export function loadPrefs() {
  const p = read();
  usePrefs.setState({
    ...(p.replyDisplay ? { replyDisplay: p.replyDisplay } : {}),
    ...(p.interrupt ? { interrupt: p.interrupt } : {}),
    ...(p.captionSize ? { captionSize: p.captionSize } : {}),
    ...(typeof p.agent === 'string' && /^[a-z0-9]{6,24}$/.test(p.agent) ? { agent: p.agent } : {}),
    ...(typeof p.headsMeetings === 'boolean' ? { headsMeetings: p.headsMeetings } : {}),
    ...(typeof p.headsRain === 'boolean' ? { headsRain: p.headsRain } : {}),
    ...(typeof p.phoneHeadsUps === 'boolean' ? { phoneHeadsUps: p.phoneHeadsUps } : {}),
    ...(typeof p.quietFrom === 'string' && /^\d\d:\d\d$/.test(p.quietFrom) ? { quietFrom: p.quietFrom } : {}),
    ...(typeof p.lang === 'string' && /^[a-z]{2}(-[a-z]{2})?$/.test(p.lang) ? { lang: p.lang } : {}),
    ...(typeof p.quietTo === 'string' && /^\d\d:\d\d$/.test(p.quietTo) ? { quietTo: p.quietTo } : {}),
  });
}
