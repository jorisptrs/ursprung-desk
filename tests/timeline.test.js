// The clock's whole action matrix as pure transitions — key spam included.
// Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, reduce, pacing, compressedEventMs,
  PASS_MS, REST_MS, BEAT_MS, EVENT_MIN_MS, EVENT_MAX_MS,
} from '../js/timeline.js';

const N = 5;
const run = (state, actions, n = N) => {
  const effectLog = [];
  for (const a of actions) {
    const r = reduce(state, a, n);
    state = r.state;
    effectLog.push(...r.effects);
  }
  return { state, effectLog };
};

const nights = [0, 0, 1, 1, 2]; // two night transitions
const fakeEvents = nights.map((night) => ({ night }));

test('deployed boot: pass sweeps the full stream, then rests live', () => {
  let s = initialState({ after: 'live' });
  let r = reduce(s, 'boot-pass', N);
  assert.equal(r.state.mode, 'compressed');
  assert.deepEqual([r.state.cursor, r.state.target], [0, N]);
  assert.deepEqual(r.effects, ['sync', 'drain']);
  s = run(r.state, Array(N).fill('played')).state;
  assert.equal(s.cursor, N);
  s = reduce(s, 'drained', N).state;
  assert.equal(s.mode, 'live');
  assert.equal(s.target, N);
});

test('rig replay rests held; step is then exhausted until reset', () => {
  let s = initialState({ after: 'held' });
  s = run(s, ['replay', ...Array(N).fill('played'), 'drained']).state;
  assert.equal(s.mode, 'held');
  assert.equal(s.cursor, N);
  assert.equal(reduce(s, 'step', N).effects.length, 0, 'nothing left to step');
});

test('step: deals one in held, snaps the in-flight card elsewhere (D78)', () => {
  let s = initialState({ after: 'held' });
  const r = reduce(s, 'step', N);
  assert.equal(r.state.target, 1);
  assert.deepEqual(r.effects, ['finish', 'drain'], 'a step first snaps any in-flight gesture');
  s = run(s, Array(10).fill('step')).state; // spam past the end
  assert.equal(s.target, N);
  const live = { ...s, mode: 'live' };
  assert.deepEqual(reduce(live, 'step', N).effects, ['finish'], 'mid-deal, space only skips ahead');
  assert.equal(reduce(live, 'step', N).state, live);
  const compressed = { ...s, mode: 'compressed' };
  assert.deepEqual(reduce(compressed, 'step', N).effects, ['finish']);
  assert.equal(reduce(compressed, 'step', N).state, compressed);
});

test('the scrub is plain steps: spamming step walks the stream, snapping each wait (D78)', () => {
  let s = { ...initialState({ after: 'live' }), mode: 'held', cursor: 0, target: 0 };
  for (let i = 1; i <= 3; i++) {
    const r = reduce(s, 'step', N);
    assert.equal(r.state.target, i);
    assert.deepEqual(r.effects, ['finish', 'drain'], 'each press snaps the pending wait and launches the next');
    s = reduce(r.state, 'played', N).state;
  }
  assert.equal(s.cursor, 3);
});

test('back is navigation: idle steps down, a pending card retreats, zero is a no-op (D78)', () => {
  const idle = { ...initialState({ after: 'live' }), mode: 'held', cursor: 3, target: 3 };
  let r = reduce(idle, 'back', N);
  assert.deepEqual([r.state.cursor, r.state.target], [2, 2]);
  assert.deepEqual(r.effects, ['sync'], 'instant — the leaving card is simply gone (D87)');
  const midFlight = { ...initialState({ after: 'live' }), mode: 'held', cursor: 2, target: 3 };
  r = reduce(midFlight, 'back', N);
  assert.deepEqual([r.state.cursor, r.state.target], [2, 2], 'the pending card retreats, nothing settled is taken');
  assert.deepEqual(r.effects, ['sync']);
  const zero = { ...initialState({ after: 'live' }), mode: 'held', cursor: 0, target: 0 };
  assert.equal(reduce(zero, 'back', N).state, zero, 'nothing laid, nothing to take back');
  assert.equal(reduce(zero, 'back', N).effects.length, 0);
});

test('back in auto still pauses first; the next press steps back (D78)', () => {
  const midPass = { ...initialState({ after: 'live' }), mode: 'compressed', cursor: 3, target: N };
  let r = reduce(midPass, 'back', N);
  assert.deepEqual([r.state.mode, r.state.target], ['held', 4], 'first ← stops right here, like d');
  assert.deepEqual(r.effects, ['finish']);
  const atRestLive = { ...initialState({ after: 'live' }), mode: 'live', cursor: N, target: N };
  r = reduce(atRestLive, 'back', N);
  assert.deepEqual([r.state.mode, r.state.target], ['held', N], 'at live rest ← only drops to manual');
  r = reduce(r.state, 'back', N);
  assert.deepEqual([r.state.cursor, r.state.target], [N - 1, N - 1], 'the second press takes the card');
  assert.deepEqual(r.effects, ['sync']);
});

test('d is pause/play: pause holds in place mid-deal, resume deals the rest (D78)', () => {
  const midPass = { ...initialState({ after: 'live' }), mode: 'compressed', cursor: 3, target: N };
  let r = reduce(midPass, 'pause', N);
  assert.deepEqual([r.state.mode, r.state.target], ['held', 4], 'the in-flight card lands; nothing clears');
  assert.deepEqual(r.effects, ['finish']);
  r = reduce({ ...r.state, cursor: 4 }, 'resume', N);
  assert.deepEqual([r.state.mode, r.state.target], ['compressed', N]);
  assert.deepEqual(r.effects, ['drain']);
  const done = { ...initialState({ after: 'live' }), mode: 'held', cursor: N, target: N };
  assert.equal(reduce(done, 'resume', N).state, done, 'nothing left: resume is a no-op (desk replays instead)');
  const heldAlready = { ...initialState({ after: 'live' }), mode: 'held', cursor: 2, target: 2 };
  assert.equal(reduce(heldAlready, 'pause', N).state, heldAlready, 'pause needs something running');
});

test('replay mid-replay restarts from empty (R spam is safe)', () => {
  let s = initialState({ after: 'held' });
  s = run(s, ['replay', 'played', 'played']).state;
  const r = reduce(s, 'replay', N);
  assert.deepEqual([r.state.cursor, r.state.target, r.state.mode], [0, N, 'compressed']);
  assert.deepEqual(r.effects, ['sync', 'drain']);
});

test('reset and end are instant scene changes, never motion', () => {
  let s = run(initialState({ after: 'held' }), ['step', 'step', 'played']).state;
  let r = reduce(s, 'reset', N);
  assert.deepEqual([r.state.cursor, r.state.target, r.state.mode], [0, 0, 'held']);
  assert.deepEqual(r.effects, ['sync']);
  r = reduce(s, 'end', N);
  assert.deepEqual([r.state.cursor, r.state.target, r.state.mode], [N, N, 'held']);
  assert.deepEqual(r.effects, ['sync']);
});

test('live toggle: arms the rest of the stream; toggling back pauses after the current gesture', () => {
  let s = initialState({ after: 'held' });
  let r = reduce(s, 'live-toggle', N);
  assert.equal(r.state.mode, 'live');
  assert.equal(r.state.target, N);
  assert.deepEqual(r.effects, ['drain']);
  // two gestures settle, a third is in flight (cursor 2, target 5)
  s = run(r.state, ['played', 'played']).state;
  r = reduce(s, 'live-toggle', N);
  assert.equal(r.state.mode, 'held');
  assert.equal(r.state.target, 3, 'the in-flight gesture finishes; nothing else launches');
  assert.deepEqual(r.effects, [], 'pausing is not a scene change');
});

test('appended: live plays it as it lands; held and compressed ignore until their transition', () => {
  const live = { ...initialState({ after: 'live' }), mode: 'live', cursor: N, target: N };
  const r = reduce(live, 'appended', N + 1);
  assert.equal(r.state.target, N + 1);
  assert.deepEqual(r.effects, ['drain']);
  const held = initialState({ after: 'held' });
  assert.equal(reduce(held, 'appended', N + 1).state, held);
  // a deposit landing mid-pass is picked up when the pass drains into live —
  // and drains then, not on the next poke
  let mid = { ...initialState({ after: 'live' }), mode: 'compressed', cursor: N, target: N };
  mid = reduce(mid, 'appended', N + 1).state;
  assert.equal(mid.target, N, 'compressed target is fixed for the take');
  const rested = reduce(mid, 'drained', N + 1);
  assert.equal(rested.state.mode, 'live');
  assert.equal(rested.state.target, N + 1);
  assert.deepEqual(rested.effects, ['drain'], 'resting into live plays what landed during the take');
  const quiet = reduce({ ...initialState({ after: 'live' }), mode: 'compressed', cursor: N, target: N }, 'drained', N);
  assert.deepEqual(quiet.effects, [], 'nothing waiting → nothing launches');
});

test('hide-flush mid-pass jumps to settled in the rest mode; no-op elsewhere', () => {
  const mid = { ...initialState({ after: 'live' }), mode: 'compressed', cursor: 2, target: N };
  const r = reduce(mid, 'hide-flush', N);
  assert.deepEqual([r.state.mode, r.state.cursor, r.state.target], ['live', N, N]);
  assert.deepEqual(r.effects, ['sync']);
  const held = initialState({ after: 'held' });
  assert.equal(reduce(held, 'hide-flush', N).state, held);
});

test('budget-first pacing: total pass time lands inside the D12 window as the seed grows', () => {
  for (const count of [3, 13, 19, 30]) {
    const events = Array.from({ length: count }, (_, i) => ({ night: Math.floor(i / 4) }));
    const per = compressedEventMs(events);
    assert.ok(per >= EVENT_MIN_MS && per <= EVENT_MAX_MS, `per-event ${per} out of clamp at n=${count}`);
    let beats = 0;
    for (let i = 1; i < count; i++) if (events[i].night !== events[i - 1].night) beats++;
    const total = REST_MS + beats * BEAT_MS + count * per;
    if (count >= 13) assert.ok(total <= 18000, `pass ${total}ms overruns D12 at n=${count}`);
  }
});

test('pacing shapes: rest before the first event, beats between nights, cadence as wait', () => {
  const compressed = { ...initialState({ after: 'live' }), mode: 'compressed' };
  const per = compressedEventMs(fakeEvents);
  assert.equal(pacing(compressed, fakeEvents, 0).delayBefore, REST_MS);
  assert.equal(pacing(compressed, fakeEvents, 1).delayBefore, 0);
  assert.equal(pacing(compressed, fakeEvents, 2).delayBefore, BEAT_MS, 'night 0→1');
  assert.equal(pacing(compressed, fakeEvents, 1).wait, per, 'the cadence lives in the hold after the placement');
  const live = { ...initialState({ after: 'live' }), mode: 'live' };
  assert.deepEqual(pacing(live, fakeEvents, 0), { delayBefore: 0, wait: 0 }, 'outside the pass a placement is immediate (D87)');
  assert.ok(PASS_MS >= 12000 && PASS_MS <= 18000, 'budget itself sits in the D12 window');
});
