// Affinity in, places out — the half of the map that must be deterministic,
// stable and non-overlapping, because a reader can guarantee none of the three.
// Dev-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, ring, packSpread } from '../js/layout.js';
import { TABLE_ASPECT } from '../js/fold.js';

const NAMES = ['R.', 'B.', 'M.', 'E.', 'Y.', 'T.', 'L.', 'A.', 'S.', 'K.', 'N.', 'P.',
  'D.', 'G.', 'H.', 'I.', 'J.', 'C.', 'F.', 'O.', 'V.', 'W.', 'Z.', 'Q.', 'Claude'];

// canonical distance — x is stretched by the table's own proportions
const apart = (p, a, b) => Math.hypot((p[a][0] - p[b][0]) * TABLE_ASPECT, p[a][1] - p[b][1]);
const onTable = (p) => Object.values(p).every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);

test('the same affinity makes the same map, every time', () => {
  const pairs = [{ a: 'R.', b: 'B.', weight: 1 }, { a: 'M.', b: 'E.', weight: 0.6 }];
  const first = arrange(NAMES, pairs);
  assert.deepEqual(arrange(NAMES, pairs), first, 'no clock, no randomness');
  assert.deepEqual(arrange([...NAMES], [...pairs]), first, 'and no dependence on identity');
});

test('every studio lands on the table, and no two crowd each other', () => {
  const places = arrange(NAMES, []);
  assert.equal(Object.keys(places).length, NAMES.length);
  assert.ok(onTable(places));
  let worst = Infinity;
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) worst = Math.min(worst, apart(places, NAMES[i], NAMES[j]));
  }
  assert.ok(worst > 0.12, `twenty-five studios still stand apart (closest ${worst.toFixed(3)})`);
});

test('a shared problem draws two studios together', () => {
  const far = arrange(NAMES, []);
  const near = arrange(NAMES, [{ a: 'R.', b: 'B.', weight: 1 }]);
  assert.ok(apart(near, 'R.', 'B.') < apart(far, 'R.', 'B.'), 'the pair closed the distance');
  assert.ok(apart(near, 'R.', 'B.') > 0.1, 'but never onto each other');
});

test('the map drifts — nobody wakes to find their studio across the room', () => {
  const monday = arrange(NAMES, []);
  // a night in which everything changed: every pair suddenly bound
  const bound = [];
  for (let i = 0; i < NAMES.length; i += 2) if (NAMES[i + 1]) bound.push({ a: NAMES[i], b: NAMES[i + 1], weight: 1 });
  const tuesday = arrange(NAMES, bound, monday);
  for (const n of NAMES) {
    const moved = Math.hypot(tuesday[n][0] - monday[n][0], tuesday[n][1] - monday[n][1]);
    assert.ok(moved <= 0.2201, `${n} drifted ${moved.toFixed(3)}, not teleported`);
  }
  assert.ok(onTable(tuesday));
});

test('a person who arrives tonight gets a berth of their own', () => {
  const monday = arrange(['R.', 'B.'], []);
  const tuesday = arrange(['R.', 'B.', 'M.'], [], monday);
  assert.ok(tuesday['M.'], 'the newcomer is placed');
  assert.ok(onTable(tuesday));
  assert.ok(apart(tuesday, 'M.', 'R.') > 0.1 && apart(tuesday, 'M.', 'B.') > 0.1, 'and not on top of anyone');
  // two arrivals on one night do not land on one spot
  const both = arrange(['R.', 'B.', 'M.', 'Y.'], [], monday);
  assert.ok(apart(both, 'M.', 'Y.') > 0.1);
});

test('the room empty, the room of one, and a pair nobody knows', () => {
  assert.deepEqual(arrange([], []), {});
  assert.deepEqual(arrange(['E.'], []), { 'E.': [0.5, 0.5] });
  assert.deepEqual(arrange(['  ', ''], []), {}, 'a blank is not a person');
  assert.deepEqual(arrange(['E.', 'E.'], []), arrange(['E.'], []), 'one person named twice is one studio');
  // an affinity naming someone who is not here is ignored, not obeyed
  assert.ok(onTable(arrange(['E.', 'M.'], [{ a: 'E.', b: 'nobody', weight: 1 }])));
});

test('the first ring is a room, not a queue', () => {
  const r = ring(NAMES);
  assert.equal(Object.keys(r).length, NAMES.length);
  assert.ok(onTable(r));
  const xs = new Set(Object.values(r).map(([x]) => x.toFixed(3)));
  assert.ok(xs.size > NAMES.length / 2, 'they do not share one column');
});

// ---- a pile opened under a hand (D144) ----

const boxes = (n, w = 100, h = 90) => Array.from({ length: n }, () => ({ w, h }));
const rects = (sizes, pack) => pack.offsets.map((o, i) => ({
  x1: o.dx - sizes[i].w / 2, x2: o.dx + sizes[i].w / 2,
  y1: o.dy - sizes[i].h / 2, y2: o.dy + sizes[i].h / 2,
}));
const overlaps = (rs) => {
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i]; const b = rs[j];
      if (a.x1 < b.x2 - 1e-9 && a.x2 > b.x1 + 1e-9 && a.y1 < b.y2 - 1e-9 && a.y2 > b.y1 + 1e-9) return true;
    }
  }
  return false;
};

test('an open pile shows every card whole, and no card covers another', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 9, 12]) {
    const sizes = boxes(n);
    const pack = packSpread(sizes, 8);
    assert.equal(pack.offsets.length, n, `${n} cards, ${n} places`);
    assert.ok(!overlaps(rects(sizes, pack)), `${n} cards overlap`);
  }
});

test('it takes only the room it needs — a pile of one grows nothing', () => {
  const one = packSpread(boxes(1), 8);
  assert.deepEqual(one.offsets, [{ dx: 0, dy: 0 }]);
  assert.deepEqual([one.w, one.h], [100, 90], 'a card alone is its own block');
  const two = packSpread(boxes(2), 8);
  assert.equal(two.w, 208, 'two cards wide, plus the margin — not a fixed square');
  assert.equal(two.h, 90, 'and one card tall');
  assert.ok(packSpread(boxes(9), 8).w < packSpread(boxes(12), 8).w * 1.01);
});

test('the block is centred, so it opens around the studio it belongs to', () => {
  for (const n of [2, 3, 5, 7]) {
    const sizes = boxes(n);
    const rs = rects(sizes, packSpread(sizes, 8));
    const left = Math.min(...rs.map((r) => r.x1));
    const right = Math.max(...rs.map((r) => r.x2));
    const top = Math.min(...rs.map((r) => r.y1));
    const bottom = Math.max(...rs.map((r) => r.y2));
    assert.ok(Math.abs(left + right) < 1e-9, `${n} cards sit off-centre horizontally`);
    assert.ok(Math.abs(top + bottom) < 1e-9, `${n} cards sit off-centre vertically`);
  }
});

test('a studio holds more than one shape: rows are as tall as their tallest card', () => {
  const sizes = [{ w: 100, h: 200 }, { w: 100, h: 60 }, { w: 100, h: 90 }, { w: 100, h: 90 }];
  const pack = packSpread(sizes, 8);
  assert.ok(!overlaps(rects(sizes, pack)), 'a tall photograph does not sit on the note beside it');
  assert.equal(pack.h, 200 + 8 + 90, 'the block is the sum of its rows, not of its cards');
});

test('nothing to open', () => {
  assert.deepEqual(packSpread([]), { offsets: [], w: 0, h: 0 });
  assert.deepEqual(packSpread(null), { offsets: [], w: 0, h: 0 });
  assert.deepEqual(packSpread([{ w: 0, h: 0 }]), { offsets: [], w: 0, h: 0 }, 'a card with no size is not a card');
});
