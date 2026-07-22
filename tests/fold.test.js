// Invariant 1, enforced not asserted: the table's state is a pure function of
// the event stream and the clock. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStream } from '../js/stream.js';
import { fold, eventTime, pastEnd } from '../js/fold.js';

const seed = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));

function loadSeed() {
  const s = createStream();
  for (const ev of seed.events) s.append(ev);
  return s.all();
}

function makeDeposit(id, night, overrides = {}) {
  return {
    e: 'deposit',
    night,
    artifact: {
      id,
      media: 'note',
      kind: 'work',
      title: `placeholder ${id}`,
      practice: 'music',
      provenance: 'curator',
      visibility: 'public',
      excerpt: { form: 'words', text: 'placeholder' },
      ...overrides,
    },
  };
}

test('seed.json validates against the schema on append', () => {
  assert.equal(loadSeed().length, seed.events.length);
});

test('determinism: fold the seed twice at t = 0, mid-event, past-end — diff nothing', () => {
  const events = loadSeed();
  const mid = (eventTime(0) + eventTime(1)) / 2;
  for (const t of [0, mid, pastEnd(events)]) {
    assert.equal(
      JSON.stringify(fold(events, t)),
      JSON.stringify(fold(events, t)),
      `fold diverged from itself at t=${t}`,
    );
  }
});

test('arrival gating at boundary t values', () => {
  const events = loadSeed();
  const deposits = seed.events.filter((ev) => ev.e === 'deposit');
  const threads = seed.events.filter((ev) => ev.e === 'thread');
  assert.equal(fold(events, 0).cards.length, 0);
  assert.equal(fold(events, eventTime(0)).cards.length, 1); // boundary is inclusive
  assert.equal(fold(events, (eventTime(0) + eventTime(1)) / 2).cards.length, 1);
  const settled = fold(events, pastEnd(events));
  assert.equal(settled.cards.length, deposits.length);
  assert.equal(settled.threads.length, threads.length);
});

test('strata and quest register are pure outputs of the stream', () => {
  const events = loadSeed();
  const state = fold(events, pastEnd(events));
  const deposits = seed.events.filter((ev) => ev.e === 'deposit');
  const quest = state.cards.find((c) => c.artifact.kind === 'quest');
  const newest = state.cards.find((c) => c.id === deposits[deposits.length - 1].artifact.id);
  assert.equal(state.maxNight, 4);
  assert.equal(quest.stratum, 4);
  assert.equal(newest.stratum, 0);
  assert.ok(quest.opacity < newest.opacity, 'older material sinks in opacity');
});

test('fieldnotes keep to their corner as a cascading pile and never drift (§9)', () => {
  const s = createStream();
  s.append(makeDeposit('w-1', 0));
  s.append(makeDeposit('n-1', 1, { kind: 'fieldnotes' }));
  s.append(makeDeposit('w-2', 2));
  s.append(makeDeposit('n-2', 3, { kind: 'fieldnotes' }));
  s.append(makeDeposit('w-3', 4));
  const events = s.all();
  const state = fold(events, pastEnd(events));
  const n1 = state.cards.find((c) => c.id === 'n-1');
  const n2 = state.cards.find((c) => c.id === 'n-2');
  for (const n of [n1, n2]) {
    assert.ok(n.x < 0.34 && n.y > 0.7, `fieldnote strayed from the corner: ${n.x}, ${n.y}`);
  }
  assert.ok(n2.x > n1.x && n2.y < n1.y, 'the pile cascades up-right, newest on top');
  // the pile holds still: same position the moment it lands and ever after
  const early = fold(events, eventTime(1)).cards.find((c) => c.id === 'n-1');
  assert.deepEqual([early.x, early.y], [n1.x, n1.y]);
});

test('continuity (D49): between any two boundaries, a laid card moves less than 0.03', () => {
  // The bound the motion layer leans on: relax-on-base means a pre-existing
  // card's between-event delta is exactly one drift increment (analytically
  // ≤ ~0.0093; 0.03 gives 3× headroom). Checked on the real seed later too —
  // this synthetic stream is denser than anything the seed pass will author.
  const events = loadSeed();
  let maxDelta = 0;
  for (let k = 1; k < events.length; k++) {
    const before = fold(events, eventTime(k - 1));
    const after = fold(events, eventTime(k));
    const prev = new Map(before.cards.map((c) => [c.id, c]));
    for (const c of after.cards) {
      const p = prev.get(c.id);
      if (!p) continue; // the arriving card travels; laid cards may not
      maxDelta = Math.max(maxDelta, Math.abs(c.x - p.x), Math.abs(c.y - p.y));
    }
  }
  assert.ok(maxDelta < 0.03, `laid card moved ${maxDelta} between boundaries`);
  assert.ok(maxDelta > 0, 'drift is alive — something must nudge');
});

test('cards expose a deterministic placement direction for the entry ray', () => {
  const events = loadSeed();
  const state = fold(events, pastEnd(events));
  for (const c of state.cards) {
    assert.equal(typeof c.dir, 'number');
    assert.ok(c.dir >= 0 && c.dir < Math.PI * 2, `dir ${c.dir} out of range`);
  }
  assert.deepEqual(
    state.cards.map((c) => c.dir),
    fold(events, pastEnd(events)).cards.map((c) => c.dir),
  );
});

test('thread opacity fades with its dimmer end (D14 concretized)', () => {
  const s = createStream();
  s.append(makeDeposit('x-old', 0)); // will sink two strata
  s.append(makeDeposit('x-new', 2));
  s.append({ e: 'thread', night: 2, from: 'x-old', to: 'x-new', why: 'same problem' });
  const state = fold(s.all(), pastEnd(s.all()));
  const [thread] = state.threads;
  const byId = new Map(state.cards.map((c) => [c.id, c]));
  assert.equal(thread.opacity, Math.min(byId.get('x-old').opacity, byId.get('x-new').opacity));
  assert.ok(thread.opacity < byId.get('x-new').opacity, 'the thread must sink with the older card');
});

test('threads are events in the same stream and render only between visible cards', () => {
  const s = createStream();
  s.append(makeDeposit('x-1', 0));
  s.append(makeDeposit('x-2', 1));
  s.append({ e: 'thread', night: 1, from: 'x-1', to: 'x-2', why: 'same makers' });
  const state = fold(s.all(), pastEnd(s.all()));
  assert.equal(state.threads.length, 1);
  // Before the thread event's arrival moment, no thread — same fold, earlier t.
  assert.equal(fold(s.all(), eventTime(1)).threads.length, 0);
});

test('retirement (D32): the fold ceases to display the card and its threads', () => {
  const s = createStream();
  s.append(makeDeposit('x-1', 0));
  s.append(makeDeposit('x-2', 1));
  s.append({ e: 'thread', night: 1, from: 'x-1', to: 'x-2', why: 'same makers' });
  s.append({ e: 'retire', night: 1, id: 'x-2' });
  const state = fold(s.all(), pastEnd(s.all()));
  assert.deepEqual(state.cards.map((c) => c.id), ['x-1']);
  assert.equal(state.threads.length, 0);
});
