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

test("Claude's corner: field notes and failures pile there, cascade, never drift (§9, D67 amended)", () => {
  const s = createStream();
  s.append(makeDeposit('w-1', 0));
  s.append(makeDeposit('n-1', 1, { kind: 'fieldnotes' }));
  s.append(makeDeposit('w-2', 2));
  s.append(makeDeposit('f-1', 3, { kind: 'failure' }));
  s.append(makeDeposit('w-3', 4));
  const events = s.all();
  const state = fold(events, pastEnd(events));
  const n1 = state.cards.find((c) => c.id === 'n-1');
  const f1 = state.cards.find((c) => c.id === 'f-1');
  for (const c of [n1, f1]) {
    assert.ok(c.x < 0.34 && c.y > 0.7, `pile card strayed from the corner: ${c.x}, ${c.y}`);
  }
  assert.ok(f1.x > n1.x && f1.y < n1.y, 'the pile cascades up-right, newest on top');
  // the pile holds still: same position the moment it lands and ever after
  const early = fold(events, eventTime(1)).cards.find((c) => c.id === 'n-1');
  assert.deepEqual([early.x, early.y], [n1.x, n1.y]);
});

test('placements are final (D87): a laid card never moves between any two boundaries', () => {
  const events = loadSeed();
  for (let k = 1; k < events.length; k++) {
    const prev = new Map(fold(events, eventTime(k - 1)).cards.map((c) => [c.id, c]));
    for (const c of fold(events, eventTime(k)).cards) {
      const p = prev.get(c.id);
      if (!p) continue; // the arriving card is new; everything laid holds still
      assert.deepEqual([c.x, c.y, c.rot], [p.x, p.y, p.rot], `${c.id} moved at boundary ${k}`);
    }
  }
});

test("normal cards keep out of Claude's corner; margins keep them in the light (D87)", () => {
  const events = loadSeed();
  for (const c of fold(events, pastEnd(events)).cards) {
    if (c.artifact.kind === 'fieldnotes' || c.artifact.kind === 'failure') continue;
    assert.ok(!(c.x < 0.32 && c.y > 0.68), `${c.id} strayed into the corner: ${c.x}, ${c.y}`);
    assert.ok(c.x >= 0.07 && c.x <= 0.93 && c.y >= 0.09 && c.y <= 0.91, `${c.id} out of the light: ${c.x}, ${c.y}`);
  }
});

test('spread (D89): no two non-pile cards land on top of each other, at any boundary', () => {
  // measured 0.148 canonical on the seed (0.222 on specimens); 0.10 pins it with margin
  const events = loadSeed();
  for (let k = 1; k <= events.length; k++) {
    const cards = fold(events, eventTime(k - 1)).cards
      .filter((c) => c.artifact.kind !== 'fieldnotes' && c.artifact.kind !== 'failure');
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const d = Math.hypot((cards[i].x - cards[j].x) * 1.6, cards[i].y - cards[j].y);
        assert.ok(d >= 0.1, `${cards[i].id} and ${cards[j].id} clump (${d.toFixed(3)}) at boundary ${k}`);
      }
    }
  }
});

test('first cards vary by id — the open table is a band, not one argmax (D89)', () => {
  const spots = ['solo-1', 'solo-2', 'solo-3', 'solo-4'].map((id) => {
    const s = createStream();
    s.append(makeDeposit(id, 0));
    const c = fold(s.all(), pastEnd(s.all())).cards[0];
    assert.ok(c.x >= 0.07 && c.x <= 0.93 && c.y >= 0.09 && c.y <= 0.91, 'in the light');
    return c;
  });
  let maxPair = 0;
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      maxPair = Math.max(maxPair, Math.hypot((spots[i].x - spots[j].x) * 1.6, spots[i].y - spots[j].y));
    }
  }
  assert.ok(maxPair >= 0.15, `four ids landed within one small disc (${maxPair.toFixed(3)})`);
});

test('retire finality (D87/D89): a retirement never re-places a survivor', () => {
  const s = createStream();
  for (let i = 1; i <= 3; i++) s.append(makeDeposit(`w-${i}`, 0));
  s.append({ e: 'retire', night: 1, id: 'w-2' });
  for (let i = 4; i <= 5; i++) s.append(makeDeposit(`w-${i}`, 1));
  const events = s.all();
  const poses = new Map();
  for (let k = 1; k <= events.length; k++) {
    for (const c of fold(events, eventTime(k - 1)).cards) {
      const pose = [c.x, c.y, c.rot];
      if (poses.has(c.id)) assert.deepEqual(pose, poses.get(c.id), `${c.id} moved at boundary ${k}`);
      else poses.set(c.id, pose);
    }
  }
  assert.deepEqual([...poses.keys()], ['w-1', 'w-2', 'w-3', 'w-4', 'w-5'], 'every card held one pose for life');
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
