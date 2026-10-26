/**
 * Gemini, shared by the server (Windows/Mac app) and the browser edition.
 * Everything that differs — where settings and the key come from — is the
 * `setting` function passed in; the requests themselves are identical.
 */
import { MODULE_IDS } from '@/modules/ids';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
}
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export type GeminiSettingKey = 'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'GEMINI_TTS_MODEL' | 'GEMINI_VOICE' | 'DIVINA_THINKING';

export function makeGemini(setting: (key: GeminiSettingKey) => string | undefined) {
  const geminiConfigured = (): boolean => !!setting('GEMINI_API_KEY');
  const DEFAULT_MODEL = 'gemini-3.8-flash';
  const DEFAULT_TTS = 'gemini-3.8-flash-tts';
  /**
   * When Google reports a configured model retired, the live replacement is
   * remembered — but only for that configured name, so picking a different
   * model in Settings always takes effect.
   */
  const resolved: { text?: { from: string; to: string }; tts?: { from: string; to: string } } = {};
  const configured = (kind: 'text' | 'tts') => (kind === 'text' ? (setting('GEMINI_MODEL') ?? DEFAULT_MODEL) : (setting('GEMINI_TTS_MODEL') ?? DEFAULT_TTS));
  const effective = (kind: 'text' | 'tts') => {
    const c = configured(kind);
    const r = resolved[kind];
    return r && r.from === c ? r.to : c;
  };
  const GEMINI_MODEL = () => effective('text');
  const GEMINI_TTS_MODEL = () => effective('tts');

  /**
   * Reply speed. Thinking models reason before answering; "fast" keeps that
   * short. Gemini 3 takes a level, 2.5 a token budget; other models get none.
   */
  function thinkingFor(model: string): Record<string, unknown> | undefined {
    const fast = (setting('DIVINA_THINKING') ?? 'fast') !== 'deep';
    if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: fast ? 'low' : 'high' };
    if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: fast ? 0 : -1 };
    return undefined;
  }

  /**
   * Model names are retired often. On a 404, ask Google which models this key
   * can use and pick the newest Flash (or Flash TTS) one, then retry once.
   */
  async function discover(kind: 'text' | 'tts'): Promise<string | null> {
    try {
      const res = await fetch(`${API}?pageSize=200`, { headers: { 'x-goog-api-key': setting('GEMINI_API_KEY') ?? '' } });
      if (!res.ok) return null;
      const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const ver = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
      const names = (j.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((n) => /flash/.test(n) && !/lite|image|live|embedding|thinking-exp/.test(n))
        .filter((n) => (kind === 'tts' ? /tts/.test(n) : !/tts|audio/.test(n)))
        .sort((a, b) => ver(b) - ver(a) || Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b)));
      const pick = names[0] ?? null;
      if (pick) resolved[kind] = { from: configured(kind), to: pick };
      return pick;
    } catch {
      return null;
    }
  }

  /** Older, usually less busy models to try when the chosen one is overloaded. */
  const BUSY_FALLBACK: Record<'text' | 'tts', string[]> = {
    text: ['gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    tts: ['gemini-3.8-flash-lite-tts'],
  };

  async function withModel(kind: 'text' | 'tts', call: (model: string) => Promise<Response>): Promise<Response> {
    const first = kind === 'text' ? GEMINI_MODEL() : GEMINI_TTS_MODEL();
    let res = await call(first);
    if (res.status === 404) {
      const next = await discover(kind);
      return next ? call(next) : res;
    }
    // Overloaded (503) or rate-limited (429): one short retry, then step down.
    if (res.status === 503 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 700));
      res = await call(first);
      for (const m of BUSY_FALLBACK[kind]) {
        if (res.status !== 503 && res.status !== 429) break;
        if (m === first) continue;
        res = await call(m);
      }
    }
    return res;
  }
  const GEMINI_VOICE = () => setting('GEMINI_VOICE') ?? 'Charon';

  function headers() {
    return { 'content-type': 'application/json', 'x-goog-api-key': setting('GEMINI_API_KEY') ?? '' };
  }

  async function geminiText(prompt: string): Promise<string> {
    const res = await withModel('text', (model) =>
      fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } }),
      }),
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
    return (j.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !(p as { thought?: boolean }).thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim();
  }

  /**
   * Stream a reply. The generation config gets the reply-speed setting for
   * whichever model ends up serving; if a model rejects that option (400),
   * the request is repeated once without it.
   */
  function geminiStream(body: { generationConfig?: Record<string, unknown> } & Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    return withModel('text', async (model) => {
      const send = (withThinking: boolean) => {
        const thinkingConfig = withThinking ? thinkingFor(model) : undefined;
        const b = { ...body, generationConfig: { ...body.generationConfig, ...(thinkingConfig ? { thinkingConfig } : {}) } };
        return fetch(`${API}/${model}:streamGenerateContent?alt=sse`, { method: 'POST', headers: headers(), body: JSON.stringify(b), signal });
      };
      const res = await send(true);
      if (res.status === 400 && thinkingFor(model)) {
        const text = await res.clone().text();
        if (/thinking/i.test(text)) return send(false);
      }
      return res;
    });
  }

  async function geminiSpeech(text: string): Promise<{ pcm: Uint8Array; sampleRate: number }> {
    const res = await withModel('tts', (model) =>
      fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE() } } },
          },
        }),
      }),
    );
    if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) throw new Error('Gemini TTS returned no audio');
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
    return { pcm: Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0)), sampleRate: rate };
  }

  return { geminiConfigured, GEMINI_MODEL, GEMINI_TTS_MODEL, GEMINI_VOICE, thinkingFor, geminiText, geminiStream, geminiSpeech };
}

/** The tools DIVINA exposes to the model. Executed client-side. */
export const TOOL_DECLARATIONS = [
  {
    name: 'open_module',
    description: 'Open (or, in human form, present) one of the interface modules.',
    parameters: {
      type: 'OBJECT',
      properties: { module: { type: 'STRING', enum: [...MODULE_IDS] } },
      required: ['module'],
    },
  },
  {
    name: 'rotate_carousel',
    description: 'Rotate the ring of cards. Positive steps rotate right.',
    parameters: { type: 'OBJECT', properties: { steps: { type: 'INTEGER' } }, required: ['steps'] },
  },
  {
    name: 'set_environment',
    description: 'Switch the room environment.',
    parameters: {
      type: 'OBJECT',
      properties: { world: { type: 'STRING', enum: ['studio', 'lab', 'observatory', 'industrial', 'water', 'fog'] } },
      required: ['world'],
    },
  },
  {
    name: 'transform_form',
    description: 'Transform the interface into a human figure ("human") or back into the spatial ring ("spatial").',
    parameters: { type: 'OBJECT', properties: { to: { type: 'STRING', enum: ['human', 'spatial'] } }, required: ['to'] },
  },
  {
    name: 'memory',
    description: 'Long-term memory about the user. add something the user explicitly asks you to remember (a fact about them, a preference); forget something they ask you to forget. Never add things from CONTEXT on your own.',
    parameters: {
      type: 'OBJECT',
      properties: { action: { type: 'STRING', enum: ['add', 'forget'] }, text: { type: 'STRING' } },
      required: ['action', 'text'],
    },
  },
  {
    name: 'notes',
    description: "The user's own notes and to-do list (the Notes card). add a note, tick one off as done, or remove one. text is the note, or words from it.",
    parameters: {
      type: 'OBJECT',
      properties: { action: { type: 'STRING', enum: ['add', 'done', 'remove'] }, text: { type: 'STRING' } },
      required: ['action', 'text'],
    },
  },
  {
    name: 'desktop_action',
    description:
      'Control the computer (macOS or Windows) Divina is served from. verb is one of launch_app{name}, open_url{url}, media{action: play|pause|playpause|next|previous}, play_search{service: spotify|apple_music|youtube_music|youtube|soundcloud|deezer|tidal|amazon_music, query} (opens that service searching for a song, artist, album or playlist), volume{level|delta|mute}, screenshot, clipboard_read, clipboard_write{text}, hide_others, quit_app{name}, lock_screen, sleep_display, dnd{on}, create_note{title, body}, create_reminder{title, inMinutes}. Never invent other verbs.',
    parameters: {
      type: 'OBJECT',
      properties: {
        verb: { type: 'STRING' },
        args: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            url: { type: 'STRING' },
            action: { type: 'STRING' },
            level: { type: 'INTEGER' },
            delta: { type: 'INTEGER' },
            mute: { type: 'BOOLEAN' },
            text: { type: 'STRING' },
            on: { type: 'BOOLEAN' },
            title: { type: 'STRING' },
            body: { type: 'STRING' },
            inMinutes: { type: 'INTEGER' },
          },
        },
      },
      required: ['verb'],
    },
  },
];
