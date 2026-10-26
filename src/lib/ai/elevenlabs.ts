/**
 * ElevenLabs voices, shared by the app's server and the browser edition.
 * The person's own ElevenLabs API key; text goes straight to ElevenLabs.
 */
const API = 'https://api.elevenlabs.io/v1';

// "George", one of ElevenLabs' built-in voices, available on every account.
export const DEFAULT_ELEVENLABS_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5';

export type ElevenLabsSettingKey = 'ELEVENLABS_API_KEY' | 'ELEVENLABS_VOICE' | 'ELEVENLABS_MODEL';

export interface Voice {
  id: string;
  name: string;
  detail?: string;
}

export function makeElevenLabs(setting: (key: ElevenLabsSettingKey) => string | undefined, fetcher: typeof fetch = (...a) => fetch(...a)) {
  const configured = () => !!setting('ELEVENLABS_API_KEY');
  const voice = () => setting('ELEVENLABS_VOICE') ?? DEFAULT_ELEVENLABS_VOICE;
  const model = () => setting('ELEVENLABS_MODEL') ?? DEFAULT_ELEVENLABS_MODEL;
  const headers = () => ({ 'content-type': 'application/json', 'xi-api-key': setting('ELEVENLABS_API_KEY') ?? '' });

  const explain = (status: number) =>
    status === 401
      ? 'ElevenLabs didn’t accept that API key. Check it in Settings → Voice.'
      : status === 429
        ? 'ElevenLabs says you’re over your limit right now.'
        : status === 404
          ? 'ElevenLabs couldn’t find that voice. Pick another in Settings → Voice.'
          : `ElevenLabs HTTP ${status}`;

  /** Raw 16-bit PCM at 24 kHz. */
  async function speech(text: string): Promise<{ pcm: Uint8Array; sampleRate: number }> {
    // eleven_v3 takes up to 5,000 characters; Divina never sends more than 1,200
    const res = await fetcher(`${API}/text-to-speech/${encodeURIComponent(voice())}?output_format=pcm_24000`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text, model_id: model() }),
    });
    if (!res.ok) throw new Error(explain(res.status));
    return { pcm: new Uint8Array(await res.arrayBuffer()), sampleRate: 24000 };
  }

  /** The voices this key can use, for the picker in Settings. */
  async function voices(): Promise<Voice[]> {
    const res = await fetcher(`${API}/voices`, { headers: headers() });
    if (!res.ok) throw new Error(explain(res.status));
    const j = (await res.json()) as { voices?: { voice_id?: unknown; name?: unknown; category?: unknown; labels?: Record<string, unknown> }[] };
    return (j.voices ?? [])
      .filter((v) => typeof v.voice_id === 'string' && /^[A-Za-z0-9]{8,40}$/.test(v.voice_id) && typeof v.name === 'string')
      .slice(0, 200)
      .map((v) => {
        const l = v.labels ?? {};
        const detail = [l.accent, l.gender, l.description ?? l.descriptive].filter((x) => typeof x === 'string').join(', ');
        return { id: v.voice_id as string, name: (v.name as string).slice(0, 60), detail: detail.slice(0, 80) || undefined };
      });
  }

  return { configured, voice, model, speech, voices };
}
