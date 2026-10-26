import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.GEMINI_API_KEY = 'x';
test('CRLF SSE with thought parts streams only the answer', async () => {
  const chunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"planning...","thought":true}]}}]}\r\n\r\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"Hello, "}]}}]}\r\n\r\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"I am Divina."}]},"finishReason":"STOP"}]}\r\n\r\n',
  ];
  globalThis.fetch = (async () => new Response(new ReadableStream({ start(c) { for (const k of chunks) c.enqueue(new TextEncoder().encode(k)); c.close(); } }), { status: 200 })) as typeof fetch;
  const { POST } = await import('../src/app/api/ai/route');
  const req = { json: async () => ({ history: [{ role: 'user', text: 'hi' }], context: '' }), signal: new AbortController().signal } as never;
  const out = await (await POST(req)).text();
  const tokens = [...out.matchAll(/event: token\ndata: (.*)/g)].map((m) => JSON.parse(m[1]).text).join('');
  assert.equal(tokens, 'Hello, I am Divina.');
  assert.ok(out.includes('event: done'));
});
