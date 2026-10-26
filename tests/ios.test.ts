// The iPhone app's build: Windows-only cards and wording left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_DIVINA_PLATFORM = 'ios';
process.env.NEXT_PUBLIC_DIVINA_EDITION = 'web';

test('the iPhone app has no Windows-only cards', async () => {
  const { MODULE_IDS, isModuleId } = await import('../src/modules/ids');
  for (const id of ['stocks', 'sports', 'email', 'instagram', 'projects']) assert.ok(!MODULE_IDS.includes(id as never), id);
  for (const id of ['weather', 'notes', 'agents', 'crypto', 'calendar', 'news', 'music', 'ai', 'system']) assert.ok(isModuleId(id), id);
});

test('nothing in the iPhone app says "coming soon"', async () => {
  const { inFullApp, FULL_APP_NOTE } = await import('../src/lib/edition');
  assert.doesNotMatch(inFullApp('Your inbox comes') + FULL_APP_NOTE, /coming soon/i);
});

test('the iPhone app tells the AI what it can and can’t do there', async () => {
  const { systemPrompt } = await import('../src/lib/ai/chat');
  const p = systemPrompt({ history: [], context: '' }, 'browser');
  assert.match(p, /Divina for iPhone/);
  assert.doesNotMatch(p, /free browser edition/);
});
