/**
 * OpenAI (the models behind ChatGPT) and OpenAI's voices, shared by the app's
 * server and the browser edition. The person's own OpenAI API key; requests
 * go straight to OpenAI and are asked not to be stored there (store: false).
 */
import { cleanHistory, lastUserTurn, systemPrompt, type ChatBody, type Send } from './chat';
import { JSON_TOOLS, checkedCall, parseArgs } from './tools';

const API = 'https://api.openai.com/v1';

export const OPENAI_MODELS = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] as const;
export const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol';
export const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
export const DEFAULT_OPENAI_VOICE = 'marin';

export type OpenAISettingKey = 'OPENAI_API_KEY' | 'OPENAI_MODEL' | 'OPENAI_TTS_VOICE' | 'DIVINA_THINKING';

const TOOLS = JSON_TOOLS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.schema }));

type InputItem =
  | { role: 'user' | 'assistant'; content: string | ({ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string })[] }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

/** The conversation as Responses API input: each recorded call followed by its result. */
export function openaiInput(body: ChatBody): InputItem[] {
  const out: InputItem[] = [];
  const turns = cleanHistory(body);
  const last = lastUserTurn(turns);
  turns.forEach((t, i) => {
    if (i === last && body.image) out.push({ role: 'user', content: [{ type: 'input_image', image_url: `data:${body.image.mime};base64,${body.image.data}` }, { type: 'input_text', text: t.text || 'What’s on my screen?' }] });
    else if (t.text) out.push({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text });
    (t.calls ?? []).forEach((c, j) => {
      const call_id = `divina_${i}_${j}`;
      out.push({ type: 'function_call', call_id, name: c.name, arguments: JSON.stringify(c.args) });
      out.push({ type: 'function_call_output', call_id, output: '{"ok":true}' });
    });
  });
  return out;
}

export function makeOpenAI(setting: (key: OpenAISettingKey) => string | undefined, fetcher: typeof fetch = (...a) => fetch(...a)) {
  const configured = () => !!setting('OPENAI_API_KEY');
  const model = () => setting('OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL;
  const voice = () => setting('OPENAI_TTS_VOICE') ?? DEFAULT_OPENAI_VOICE;
  const headers = () => ({ 'content-type': 'application/json', authorization: `Bearer ${setting('OPENAI_API_KEY') ?? ''}` });
  const effort = () => (setting('DIVINA_THINKING') === 'deep' ? 'high' : 'low');

  const explain = async (res: Response): Promise<string> => {
    if (res.status === 401) return 'OpenAI didn’t accept that API key. Check it in Settings → AI.';
    if (res.status === 429) return 'OpenAI says you’re over your limit or out of credit right now.';
    if (res.status === 404) return `OpenAI doesn’t know the model “${model()}”, or your key can’t use it.`;
    const text = await res.text().catch(() => '');
    const msg = /"message"\s*:\s*"([^"]{1,200})/.exec(text)?.[1];
    return `OpenAI HTTP ${res.status}${msg ? `: ${msg}` : ''}`;
  };

  /**
   * Send a request; if the model rejects the reasoning setting (some don't
   * take one), repeat it once without.
   */
  async function respond(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const send = (b: Record<string, unknown>) => fetcher(`${API}/responses`, { method: 'POST', headers: headers(), body: JSON.stringify(b), signal });
    const res = await send({ ...body, reasoning: { effort: effort() } });
    if (res.status === 400) {
      const text = await res.clone().text();
      if (/reasoning/i.test(text)) return send(body);
    }
    return res;
  }

  async function chat(body: ChatBody, edition: 'app' | 'browser', signal: AbortSignal, send: Send) {
    let res: Response;
    try {
      res = await respond(
        { model: model(), instructions: systemPrompt(body, edition), input: openaiInput(body), tools: TOOLS, stream: true, store: false, max_output_tokens: 4096 },
        signal,
      );
    } catch (err) {
      if (signal.aborted) throw err;
      return send('error', { message: 'I couldn’t reach OpenAI. Check your internet connection.' });
    }
    if (!res.ok || !res.body) return send('error', { message: await explain(res) });

    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let ending: 'ok' | 'cut' | 'failed' = 'ok';
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = chunk
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!data || data === '[DONE]') continue;
        let ev: { type?: string; delta?: string; item?: { type?: string; name?: string; arguments?: string }; response?: { status?: string }; message?: string };
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.type === 'response.output_text.delta' && ev.delta) send('token', { text: ev.delta });
        else if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call' && ev.item.name) {
          const call = checkedCall(ev.item.name, parseArgs(ev.item.arguments ?? ''));
          if (call) calls.push(call);
        } else if (ev.type === 'response.incomplete') ending = 'cut';
        else if (ev.type === 'response.failed' || ev.type === 'error') {
          ending = 'failed';
          send('error', { message: `OpenAI couldn’t finish that reply${ev.message ? `: ${ev.message.slice(0, 160)}` : '.'}` });
        }
      }
    }
    // A reply cut short or failed doesn't get to act.
    if (ending === 'cut') return send('finish', { reason: 'MAX_TOKENS' });
    if (ending === 'ok') for (const c of calls) send('call', c);
  }

  async function text(prompt: string): Promise<string> {
    const res = await respond({ model: model(), input: prompt, store: false, max_output_tokens: 2048 });
    if (!res.ok) throw new Error(await explain(res));
    const j = (await res.json()) as { output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
    return (j.output ?? [])
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .map((c) => (c.type === 'output_text' ? (c.text ?? '') : ''))
      .join('')
      .trim();
  }

  /** OpenAI's voice: raw 16-bit PCM at 24 kHz. */
  async function speech(input: string): Promise<{ pcm: Uint8Array; sampleRate: number }> {
    const res = await fetcher(`${API}/audio/speech`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice: voice(), input, response_format: 'pcm', instructions: 'Speak warmly and naturally, like a calm, capable assistant.' }),
    });
    if (!res.ok) throw new Error(await explain(res));
    return { pcm: new Uint8Array(await res.arrayBuffer()), sampleRate: 24000 };
  }

  return { configured, model, voice, chat, text, speech };
}
