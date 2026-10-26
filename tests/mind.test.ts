// Divina's mind: sorting what she knows into branches, and the commands that open it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMind, branchFor } from '../src/lib/mind';
import { parseCommand } from '../src/ai/commands';

test('remembered facts land on the right branch', () => {
  assert.equal(branchFor('My sister is called Amy'), 'people');
  assert.equal(branchFor('I am vegetarian'), 'health');
  assert.equal(branchFor('I work at a design studio'), 'work');
  assert.equal(branchFor('I live in Glasgow'), 'places');
  assert.equal(branchFor('My favourite colour is green'), 'you');
});

test('the mind gathers memory, open to-dos, agents, routines, worlds and skills, and links related things', () => {
  const m = buildMind({
    memory: [{ id: 'aaaaaaaa', text: 'My sister is called Amy', at: 1 }, { id: 'bbbbbbbb', text: 'I am vegetarian', at: 2 }],
    notes: [{ id: 'cccccccc', text: "Buy Amy's birthday present", done: false, at: 3 }, { id: 'dddddddd', text: 'Old task', done: true, at: 4 }],
    agents: [{ id: 'eeeeeeee', name: 'Chef', instructions: 'Vegetarian recipes', provider: '', model: '', voice: '', at: 5 }],
    routines: [],
    worlds: [],
    city: 'London',
  });
  const by = Object.fromEntries(m.branches.map((b) => [b.id, b.nodes.map((n) => n.label)]));
  assert.deepEqual(by.people, ['My sister is called Amy']);
  assert.deepEqual(by.plans, ["Buy Amy's birthday present"], 'done to-dos are left out');
  assert.deepEqual(by.agents, ['Chef']);
  assert.deepEqual(by.places, ['London']);
  assert.ok(by.skills.length >= 10);
  assert.ok(m.links.some(([a, b]) => [a, b].sort().join() === ['m:aaaaaaaa', 'n:cccccccc'].sort().join()), 'Amy ties the memory to the to-do');
  assert.ok(m.links.some(([a, b]) => [a, b].includes('a:eeeeeeee') && [a, b].includes('m:bbbbbbbb')), 'vegetarian ties Chef to the memory');
  assert.ok(!m.branches.some((b) => b.id === 'routines'), 'empty branches are left out');
});

test('the iPhone mind leaves out what iPhone can’t do', () => {
  const m = buildMind({ memory: [], notes: [], agents: [], routines: [], worlds: [], ios: true });
  assert.ok(!m.branches.find((b) => b.id === 'skills')!.nodes.some((n) => n.label === 'Screen help'));
});

test('"open your mind" and friends', () => {
  for (const s of ['Divina open your mind', 'show me your brain', 'what do you know about me', 'open your mind please', 'what have you learned'])
    assert.deepEqual(parseCommand(s)[0], { kind: 'mind' }, s);
  assert.deepEqual(parseCommand('close your mind')[0], { kind: 'mind', close: true });
  assert.deepEqual(parseCommand('what do you remember about me')[0], { kind: 'memory', op: 'list', text: '' });
});

test('"what\'s on today" is the schedule, not a share price called ON', () => {
  assert.deepEqual(parseCommand("what's on today")[0], { kind: 'schedule' });
  assert.notEqual(parseCommand("what's happening today")[0]?.kind, 'quote');
});
