// Who belongs near whom, read from the log alone. Dev-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { coauthorship, humansOf, peopleIn, merge, CLAUDE } from '../js/affinity.js';

const card = (id, people, kind = 'work') => ({
  e: 'deposit', night: 1,
  artifact: {
    id, media: 'note', kind, title: id, people,
    provenance: 'hand', visibility: 'public', excerpt: { form: 'words', text: id },
  },
});
const weightOf = (pairs, a, b) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))?.weight ?? 0;

test('Claude is never an anchor — a card made with Claude is the person\'s own', () => {
  assert.deepEqual(humansOf({ people: ['E.', CLAUDE] }), ['E.']);
  assert.deepEqual(humansOf({ people: [CLAUDE] }), [], 'Claude alone leaves no human studio');
  assert.deepEqual(humansOf({ people: [' M. ', 'Y.'] }), ['M.', 'Y.'], 'names are trimmed');
  assert.deepEqual(humansOf({}), []);

  // and so it pulls nobody toward anybody
  const pairs = coauthorship([card('a-1', ['E.', CLAUDE]), card('a-2', ['M.', CLAUDE])]);
  assert.deepEqual(pairs, [], 'working with Claude is not working with each other');
});

test('a shared card is the strongest evidence there is, and it saturates', () => {
  const once = coauthorship([card('a-1', ['E.', 'M.'])]);
  assert.equal(weightOf(once, 'E.', 'M.'), 1 / 3);
  assert.equal(once[0].why, 'made something together');

  const thrice = coauthorship([card('a-1', ['E.', 'M.']), card('a-2', ['M.', 'E.']), card('a-3', ['E.', 'M.'])]);
  assert.equal(weightOf(thrice, 'E.', 'M.'), 1);

  const many = coauthorship(Array.from({ length: 9 }, (_, i) => card(`a-${i}`, ['E.', 'M.'])));
  assert.equal(weightOf(many, 'E.', 'M.'), 1, 'nine collaborations do not tear the map apart');
  assert.match(many[0].why, /9 things/);
});

test('three on one card is three pairs, and a lone maker is no pair at all', () => {
  const trio = coauthorship([card('a-1', ['E.', 'M.', 'Y.'])]);
  assert.equal(trio.length, 3);
  for (const [a, b] of [['E.', 'M.'], ['E.', 'Y.'], ['M.', 'Y.']]) assert.ok(weightOf(trio, a, b) > 0, `${a}+${b}`);

  assert.deepEqual(coauthorship([card('a-1', ['E.'])]), []);
  assert.deepEqual(coauthorship([card('a-1', ['E.', 'E.'])]), [], 'a name twice on one card is one person');
});

test('the pairs come out in a stable order, so the map built from them is stable', () => {
  const evs = [card('a-1', ['Y.', 'E.']), card('a-2', ['M.', 'B.']), card('a-3', ['B.', 'E.'])];
  const first = coauthorship(evs);
  assert.deepEqual(coauthorship([...evs]), first);
  assert.deepEqual(first.map((p) => `${p.a}+${p.b}`), ['B.+E.', 'B.+M.', 'E.+Y.']);
});

test('everyone the log knows, in the order it first said them — Claude included, for its own work', () => {
  const evs = [card('a-1', ['R.']), card('a-2', ['E.', 'M.']), card('a-3', [CLAUDE], 'fieldnotes'), card('a-4', ['R.'])];
  assert.deepEqual(peopleIn(evs), ['R.', 'E.', 'M.', CLAUDE]);
  assert.deepEqual(peopleIn([card('a-1', ['E.', CLAUDE])]), ['E.'], 'a card in service earns Claude no studio');
  assert.deepEqual(peopleIn([]), []);
});

test('a read of the work merges over the floor, and never under it', () => {
  const floor = coauthorship([card('a-1', ['E.', 'M.']), card('a-2', ['E.', 'M.'])]); // 2/3
  const read = [
    { a: 'M.', b: 'E.', weight: 0.1, why: 'a reader thought them distant' },
    { a: 'R.', b: 'B.', weight: 0.8, why: 'a fold that will not close, and a drone' },
  ];
  const merged = merge(floor, read);
  assert.equal(weightOf(merged, 'E.', 'M.'), 2 / 3, 'people who actually worked together never drift apart');
  assert.equal(weightOf(merged, 'R.', 'B.'), 0.8, 'and the pair who have not collided yet is what the read is for');
  assert.equal(merged.find((p) => p.a === 'B.').why, 'a fold that will not close, and a drone');

  // a stronger read wins where the floor is weak
  assert.equal(weightOf(merge(coauthorship([card('a-1', ['E.', 'M.'])]), [{ a: 'E.', b: 'M.', weight: 0.9 }]), 'E.', 'M.'), 0.9);
});

test('a read that makes no sense is dropped, not obeyed', () => {
  const merged = merge([], [
    { a: 'E.', b: 'E.', weight: 1 }, // nobody is near themselves
    { a: 'E.', weight: 1 }, // half a pair
    { a: 'E.', b: 'M.', weight: 0 },
    { a: 'E.', b: 'Y.', weight: -3 },
    { a: 'E.', b: 'B.', weight: 'lots' },
    null,
    { a: 'E.', b: 'R.', weight: 4 }, // clamped, not refused
  ]);
  assert.deepEqual(merged.map((p) => `${p.a}+${p.b}`), ['E.+R.']);
  assert.equal(merged[0].weight, 1);
});
