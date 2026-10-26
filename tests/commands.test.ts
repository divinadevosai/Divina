import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/ai/commands';

const one = (s: string) => parseCommand(s)[0];

test('the brief’s examples resolve locally', () => {
  assert.deepEqual(one('Open Instagram'), { kind: 'open', module: 'instagram' });
  assert.deepEqual(one('Show Projects'), { kind: 'open', module: 'projects' });
  assert.deepEqual(one('Rotate Left'), { kind: 'rotate', steps: 1 });
  assert.deepEqual(one('rotate right by two'), { kind: 'rotate', steps: -2 });
  assert.deepEqual(one('Show Calendar'), { kind: 'open', module: 'calendar' });
  assert.deepEqual(parseCommand('Latest AI News').map((c) => c.kind), ['open', 'news']);
  assert.deepEqual(one('How is Nvidia today?'), { kind: 'quote', symbol: 'NVDA', name: 'nvidia' });
  assert.deepEqual(one('Open Stocks'), { kind: 'open', module: 'stocks' });
  assert.deepEqual(one("What's my schedule?"), { kind: 'schedule' });
  assert.deepEqual(parseCommand("Summarize today's AI news").map((c) => c.kind), ['open', 'news']);
  assert.equal(one('Search YouTube for spring physics').kind, 'desktop');
  assert.deepEqual(one('Explain MCP'), { kind: 'ask', text: 'Explain MCP' });
  assert.deepEqual(one('Explain this'), { kind: 'ask', text: 'Explain this' });
});

test('transformation phrasings', () => {
  assert.deepEqual(one('Divina, transform into a human shape'), { kind: 'transform', to: 'human' });
  assert.deepEqual(one('Return to spatial mode'), { kind: 'transform', to: 'spatial' });
});

test('desktop verbs and apps', () => {
  assert.deepEqual(one('open spotify'), { kind: 'desktop', verb: 'launch_app', args: { name: 'spotify' } });
  assert.deepEqual(one('open github.com'), { kind: 'desktop', verb: 'open_url', args: { url: 'github.com' } });
  assert.deepEqual(one('set volume to 30'), { kind: 'desktop', verb: 'volume', args: { level: 30 } });
  // reminders are Divina's own timers now (they work in both editions)
  assert.deepEqual(one('remind me to call mum in 20 minutes'), { kind: 'timer', op: 'start', minutes: 20, label: 'Call mum' });
  assert.deepEqual(one('quit slack'), { kind: 'desktop', verb: 'quit_app', args: { name: 'slack' } });
  assert.deepEqual(one('close'), { kind: 'collapse' });
  assert.deepEqual(one('open my reels'), { kind: 'personal', target: 'reels' });
  assert.deepEqual(one('switch to the fog chamber'), { kind: 'world', world: 'fog' });
  assert.deepEqual(one('hold still'), { kind: 'motion', on: false });
});

test('wake phrase variants are stripped', () => {
  for (const w of ['Divina', 'Davina', 'Devina', 'hey Divina']) assert.deepEqual(one(`${w}, open stocks`), { kind: 'open', module: 'stocks' });
});

test('sports leagues and settings by voice', () => {
  assert.deepEqual(one('Divina, follow the NBA'), { kind: 'league', op: 'add', codes: ['basketball/nba'], names: ['NBA'] });
  assert.deepEqual(one('stop following the NFL'), { kind: 'league', op: 'remove', codes: ['football/nfl'], names: ['NFL'] });
  assert.deepEqual(one('only follow the NFL, the Scottish Premiership and the NBA'), {
    kind: 'league',
    op: 'only',
    codes: ['football/nfl', 'soccer/sco.1', 'basketball/nba'],
    names: ['NFL', 'Scottish Premiership', 'NBA'],
  });
  assert.deepEqual(one('follow the premier league'), { kind: 'league', op: 'add', codes: ['soccer/eng.1'], names: ['Premier League'] });
  assert.deepEqual(one('open settings'), { kind: 'settings' });
  assert.deepEqual(one('use the fast voice'), { kind: 'voiceMode', fast: true });
  assert.deepEqual(one('reply faster'), { kind: 'thinking', fast: true });
  // still falls through for things that are not leagues
  assert.equal(one('follow the recipe').kind, 'ask');
  assert.equal(one('show me stocks').kind, 'open');
});

test('misheard and polite ways of asking for a card still open it', () => {
  for (const s of [
    'Divina open the crypto card', 'divina open the crypto cards', 'Davina open the crypto car', 'Divina, open the kryptocard', 'Divina open the crypto currency card',
    'Divina can you open the crypto card', 'Divina please open the crypto card', 'Divina open the crypto tab', 'Divina open the crypto card for me',
    'Divina could you show me the crypto please', 'Deviner open the crypto card', 'Vina open the crypto card', 'divine open the crypto card', 'Hey Divina, open the cripto card',
  ])
    assert.deepEqual(one(s), { kind: 'open', module: 'crypto' }, s);
  assert.deepEqual(one('Divina open the whether card'), { kind: 'open', module: 'weather' });
  assert.deepEqual(one('Divina open the calender'), { kind: 'open', module: 'calendar' });
});

test('a card that doesn’t exist is answered, not launched as an app', () => {
  assert.deepEqual(one('open the banana card'), { kind: 'unknownCard', name: 'banana' });
  assert.deepEqual(one('open spotify'), { kind: 'desktop', verb: 'launch_app', args: { name: 'spotify' } });
});

test('everyday talk and questions about cards get an answer without a key', () => {
  assert.deepEqual(one('Divina, hello'), { kind: 'smalltalk', topic: 'hello' });
  assert.deepEqual(one('what time is it'), { kind: 'smalltalk', topic: 'time' });
  assert.deepEqual(one("what's the date today"), { kind: 'smalltalk', topic: 'date' });
  assert.deepEqual(one('thank you'), { kind: 'smalltalk', topic: 'thanks' });
  assert.deepEqual(one('what can you do'), { kind: 'help' });
  assert.deepEqual(one('Divina what is bitcoin doing'), { kind: 'brief', module: 'crypto' });
  assert.deepEqual(one('do I have any new emails'), { kind: 'brief', module: 'email' });
  assert.deepEqual(one("what's on my calendar card"), { kind: 'brief', module: 'calendar' });
  assert.deepEqual(one('bring up crypto'), { kind: 'open', module: 'crypto' });
  assert.deepEqual(one('close the crypto card'), { kind: 'collapse' });
  assert.equal(one('explain quantum computing to me').kind, 'ask');
});

test('apps are still apps', () => {
  assert.deepEqual(one('open the spotify app'), { kind: 'desktop', verb: 'launch_app', args: { name: 'spotify' } });
});

test('play a song, artist or playlist on a music service', () => {
  assert.deepEqual(one('Divina play Drake on Spotify'), { kind: 'playSearch', query: 'drake', service: 'spotify' });
  assert.deepEqual(one('play some jazz on apple music'), { kind: 'playSearch', query: 'some jazz', service: 'apple_music' });
  assert.deepEqual(one('can you put on lo-fi beats on youtube music please'), { kind: 'playSearch', query: 'lo-fi beats', service: 'youtube_music' });
  assert.deepEqual(one('listen to taylor swift'), { kind: 'playSearch', query: 'taylor swift', service: null });
  assert.deepEqual(one('search for daft punk on sound cloud'), { kind: 'playSearch', query: 'daft punk', service: 'soundcloud' });
  assert.deepEqual(one('play songs on repeat'), { kind: 'playSearch', query: 'songs on repeat', service: null });
  assert.deepEqual(one('play something'), { kind: 'desktop', verb: 'media', args: { action: 'play' } });
  assert.deepEqual(one('play'), { kind: 'desktop', verb: 'media', args: { action: 'play' } });
  assert.deepEqual(one('play the next song'), { kind: 'desktop', verb: 'media', args: { action: 'next' } });
  assert.equal(one('search youtube for cats').kind, 'desktop');
});
