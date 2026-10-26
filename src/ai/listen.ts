/**
 * Speech recognition with a wake phrase. Always listening for "Divina" once
 * the user switches the microphone on; everything after the wake phrase (or
 * the next utterance after a wake gesture) becomes a command.
 *
 * Interruption: if speech is heard while DIVINA is talking, it stops at once.
 */
import { useAI } from '@/stores/ai';
import { log } from '@/stores/system';
import { usePrefs } from '@/stores/prefs';
import { isPhone } from '@/lib/device';
import { IOS } from '@/lib/edition';
import { NativeRecognition } from './nativeSpeech';

interface SRResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SR {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart: (() => void) | null;
}

type Handlers = {
  onWake: () => void;
  onUtterance: (text: string) => void;
  onBargeIn: () => void;
  isSpeaking: () => boolean;
  recentlySpoken: () => string;
};

// Recognisers rarely spell a name the same way twice: accept the usual
// hearings of "Divina" (Davina, Devina, "the Vina", "divine a").
/** Words that stop Divina mid-sentence when said first. */
const STOP_WORDS = /^\s*(?:hey\s+)?(?:d[aeiy]\s?v[ie]{1,2}n+a|the\s+vina|stop|wait|hold on|pause|quiet|enough|shh+)\b[\s,.!?]*/i;

const WAKE = /\b(?:d[aeiy]\s?v[ie]{1,2}n+a|the\s+vina|divine\s+a)\b/i;

export function speechSupported() {
  if (IOS) return true; // the iPhone app uses iOS's own recogniser (nativeSpeech.ts)
  return typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

class Listener {
  private rec: SR | null = null;
  private on = false;
  private h: Handlers | null = null;
  private awakeUntil = 0;
  /**
   * Phones: tap to talk. Their browsers don't keep a microphone open between
   * phrases (iPhone Safari stops after each one and won't restart without a
   * tap), so each tap listens for one request, no wake word needed.
   */
  private once = false;
  /** BCP-47 language to listen for ('' = the browser's) */
  private lang = '';
  /** Listen in another language (the translator, Settings → Language). Restarts if listening. */
  setLang(tag: string) {
    if (tag === this.lang) return;
    this.lang = tag;
    if (this.on && !this.once) {
      this.stop();
      this.start();
    }
  }
  get tapToTalk() {
    return IOS || isPhone();
  }

  install(h: Handlers) {
    this.h = h;
  }

  /** The wake gesture opens the floor for the next utterance. */
  openFloor(ms = 9000) {
    this.awakeUntil = performance.now() + ms;
  }
  closeFloor() {
    this.awakeUntil = 0;
  }
  get floorOpen() {
    return performance.now() < this.awakeUntil;
  }

  start() {
    if (this.on || !speechSupported()) {
      if (!speechSupported()) log('warn', 'speech recognition unavailable in this browser — type to DIVINA with ⌘K');
      return;
    }
    const Ctor = IOS ? NativeRecognition : (((window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition: new () => SR }).webkitSpeechRecognition) as new () => SR);
    const rec = new Ctor();
    this.once = this.tapToTalk;
    rec.continuous = !this.once;
    rec.interimResults = true;
    rec.lang = this.lang || navigator.language || 'en-US';
    rec.onresult = (e) => this.result(e);
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        log('warn', 'microphone permission denied');
        this.stop();
        useAI.getState().setStatus('offline');
      }
    };
    rec.onend = () => {
      if (this.once) {
        // one request per tap; the button shows it's done
        this.on = false;
        this.rec = null;
        useAI.getState().setMic(false);
        useAI.getState().setHearing('');
        return;
      }
      if (this.on) {
        try {
          rec.start();
        } catch {
          /* restarting too fast; the next end retries */
        }
      }
    };
    this.rec = rec;
    this.on = true;
    try {
      rec.start();
      useAI.getState().setMic(true);
      log('ok', this.once ? 'listening · say what you’d like' : 'microphone on · say “Divina”');
      if (this.once) this.openFloor(15000);
    } catch (err) {
      log('warn', `microphone: ${(err as Error).message}`);
    }
  }

  stop() {
    this.on = false;
    this.rec?.abort();
    this.rec = null;
    useAI.getState().setMic(false);
  }

  get active() {
    return this.on;
  }

  private result(e: SREvent) {
    const h = this.h;
    if (!h) return;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0].transcript.trim();
      if (!text) continue;

      // While Divina talks, the microphone also hears her through the
      // speakers. Only a genuine interruption counts; nothing else she
      // "hears" in that time may become a command.
      if (h.isSpeaking()) {
        if (this.isBargeIn(text, h.recentlySpoken())) {
          h.onBargeIn();
          // what followed "Divina, …" / "stop, …" is the new request
          const rest = text.replace(STOP_WORDS, '').replace(/^[\s,.:!?]+/, '');
          if (r.isFinal && rest.split(/\s+/).filter(Boolean).length >= 2) h.onUtterance(rest);
          else this.openFloor();
        }
        continue;
      }

      if (!r.isFinal) {
        interim = text;
        continue;
      }
      if (this.once) {
        // tap to talk: whatever was said is the request ("Divina, …" or not)
        const req = text.replace(/^(?:hey\s+)?(?:d[aeiy]\s?v[iey]{1,2}n+(?:a|ah|er|e|o)?|the\s+vina|vina)\b[\s,.:!?]*/i, '');
        this.closeFloor();
        if (req) h.onUtterance(req);
        else h.onWake();
        try {
          this.rec?.stop();
        } catch {
          /* already stopped */
        }
        continue;
      }
      const wake = WAKE.exec(text);
      if (wake) {
        const after = text.slice(wake.index + wake[0].length).replace(/^[\s,.:!?]+/, '');
        h.onWake();
        this.openFloor();
        if (after.split(/\s+/).filter(Boolean).length >= 1) {
          this.closeFloor();
          h.onUtterance(after);
        }
      } else if (this.floorOpen) {
        this.closeFloor();
        h.onUtterance(text);
      }
    }
    useAI.getState().setHearing(this.floorOpen || this.once || WAKE.test(interim) ? interim : '');
  }

  /**
   * Interrupt rules (Settings → Voice):
   *   name — only "Divina", "stop", "wait", "hold on"… at the start (default)
   *   any  — any speech that isn't her own words coming back
   *   off  — never by voice (Space still interrupts)
   */
  private isBargeIn(heard: string, spoken: string): boolean {
    const mode = usePrefs.getState().interrupt;
    if (mode === 'off') return false;
    const echo = this.isEcho(heard.replace(WAKE, ''), spoken);
    if (mode === 'name') return STOP_WORDS.test(heard) && !this.isEchoOfName(heard, spoken);
    return heard.split(/\s+/).length >= 3 && !echo;
  }

  /** She said her own name in a sentence; we heard that sentence back. */
  private isEchoOfName(heard: string, spoken: string) {
    const rest = heard.replace(STOP_WORDS, '').trim();
    return rest.split(/\s+/).filter(Boolean).length >= 2 && this.isEcho(rest, spoken);
  }

  /** Is what we heard just our own voice coming back through the speakers? */
  private isEcho(heard: string, spoken: string) {
    const a = heard.toLowerCase().split(/\W+/).filter(Boolean);
    const b = new Set(spoken.toLowerCase().split(/\W+/).filter(Boolean));
    if (!a.length) return true;
    return a.filter((w) => b.has(w)).length / a.length > 0.6;
  }
}

export const listener = new Listener();
