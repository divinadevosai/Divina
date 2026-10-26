/**
 * Speech recognition in the iPhone app. Apps can't use the browser's
 * recogniser, so this wraps iOS's own (through the Capacitor speech plugin)
 * in the same shape listen.ts already speaks: one request per tap, words as
 * they're heard, the last of them final when the person stops talking.
 */

interface Result {
  isFinal: boolean;
  0: { transcript: string };
}

type Plugin = (typeof import('@capgo/capacitor-speech-recognition'))['SpeechRecognition'];

let plugin: Promise<Plugin> | null = null;
const load = () => (plugin ??= import('@capgo/capacitor-speech-recognition').then((m) => m.SpeechRecognition));

export class NativeRecognition {
  continuous = false;
  interimResults = true;
  lang = 'en-US';
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onspeechstart: (() => void) | null = null;
  private heard = '';
  private running = false;

  start() {
    this.running = true;
    this.heard = '';
    void this.run();
  }

  private async run() {
    try {
      const sr = await load();
      const perm = await sr.requestPermissions();
      if (perm.speechRecognition !== 'granted') return this.fail('not-allowed');
      await sr.removeAllListeners();
      await sr.addListener('partialResults', ({ matches }) => {
        const text = matches?.[0]?.trim();
        if (!text || !this.running) return;
        this.heard = text;
        this.emit(text, false);
      });
      await sr.addListener('listeningState', ({ status, state }) => {
        if (status === 'stopped' || state === 'stopped') this.finish();
      });
      await sr.addListener('error', () => this.finish());
      await sr.start({ language: this.lang, partialResults: true, popup: false, maxResults: 1 });
    } catch {
      this.fail('service-not-allowed');
    }
  }

  private emit(text: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  }

  /** The person stopped talking: what they said last is the request. */
  private finish() {
    if (!this.running) return;
    this.running = false;
    if (this.heard) this.emit(this.heard, true);
    this.onend?.();
  }

  private fail(error: string) {
    this.running = false;
    this.onerror?.({ error });
    this.onend?.();
  }

  stop() {
    void load().then((sr) => sr.stop()).catch(() => this.finish());
  }

  abort() {
    this.heard = '';
    this.stop();
  }
}
