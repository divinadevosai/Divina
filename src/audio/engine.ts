/**
 * Audio. No voice samples, no music: a very quiet synth pad, air, and small
 * synthesised UI sounds. The voice has its own bus with an HRTF panner and
 * an analyser; UI and pad duck under it so the room "listens" while DIVINA
 * speaks.
 */
import { live } from '@/render/live';

type Sfx = 'hover' | 'tick' | 'select' | 'open' | 'close' | 'swipe' | 'grab' | 'drop' | 'confirm' | 'error' | 'wake' | 'freeze' | 'transform' | 'world';

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private uiBus!: GainNode;
  private padBus!: GainNode;
  voiceBus!: GainNode;
  voicePanner!: PannerNode;
  voiceAnalyser!: AnalyserNode;
  private analyserBuf = new Float32Array(1024);
  private padOn = false;
  private padNodes: AudioNode[] = [];
  private lastHover = 0;
  enabled = true;
  ambient = false;

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.uiBus = ctx.createGain();
    this.uiBus.gain.value = 0.5;
    this.uiBus.connect(this.master);
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0;
    this.padBus.connect(this.master);

    this.voiceBus = ctx.createGain();
    this.voicePanner = ctx.createPanner();
    this.voicePanner.panningModel = 'HRTF';
    this.voicePanner.distanceModel = 'inverse';
    this.voicePanner.refDistance = 1.2;
    this.voicePanner.maxDistance = 10;
    this.voicePanner.rolloffFactor = 0.8;
    this.setVoicePosition(0, 0, -1);
    this.voiceAnalyser = ctx.createAnalyser();
    this.voiceAnalyser.fftSize = 1024;
    this.voiceBus.connect(this.voiceAnalyser);
    this.voiceBus.connect(this.voicePanner).connect(this.master);
    this.setAmbient(true);
  }

  /**
   * Voice position relative to the listener. Distance is CAPPED: the panner
   * attenuates with distance, and a head four metres away would put the
   * voice at half level. Direction carries; distance does not.
   */
  setVoicePosition(x: number, y: number, z: number) {
    if (!this.ctx) return;
    const len = Math.hypot(x, y, z) || 1;
    const d = Math.min(len, 1.2);
    const t = this.ctx.currentTime;
    this.voicePanner.positionX.setTargetAtTime((x / len) * d, t, 0.2);
    this.voicePanner.positionY.setTargetAtTime((y / len) * d, t, 0.2);
    this.voicePanner.positionZ.setTargetAtTime((z / len) * d, t, 0.2);
  }

  /** Studio-voice level from the analyser, 0..1 (RMS mapped). */
  analyserLevel(): number {
    if (!this.ctx) return 0;
    this.voiceAnalyser.getFloatTimeDomainData(this.analyserBuf);
    let s = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) s += this.analyserBuf[i] * this.analyserBuf[i];
    const rms = Math.sqrt(s / this.analyserBuf.length);
    return Math.min(1, rms * 5.5);
  }

  /** Called every frame: ducking follows the voice. */
  update() {
    if (!this.ctx) return;
    const duck = 1 - 0.6 * Math.min(1, live.voiceLevel * 1.4);
    const t = this.ctx.currentTime;
    this.uiBus.gain.setTargetAtTime(0.5 * duck, t, 0.08);
    this.padBus.gain.setTargetAtTime(this.padOn ? 0.05 * duck : 0, t, 0.6);
  }

  setAmbient(on: boolean) {
    this.ambient = on;
    if (!this.ctx) return;
    this.padOn = on;
    if (on && !this.padNodes.length) this.buildPad();
  }

  private buildPad() {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    // Open fifth + ninth, low and soft: A1, E2, B2, C#3
    for (const [f, type, g] of [
      [55, 'sine', 0.5],
      [82.41, 'triangle', 0.22],
      [123.47, 'sine', 0.18],
      [138.59, 'sine', 0.1],
    ] as const) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = g * 0.5;
        o.connect(og).connect(lp);
        o.start();
        this.padNodes.push(o, og);
      }
    }
    // Air: filtered noise
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.98 * b + 0.02 * (Math.random() * 2 - 1);
      data[i] = b * 3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.08;
    noise.connect(bp).connect(ng).connect(this.padBus);
    noise.start();
    lp.connect(this.padBus);
    this.padNodes.push(lp, lfo, lfoGain, noise, bp, ng);
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; glide?: number; delay?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(opts.glide, t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.uiBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private whoosh(dur: number, from: number, to: number, gain = 0.25) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.uiBus);
    src.start(t);
  }

  play(s: Sfx) {
    if (!this.ctx || !this.enabled) return;
    switch (s) {
      case 'hover': {
        const now = performance.now();
        if (now - this.lastHover < 90) return;
        this.lastHover = now;
        return this.tone(1760, 0.05, { gain: 0.03 });
      }
      case 'tick':
        return this.tone(2400, 0.03, { gain: 0.04 });
      case 'select':
        this.tone(660, 0.25, { gain: 0.1 });
        return this.tone(990, 0.35, { gain: 0.08, delay: 0.06 });
      case 'open':
        this.whoosh(0.5, 400, 2400, 0.08);
        return this.tone(523.25, 0.6, { gain: 0.07, delay: 0.12, type: 'triangle' });
      case 'close':
        this.whoosh(0.4, 2000, 300, 0.06);
        return this.tone(392, 0.3, { gain: 0.05, type: 'triangle' });
      case 'swipe':
        return this.whoosh(0.32, 700, 2600, 0.12);
      case 'grab':
        return this.tone(330, 0.12, { gain: 0.1, glide: 440 });
      case 'drop':
        return this.tone(440, 0.22, { gain: 0.08, glide: 247 });
      case 'confirm':
        this.tone(784, 0.18, { gain: 0.07 });
        return this.tone(1175, 0.28, { gain: 0.06, delay: 0.07 });
      case 'error':
        return this.tone(196, 0.3, { gain: 0.1, type: 'triangle', glide: 147 });
      case 'freeze':
        return this.tone(1318, 0.5, { gain: 0.04, type: 'sine' });
      case 'wake':
        this.whoosh(1.1, 200, 5000, 0.07);
        this.tone(261.6, 1.2, { gain: 0.06, attack: 0.2 });
        this.tone(392, 1.2, { gain: 0.05, attack: 0.3, delay: 0.1 });
        return this.tone(587.3, 1.4, { gain: 0.04, attack: 0.4, delay: 0.22 });
      case 'transform':
        this.whoosh(2.4, 120, 1800, 0.08);
        return this.tone(55, 3.2, { gain: 0.14, attack: 1.2, type: 'sine' });
      case 'world':
        return this.whoosh(0.9, 3000, 250, 0.08);
    }
  }
}

export const audio = new AudioEngine();
export type { Sfx };
