import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderEvents, parseLeagues } from '../src/lib/server/providers/sports';

test('several leagues: commas, spaces, duplicates, bad codes', () => {
  assert.deepEqual(parseLeagues(undefined).ok, ['soccer/eng.1']);
  assert.deepEqual(parseLeagues('soccer/eng.1, basketball/nba,soccer/ESP.1 , soccer/eng.1').ok, ['soccer/eng.1', 'basketball/nba', 'soccer/esp.1']);
  assert.deepEqual(parseLeagues('soccer/eng.1, premier league').bad, ['premier', 'league']);
});

test('games order: live, then soonest upcoming, then latest results', () => {
  const g = (id: string, state: 'pre' | 'in' | 'post', date: string) => ({ id, name: id, home: { name: '', abbr: '', score: '' }, away: { name: '', abbr: '', score: '' }, state, detail: '', date });
  const out = orderEvents([g('old', 'post', '2026-09-20'), g('later', 'pre', '2026-10-05'), g('live', 'in', '2026-09-29'), g('soon', 'pre', '2026-09-30'), g('recent', 'post', '2026-09-28')]);
  assert.deepEqual(out.map((x) => x.id), ['live', 'soon', 'later', 'recent', 'old']);
});
