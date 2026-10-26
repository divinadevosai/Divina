import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeMessages, makeClaude } from '../src/lib/ai/claude';
import { openaiInput, makeOpenAI } from '../src/lib/ai/openai';
import { makeElevenLabs } from '../src/lib/ai/elevenlabs';
import { makeAI } from '../src/lib/ai/providers';
import { checkedCall, JSON_TOOLS } from '../src/lib/ai/tools';
import { divinaStream, type ChatBody } from '../src/lib/ai/chat';
import { checkSetting } from '../src/lib/settingsSchema';

const body: ChatBody = {
  context: 'weather card open',
  history: [
    { role: 'model', text: 'Hi, I’m Divina.' },
    { role: 'user', text: 'open the weather' },
    { role: 'model', text: 'Opening it.', calls: [{ name: 'open_module', args: { module: 'weather' } }] },
    { role: 'user', text: 'thanks, now rotate' },
  ],
};

const sse = (events: string[]) =>
  new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });

async function collect(run: Parameters<typeof divinaStream>[0]) {
  const text = await new Response(divinaStream(run, new AbortController().signal, (s) => s.split('SECRETKEY').join('…'))).text();
  return [...text.matchAll(/event: (\w+)\ndata: (.*)/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]) }));
}

test('tools become JSON Schema with lowercase types', () => {
  const open = JSON_TOOLS.find((t) => t.name === 'open_module')!;
  assert.equal(open.schema.type, 'object');
  assert.equal(open.schema.properties!.module.type, 'string');
  assert.ok(open.schema.properties!.module.enum!.includes('weather'));
});

test('only well-formed calls to known tools get through', () => {
  assert.deepEqual(checkedCall('open_module', { module: 'weather' }), { name: 'open_module', args: { module: 'weather' } });
  assert.equal(checkedCall('open_module', { module: 'bank' }), null);
  assert.equal(checkedCall('open_module', {}), null, 'missing required field');
  assert.equal(checkedCall('rotate_carousel', { steps: 'lots' }), null);
  assert.equal(checkedCall('format_disk', {}), null);
  assert.equal(checkedCall('open_module', null), null, 'truncated JSON');
});

test('Claude history starts with the person and answers every call', () => {
  const m = claudeMessages(body);
  assert.equal(m[0].role, 'user');
  assert.equal(m.at(-1)!.role, 'user');
  const asst = m.find((x) => x.role === 'assistant' && Array.isArray(x.content) && x.content.some((b) => b.type === 'tool_use'))!;
  const use = (asst.content as { type: string; id?: string }[]).find((b) => b.type === 'tool_use')!;
  const next = m[m.indexOf(asst) + 1];
  assert.equal(next.role, 'user');
  const first = (next.content as { type: string; tool_use_id?: string }[])[0];
  assert.equal(first.type, 'tool_result');
  assert.equal(first.tool_use_id, use.id);
});

test('OpenAI input pairs each call with its output', () => {
  const inp = openaiInput(body);
  const call = inp.find((i) => 'type' in i && i.type === 'function_call') as { call_id: string };
  const out = inp.find((i) => 'type' in i && i.type === 'function_call_output') as { call_id: string };
  assert.equal(call.call_id, out.call_id);
  assert.deepEqual(inp[0], { role: 'user', content: 'open the weather' });
});

const claudeStream = (stop: string, toolJson = '{"steps": 2}') =>
  sse([
    `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n`,
    `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Turning."}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
    `event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"rotate_carousel","input":{}}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(toolJson)}}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n`,
    `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"${stop}","stop_sequence":null},"usage":{"output_tokens":20}}\n\n`,
    `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
  ]);

test('Claude: streamed text and a checked tool call; fallbacks and effort are sent', async () => {
  let sent: Record<string, unknown> = {};
  let headers: Headers = new Headers();
  const fetcher = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(init.body as string);
    headers = new Headers(init.headers);
    return claudeStream('tool_use');
  }) as unknown as typeof fetch;
  const c = makeClaude((k) => ({ ANTHROPIC_API_KEY: 'sk-ant-test' })[k as string], { fetcher });
  const ev = await collect((send) => c.chat(body, 'app', new AbortController().signal, send));
  assert.deepEqual(ev.filter((e) => e.event === 'token').map((e) => e.data.text), ['Turning.']);
  assert.deepEqual(ev.find((e) => e.event === 'call')?.data, { name: 'rotate_carousel', args: { steps: 2 } });
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.fallbacks, 'default');
  assert.deepEqual(sent.output_config, { effort: 'low' });
  assert.ok(!('thinking' in sent), 'thinking stays at the model default');
  assert.ok((headers.get('anthropic-beta') ?? '').includes('server-side-fallback-2026-07-01'));
  assert.equal((sent.tools as { eager_input_streaming?: boolean }[])[0].eager_input_streaming, true);
});

test('Claude: a cut-off or declined reply never acts', async () => {
  for (const stop of ['max_tokens', 'refusal']) {
    const fetcher = (async () => claudeStream(stop)) as unknown as typeof fetch;
    const c = makeClaude((k) => ({ ANTHROPIC_API_KEY: 'sk-ant-test' })[k as string], { fetcher });
    const ev = await collect((send) => c.chat(body, 'app', new AbortController().signal, send));
    assert.equal(ev.filter((e) => e.event === 'call').length, 0, stop);
  }
  const bad = (async () => claudeStream('tool_use', '{"steps": ')) as unknown as typeof fetch;
  const c = makeClaude((k) => ({ ANTHROPIC_API_KEY: 'sk-ant-test' })[k as string], { fetcher: bad });
  const ev = await collect((send) => c.chat(body, 'app', new AbortController().signal, send));
  assert.equal(ev.filter((e) => e.event === 'call').length, 0, 'truncated arguments');
});

test('Claude: a rejected key gives a plain message, never the key', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key SECRETKEY' } }), { status: 401, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  const c = makeClaude((k) => ({ ANTHROPIC_API_KEY: 'SECRETKEY' })[k as string], { fetcher });
  const ev = await collect((send) => c.chat(body, 'app', new AbortController().signal, send));
  const err = ev.find((e) => e.event === 'error')!;
  assert.match(err.data.message, /didn’t accept/);
  assert.ok(!JSON.stringify(ev).includes('SECRETKEY'));
});

test('Claude Haiku gets no effort setting and no fallbacks', async () => {
  let sent: Record<string, unknown> = {};
  const fetcher = (async (_u: string, init: RequestInit) => ((sent = JSON.parse(init.body as string)), claudeStream('end_turn'))) as unknown as typeof fetch;
  const c = makeClaude((k) => ({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-haiku-4-5' })[k as string], { fetcher });
  await collect((send) => c.chat(body, 'app', new AbortController().signal, send));
  assert.ok(!('output_config' in sent));
  assert.ok(!('fallbacks' in sent));
});

test('OpenAI: Responses stream becomes tokens and a checked call; nothing stored', async () => {
  let sent: Record<string, unknown> = {};
  const fetcher = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(init.body as string);
    return sse([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Sure."}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","name":"open_module","arguments":"{\\"module\\":\\"news\\"}","call_id":"c1"}}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","name":"open_module","arguments":"{\\"module\\":\\"nowhere\\"}","call_id":"c2"}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
    ]);
  }) as unknown as typeof fetch;
  const o = makeOpenAI((k) => ({ OPENAI_API_KEY: 'sk-test' })[k as string], fetcher);
  const ev = await collect((send) => o.chat(body, 'browser', new AbortController().signal, send));
  assert.equal(ev.find((e) => e.event === 'token')?.data.text, 'Sure.');
  assert.deepEqual(ev.filter((e) => e.event === 'call').map((e) => e.data), [{ name: 'open_module', args: { module: 'news' } }]);
  assert.equal(sent.store, false);
  assert.equal(sent.stream, true);
  assert.deepEqual(sent.reasoning, { effort: 'low' });
});

test('OpenAI and ElevenLabs voices return 24 kHz PCM', async () => {
  const urls: string[] = [];
  const fetcher = (async (u: string) => (urls.push(u), new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 }))) as unknown as typeof fetch;
  const o = await makeOpenAI((k) => ({ OPENAI_API_KEY: 'sk-test' })[k as string], fetcher).speech('hello');
  const e = await makeElevenLabs((k) => ({ ELEVENLABS_API_KEY: 'sk_test' })[k as string], fetcher).speech('hello');
  assert.equal(o.sampleRate, 24000);
  assert.equal(e.pcm.length, 4);
  assert.ok(urls.some((u) => u.includes('output_format=pcm_24000')));
});

test('the picked AI is used when it has a key, else the first that does', () => {
  const s = (v: Record<string, string>) => (k: string) => v[k];
  assert.equal(makeAI(s({ DIVINA_AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'g' }) as never).provider(), 'claude');
  assert.equal(makeAI(s({ DIVINA_AI_PROVIDER: 'openai', GEMINI_API_KEY: 'g' }) as never).provider(), 'gemini');
  assert.equal(makeAI(s({}) as never).provider(), null);
  assert.equal(makeAI(s({ DIVINA_TTS_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'e', ANTHROPIC_API_KEY: 'k' }) as never).voiceProvider(), 'elevenlabs');
  assert.equal(makeAI(s({ ANTHROPIC_API_KEY: 'k' }) as never).speechConfigured(), false, 'Claude has no voice: browser voice');
});

test('new settings refuse values that could steer requests', () => {
  assert.equal(checkSetting('ANTHROPIC_API_KEY', 'sk-ant-' + 'api03-abcDEF_123-xyzxyzxyzxyz'), null);
  assert.notEqual(checkSetting('ANTHROPIC_API_KEY', 'sk-ant key with spaces here'), null);
  assert.notEqual(checkSetting('ANTHROPIC_MODEL', 'claude-opus-5-5/../../v1/files'), null);
  assert.notEqual(checkSetting('OPENAI_MODEL', 'gpt-6?x=1'), null);
  assert.notEqual(checkSetting('ELEVENLABS_VOICE', '../../history'), null);
  assert.notEqual(checkSetting('DIVINA_AI_PROVIDER', 'evilcorp'), null);
  assert.notEqual(checkSetting('OPENAI_TTS_VOICE', 'everyone'), null);
});
