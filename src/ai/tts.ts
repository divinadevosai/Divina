/**
 * Voice output.
 *
 * Studio voice: Gemini, OpenAI or ElevenLabs text-to-speech, played THROUGH the page's audio graph, so the
 * analyser hears it and gives a level.
 *
 * Local voice: speechSynthesis plays outside the graph — the page hears
 * nothing. So the level is INFERRED: every word boundary becomes a pulse
 * that opens and closes once per syllable; voices that report no boundaries
 * get a generic cadence. The result lands in the same range the analyser
 * produces, so everything downstream reads the two identically.
 */
import { activeAgent } from '@/lib/client/personal';
import { audio } from '@/audio/engine';
import { live } from '@/render/live';

export type VoiceKind = 'studio' | 'local';

interface Pulse {
  t0: number;
  dur: number;
  peak: number;
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return /\d/.test(word) ? Math.max(1, word.length) : 0;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

interface Line {
  text: string;
  /** BCP-47: the language this line is in (translations), else the person's language */
  lang?: string;
  /** studio audio, requested the moment the sentence is queued */
  pcm?: Promise<{ rate: number; bytes: Int16Array } | null>;
}

class Voice {
  private queue: Line[] = [];
  private playing = false;
  private source: AudioBufferSourceNode | null = null;
  private pulses: Pulse[] = [];
  private cadence: { start: number; until: number } | null = null;
  private gotBoundary = false;
  private generation = 0;
  private raf = 0;
  onStart: () => void = () => {};
  onIdle: () => void = () => {};
  studio = false;
  rate = 1.02;
  /** the person's language (Settings → Language), for the browser voice */
  lang = '';

  get speaking() {
    return this.playing || this.queue.length > 0;
  }

  /** Queue a sentence. Speech begins as soon as the first one is ready. */
  say(text: string, lang?: string) {
    const t = text.trim();
    if (!t) return;
    // Ask for the audio NOW, so it is ready by the time the previous
    // sentence finishes — no gap between sentences.
    this.queue.push({ text: t, lang, pcm: this.studio && audio.ctx ? this.fetchPcm(t) : undefined });
    if (!this.playing) void this.next();
    this.ensureLoop();
  }

  /** Stop immediately (interruption). */
  stop() {
    this.generation++;
    this.queue = [];
    this.pulses = [];
    this.cadence = null;
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (this.playing) {
      this.playing = false;
      this.onIdle();
    }
    live.voiceLevel = 0;
  }

  private async next() {
    const line = this.queue.shift();
    if (!line) {
      this.playing = false;
      this.onIdle();
      return;
    }
    const gen = this.generation;
    if (!this.playing) {
      this.playing = true;
      this.onStart();
    }
    const ok = this.studio && audio.ctx ? await this.playStudio(line, gen) : false;
    if (gen !== this.generation) return;
    if (!ok) await this.playLocal(line.text, gen, line.lang);
    if (gen !== this.generation) return;
    void this.next();
  }

  private async fetchPcm(text: string): Promise<{ rate: number; bytes: Int16Array } | null> {
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, agent: activeAgent()?.id }) });
      if (!res.ok) {
        if (res.status === 503) this.studio = false;
        return null;
      }
      const rate = Number(res.headers.get('x-sample-rate') ?? 24000);
      const buf = await res.arrayBuffer();
      return { rate, bytes: new Int16Array(buf, 0, Math.floor(buf.byteLength / 2)) };
    } catch {
      return null;
    }
  }

  private async playStudio(line: Line, gen: number): Promise<boolean> {
    try {
      const got = await (line.pcm ?? this.fetchPcm(line.text));
      if (!got) return false;
      const { rate, bytes } = got;
      if (gen !== this.generation || !audio.ctx) return true;
      const buf = audio.ctx.createBuffer(1, bytes.length, rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < bytes.length; i++) ch[i] = bytes[i] / 32768;
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(audio.voiceBus);
      this.source = src;
      await new Promise<void>((resolve) => {
        src.onended = () => resolve();
        src.start();
      });
      this.source = null;
      return true;
    } catch {
      return false;
    }
  }

  private playLocal(text: string, gen: number, lineLang?: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.rate;
      u.pitch = 0.92;
      const voices = speechSynthesis.getVoices();
      const tag = lineLang || this.lang || navigator.language || 'en-GB';
      const base = tag.slice(0, 2).toLowerCase();
      u.lang = tag;
      // English has favourite voices; any other language takes the best voice that speaks it
      const pick =
        (base === 'en' ? voices.find((v) => /Samantha|Daniel|Serena|Google UK English Male|Microsoft (Guy|Ryan|Aria) Online/i.test(v.name)) : undefined) ??
        voices.find((v) => v.lang?.toLowerCase() === tag.toLowerCase()) ??
        voices.find((v) => v.lang?.toLowerCase().startsWith(base) && /Online|Natural|Google/i.test(v.name)) ??
        voices.find((v) => v.lang?.toLowerCase().startsWith(base)) ??
        (base === 'en' ? voices[0] : undefined);
      if (pick) u.voice = pick;
      this.gotBoundary = false;
      const words = text.split(/\s+/);
      let wi = 0;
      u.onstart = () => {
        // generic cadence until (unless) the voice reports boundaries
        this.cadence = { start: performance.now(), until: performance.now() + (text.length / 14) * 1000 / this.rate };
      };
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        this.gotBoundary = true;
        this.cadence = null;
        const word = e.charLength ? text.substr(e.charIndex, e.charLength) : words[wi] ?? '';
        wi++;
        const n = syllables(word);
        const perSyl = (0.19 / this.rate) * 1000;
        const now = performance.now();
        for (let i = 0; i < n; i++) this.pulses.push({ t0: now + i * perSyl, dur: perSyl * 0.9, peak: 0.55 + Math.random() * 0.25 });
      };
      const done = () => {
        this.cadence = null;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      if (gen !== this.generation) return resolve();
      speechSynthesis.speak(u);
    });
  }

  /**
   * Verification only: drive the local-voice inference exactly as word
   * boundaries would, without a synthesiser (headless browsers have none).
   */
  simulateLocal(text: string, wordsPerSecond = 2.6) {
    const words = text.split(/\s+/);
    this.playing = true;
    this.onStart();
    this.gotBoundary = true;
    this.ensureLoop();
    const perSyl = (0.19 / this.rate) * 1000;
    words.forEach((w, i) => {
      window.setTimeout(() => {
        const now = performance.now();
        for (let k = 0; k < syllables(w); k++) this.pulses.push({ t0: now + k * perSyl, dur: perSyl * 0.9, peak: 0.55 + Math.random() * 0.25 });
      }, (i / wordsPerSecond) * 1000);
    });
    window.setTimeout(() => {
      this.playing = false;
      this.onIdle();
    }, (words.length / wordsPerSecond) * 1000 + 600);
  }

  /** Voice level, same 0..1 range for both voices. */
  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.playing) {
      live.voiceLevel = 0;
      return;
    }
    if (this.source) {
      live.voiceLevel = audio.analyserLevel();
      return;
    }
    const now = performance.now();
    let lvl = 0;
    this.pulses = this.pulses.filter((p) => now < p.t0 + p.dur);
    for (const p of this.pulses) {
      const x = (now - p.t0) / p.dur;
      if (x >= 0 && x <= 1) lvl = Math.max(lvl, p.peak * Math.sin(Math.PI * x));
    }
    if (!this.gotBoundary && this.cadence && now < this.cadence.until) {
      const syl = ((now - this.cadence.start) / 1000) * 4.6 * this.rate;
      const phase = syl % 1;
      const word = Math.floor(syl / 2.3) % 5 === 4 ? 0.25 : 1; // brief gaps between words
      lvl = Math.max(lvl, 0.62 * word * Math.sin(Math.PI * phase));
    }
    live.voiceLevel = lvl;
  };

  private ensureLoop() {
    if (!this.raf && typeof window !== 'undefined') this.raf = requestAnimationFrame(this.tick);
  }
}

export const voice = new Voice();
