/**
 * Claude (Anthropic), shared by the app's server and the browser edition.
 * The person's own Anthropic API key; requests go straight to Anthropic.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaContentBlockParam, BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { cleanHistory, lastUserTurn, systemPrompt, type ChatBody, type Send } from './chat';
import { JSON_TOOLS, checkedCall, parseArgs } from './tools';

export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'] as const;
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

export type ClaudeSettingKey = 'ANTHROPIC_API_KEY' | 'ANTHROPIC_MODEL' | 'DIVINA_THINKING';

const TOOLS = JSON_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.schema as Anthropic.Beta.BetaTool.InputSchema,
  eager_input_streaming: true,
}));

/** The conversation as Claude's messages: each recorded call answered in the next user message. */
export function claudeMessages(body: ChatBody): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  let pending: BetaToolResultBlockParam[] = [];
  const turns = cleanHistory(body);
  const last = lastUserTurn(turns);
  turns.forEach((t, i) => {
    if (t.role === 'model') {
      const content: BetaContentBlockParam[] = [];
      if (t.text) content.push({ type: 'text', text: t.text });
      (t.calls ?? []).forEach((c, j) => {
        const id = `divina_${i}_${j}`;
        content.push({ type: 'tool_use', id, name: c.name, input: c.args });
        pending.push({ type: 'tool_result', tool_use_id: id, content: 'done' });
      });
      out.push({ role: 'assistant', content });
    } else {
      const picture: BetaContentBlockParam[] = i === last && body.image ? [{ type: 'image', source: { type: 'base64', media_type: body.image.mime, data: body.image.data } }] : [];
      out.push({ role: 'user', content: [...pending, ...picture, ...(t.text ? [{ type: 'text' as const, text: t.text }] : [])] });
      pending = [];
    }
  });
  if (pending.length) out.push({ role: 'user', content: pending });
  return out;
}

export function makeClaude(setting: (key: ClaudeSettingKey) => string | undefined, opts: { browser?: boolean; fetcher?: typeof fetch } = {}) {
  const configured = () => !!setting('ANTHROPIC_API_KEY');
  const model = () => setting('ANTHROPIC_MODEL') ?? DEFAULT_CLAUDE_MODEL;

  let client: { key: string; c: Anthropic } | null = null;
  const anthropic = () => {
    const key = setting('ANTHROPIC_API_KEY') ?? '';
    if (client?.key !== key) {
      // In the browser edition the page is the only "server": the key is the
      // visitor's own and goes only to Anthropic, never to Divina.
      client = { key, c: new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000, dangerouslyAllowBrowser: !!opts.browser, ...(opts.fetcher ? { fetch: opts.fetcher } : {}) }) };
    }
    return client.c;
  };

  /** Reply speed → effort. Haiku takes no effort setting. */
  const effort = (m: string): 'low' | 'high' | undefined => (/haiku/.test(m) ? undefined : setting('DIVINA_THINKING') === 'deep' ? 'high' : 'low');
  /**
   * If Claude's safety checks decline a request, Anthropic re-runs it on
   * another Claude model instead of refusing.
   */
  const fallbacks = (m: string) => (/^claude-(opus|sonnet)-5-5/.test(m) ? { fallbacks: 'default' as const, betas: ['server-side-fallback-2026-07-01'] } : {});

  function request(m: string, system: string, messages: BetaMessageParam[], maxTokens: number, tools: boolean) {
    const e = effort(m);
    return {
      model: m,
      max_tokens: maxTokens,
      system,
      messages,
      ...(tools ? { tools: TOOLS } : {}),
      ...(e ? { output_config: { effort: e } } : {}),
      ...fallbacks(m),
    };
  }

  const explain = (err: unknown): string => {
    if (err instanceof Anthropic.AuthenticationError) return 'Anthropic didn’t accept that API key. Check it in Settings → AI.';
    if (err instanceof Anthropic.PermissionDeniedError) return 'Your Anthropic key isn’t allowed to use that model.';
    if (err instanceof Anthropic.RateLimitError) return 'Anthropic says you’re sending too much right now. Wait a moment.';
    if (err instanceof Anthropic.NotFoundError) return `Anthropic doesn’t know the model “${model()}”. Pick another in Settings → AI.`;
    if (err instanceof Anthropic.APIConnectionError) return 'I couldn’t reach Anthropic. Check your internet connection.';
    if (err instanceof Anthropic.APIError) return `Claude HTTP ${err.status ?? ''}: ${err.message.slice(0, 200)}`;
    return err instanceof Error ? err.message : String(err);
  };

  /** One turn, streamed as Divina's events. */
  async function chat(body: ChatBody, edition: 'app' | 'browser', signal: AbortSignal, send: Send) {
    const m = model();
    try {
      const stream = anthropic().beta.messages.stream(request(m, systemPrompt(body, edition), claudeMessages(body), 4096, true), { signal });
      const tools = new Map<number, { name: string; json: string }>();
      const calls: { name: string; args: Record<string, unknown> }[] = [];
      let stop: string | null = null;
      for await (const ev of stream) {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use') tools.set(ev.index, { name: ev.content_block.name, json: '' });
        else if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'text_delta') send('token', { text: ev.delta.text });
          else if (ev.delta.type === 'input_json_delta') {
            const t = tools.get(ev.index);
            if (t) t.json += ev.delta.partial_json;
          }
        } else if (ev.type === 'content_block_stop') {
          const t = tools.get(ev.index);
          if (t) {
            const call = checkedCall(t.name, parseArgs(t.json));
            if (call) calls.push(call);
            tools.delete(ev.index);
          }
        } else if (ev.type === 'message_delta') stop = ev.delta.stop_reason ?? stop;
      }
      // A reply cut short or declined doesn't get to act.
      if (stop === 'refusal') return send('error', { message: 'Claude declined to answer that.' });
      if (stop === 'max_tokens') return send('finish', { reason: 'MAX_TOKENS' });
      for (const c of calls) send('call', c);
    } catch (err) {
      if (signal.aborted) throw err;
      send('error', { message: explain(err) });
    }
  }

  /** A short, tool-free answer (the news digest). */
  async function text(prompt: string): Promise<string> {
    const m = model();
    try {
      const msg = await anthropic().beta.messages.create(request(m, 'Answer plainly, in spoken sentences.', [{ role: 'user', content: prompt }], 2048, false));
      if (msg.stop_reason === 'refusal') return '';
      return msg.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
    } catch (err) {
      throw new Error(explain(err));
    }
  }

  return { configured, model, chat, text };
}
