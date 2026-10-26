import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankMatch, rankAll } from '../src/lib/rank';
import { backAccumulate, detectIgApi, destinationsFrom } from '../src/lib/instagram';
import { parseIcs } from '../src/lib/ics';
import { edgeFactor, envelopesAt, phaseAt, EMBODY } from '../src/core/clock/timeline';
import { spring1, stepSpring1 } from '../src/core/spring';

test('rank: prefix > initials > word boundary > substring', () => {
  const p = rankMatch('goo', 'Google Chrome');
  const i = rankMatch('gc', 'Google Chrome');
  const w = rankMatch('chr', 'Google Chrome');
  const s = rankMatch('hrom', 'Google Chrome');
  assert.ok(p > i && i > w && w > s && s > 0, `${p} ${i} ${w} ${s}`);
  const ranked = rankAll('st', [{ n: 'System Settings' }, { n: 'Stocks' }, { n: 'Last.fm' }], (x) => [x.n]);
  assert.equal(ranked[0].item.n, 'Stocks');
});

test('instagram token prefix detection', () => {
  assert.equal(detectIgApi('IGAAabc').kind, 'instagram-login');
  const fb = detectIgApi('EAAabc', '1784');
  assert.equal(fb.kind, 'facebook-login');
  assert.equal((fb as { base: string }).base, 'https://graph.facebook.com');
  assert.equal(detectIgApi('EAAabc').kind, 'invalid');
  assert.equal(detectIgApi('xyz').kind, 'invalid');
});

test('follower deltas back-accumulate into the true curve', () => {
  const series = backAccumulate(1000, [
    { date: '2026-09-03', value: 5 },
    { date: '2026-09-01', value: 10 },
    { date: '2026-09-02', value: -2 },
  ]);
  assert.deepEqual(series, [
    { date: '2026-09-01', total: 997 },
    { date: '2026-09-02', total: 995 },
    { date: '2026-09-03', total: 1000 },
  ]);
  assert.equal(destinationsFrom('some.user').reels, 'https://www.instagram.com/some.user/reels/');
});

test('ics: single, weekly recurrence, exdate', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:a',
    'SUMMARY:Standup',
    'DTSTART:20260928T090000',
    'DTEND:20260928T091500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
    'EXDATE:20260930T090000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:b',
    'SUMMARY:Launch\\, v7',
    'DTSTART;VALUE=DATE:20261001',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const ev = parseIcs(ics, new Date(2026, 8, 28), new Date(2026, 9, 12));
  const standups = ev.filter((e) => e.title === 'Standup');
  assert.equal(standups.length, 5); // 6 minus the EXDATE
  assert.ok(ev.some((e) => e.title === 'Launch, v7' && e.allDay));
});

test('embodiment timeline: phases in order, return runs the same curve', () => {
  const order = ['COMMAND_DETECTED', 'COLLAPSING', 'PARTICLE_CORE', 'SKELETON_FORMING', 'HUMANOID_FORMING', 'HUMANOID_ACTIVE'];
  const seen: string[] = [];
  for (let t = 0.01; t <= EMBODY.total; t += 0.05) {
    const p = phaseAt(t, false);
    if (seen[seen.length - 1] !== p) seen.push(p);
  }
  if (seen[seen.length - 1] !== 'HUMANOID_ACTIVE') seen.push(phaseAt(EMBODY.total, false));
  assert.deepEqual(seen, order);
  assert.equal(phaseAt(3, true), 'RETURNING');
  assert.equal(phaseAt(0, true), 'NORMAL');
  const a = envelopesAt(5.2);
  const b = envelopesAt(5.2);
  assert.deepEqual(a, b);
  assert.equal(envelopesAt(0).dim, 0);
  assert.equal(envelopesAt(EMBODY.total).presence, 1);
});

test('edge factor: edges erode first, centre last', () => {
  assert.ok(edgeFactor(0.001, 0.5) < 0.2);
  assert.ok(edgeFactor(0.5, 0.5) > 0.8);
});

test('springs come to rest exactly', () => {
  const s = spring1(0);
  s.target = 1;
  for (let i = 0; i < 2000; i++) stepSpring1(s, { stiffness: 38, damping: 11 }, 1 / 60);
  assert.equal(s.x, 1);
  assert.equal(s.v, 0);
  assert.equal(stepSpring1(s, { stiffness: 38, damping: 11 }, 1 / 60), false);
});
