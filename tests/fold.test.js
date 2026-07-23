// Invariant 1, enforced not asserted: the table's state is a pure function of
// the event stream and the clock. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStream } from '../js/stream.js';
import { fold, eventTime, pastEnd, cardRect, captionStrip } from '../js/fold.js';

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
            people: ['R.'],
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
  // a floating work is also held by its makers' studios, so the drawn threads
  // are the stream's own plus those anchors
  assert.equal(settled.threads.filter((t) => !t.anchor).length, threads.length);
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

// ---- the map of studios ----

const person = (id, people, kind = 'work', night = 1) => ({
  e: 'deposit', night,
  artifact: {
    id, media: 'note', kind, title: id, people,
    provenance: 'hand', visibility: 'public', excerpt: { form: 'words', text: id },
  },
});
const pileOf = (state, id) => state.cards.find((c) => c.id === id);

test("a card lies in its maker's studio; Claude in service moves it nowhere", () => {
  const evs = [person('a-1', ['E.']), person('a-2', ['E.', 'Claude']), person('a-3', ['Claude'], 'fieldnotes')];
  const s = fold(evs, pastEnd(evs));
  assert.equal(pileOf(s, 'a-1').pile, 'E.');
  assert.equal(pileOf(s, 'a-2').pile, 'E.', "a card credited E. + Claude is E.'s work (§3)");
  assert.equal(pileOf(s, 'a-3').pile, 'Claude', "and Claude's own work makes Claude's own studio");
  assert.deepEqual(s.studios.map((x) => x.name), ['E.', 'Claude'], 'a peer among the studios, not a corner');
});

test('a work by several hands floats between them, held by threads to each', () => {
  const evs = [person('a-1', ['E.']), person('a-2', ['M.']), person('a-3', ['E.', 'M.'])];
  const s = fold(evs, pastEnd(evs));
  const shared = pileOf(s, 'a-3');
  assert.equal(shared.pile, null, 'it belongs to neither pile alone');

  const e = s.studios.find((x) => x.name === 'E.').place;
  const m = s.studios.find((x) => x.name === 'M.').place;
  assert.ok(Math.abs(shared.x - (e[0] + m[0]) / 2) < 1e-3, 'it sits between them');
  assert.ok(Math.abs(shared.y - (e[1] + m[1]) / 2) < 1e-3);

  const anchors = s.threads.filter((t) => t.anchor && t.from === 'a-3');
  assert.equal(anchors.length, 2, 'and both ends are drawn — without them it is an orphan in a gap');
});

test('someone whose whole week is collaborations still has a studio', () => {
  const evs = [person('a-1', ['E.']), person('a-2', ['E.', 'T.'])];
  const s = fold(evs, pastEnd(evs));
  assert.ok(s.studios.some((x) => x.name === 'T.'), 'T. deposited nothing alone, and still stands somewhere');
  assert.equal(s.threads.filter((t) => t.anchor).length, 2, 'so the shared work can hang from both');
});

test('a pile stops deepening at four — it is never a tally of who made most', () => {
  const busy = Array.from({ length: 12 }, (_, i) => person(`a-${i}`, ['E.']));
  const s = fold(busy, pastEnd(busy));
  const shown = new Set(s.cards.map((c) => `${c.x},${c.y}`));
  assert.equal(shown.size, 4, 'twelve cards, four visible steps');
  assert.equal(s.cards.filter((c) => c.buried).length, 8, 'the rest are under them, not beside them');
  assert.equal(s.studios[0].held, 12, 'the pile still knows what it holds');

  // and a quiet week and a loud one occupy the same room
  const quiet = fold([person('a-0', ['E.'])], pastEnd([person('a-0', ['E.'])]));
  const spread = (st) => Math.max(...st.cards.map((c) => c.x)) - Math.min(...st.cards.map((c) => c.x));
  assert.ok(spread(s) - spread(quiet) < 0.03, 'a busy studio is not a bigger one');
});

test('the arrangement in the log is where the studios stand', () => {
  const evs = [
    person('a-1', ['E.']), person('a-2', ['M.']),
    { e: 'arrange', night: 1, places: { 'E.': [0.2, 0.3], 'M.': [0.8, 0.7] } },
  ];
  const s = fold(evs, pastEnd(evs));
  assert.deepEqual(s.studios.find((x) => x.name === 'E.').place, [0.2, 0.3]);
  assert.deepEqual(s.studios.find((x) => x.name === 'M.').place, [0.8, 0.7]);
  assert.equal(pileOf(s, 'a-1').x, 0.2, 'and the card stands with its studio');

  // the latest arrangement wins; an earlier one is history
  const later = [...evs, { e: 'arrange', night: 2, places: { 'E.': [0.6, 0.6] } }];
  const s2 = fold(later, pastEnd(later));
  assert.deepEqual(s2.studios.find((x) => x.name === 'E.').place, [0.6, 0.6]);
  assert.deepEqual(s2.studios.find((x) => x.name === 'M.').place, s.studios.find((x) => x.name === 'M.').place,
    'someone the new arrangement does not mention keeps the place they had');
});

test('an arrangement is a fact in the log, so replay walks the map backwards too', () => {
  const evs = [
    person('a-1', ['E.']),
    { e: 'arrange', night: 1, places: { 'E.': [0.2, 0.2] } },
    person('a-2', ['M.']),
    { e: 'arrange', night: 2, places: { 'E.': [0.9, 0.9] } },
  ];
  const before = fold(evs, eventTime(1)); // just after the first arrangement
  const after = fold(evs, pastEnd(evs));
  assert.deepEqual(before.studios.find((x) => x.name === 'E.').place, [0.2, 0.2]);
  assert.deepEqual(after.studios.find((x) => x.name === 'E.').place, [0.9, 0.9]);
  assert.deepEqual(fold(evs, eventTime(1)), before, 'and every past state folds the same way twice');
});

test('a castle-scale table: the map holds where the scatter collapsed', () => {
  // 25 people, four nights, ~100 cards, a quarter of them shared — the density
  // the cohort reaches on day one, and the density that broke the old scatter
  // (measured then: 209 covered caption strips; the field was gone entirely).
  const people = Array.from({ length: 25 }, (_, i) => `p${i}.`);
  const evs = [];
  let n = 0;
  for (let night = 1; night <= 4; night++) {
    for (let i = 0; i < 25; i++) {
      const who = people[(night * 7 + i * 3) % people.length];
      // people keep working with whoever they clicked with, so a pairing
      // recurs rather than being drawn fresh every time
      const also = people[(people.indexOf(who) * 7 + 3) % people.length];
      const shared = i % 4 === 0 && also !== who;
      evs.push(person(`c-${++n}`, shared ? [who, also] : [who], 'work', night));
    }
  }
  const s = fold(evs, pastEnd(evs));
  assert.equal(s.cards.length, 100);
  assert.equal(s.studios.length, 25, 'twenty-five studios');

  // one pile is meant to overlap itself; between piles is where legibility lives
  const group = (c) => c.pile ?? `~${c.between}`;
  const shown = s.cards.filter((c) => !c.buried);
  const hit = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  let covered = 0;
  for (let j = 0; j < shown.length; j++) {
    for (let i = 0; i < j; i++) {
      if (group(shown[i]) === group(shown[j])) continue;
      if (hit(cardRect(shown[j]), captionStrip(shown[i]))) covered++;
    }
  }
  // what the map buys is places, not cards: a hundred works stand in a room of
  // studios rather than as a hundred separate things competing for the light
  const places = new Set(shown.map(group)).size;
  assert.ok(places < s.cards.length / 2, `a hundred works, ${places} places on the table`);
  assert.ok(covered < 25, `covered caption strips stay far below the scatter's 209 (was ${covered})`);

  // and every studio stands inside the light
  for (const st of s.studios) {
    assert.ok(st.place[0] > 0.02 && st.place[0] < 0.98 && st.place[1] > 0.02 && st.place[1] < 0.98, `${st.name} is on the table`);
  }
});
