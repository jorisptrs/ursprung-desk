// Live pickup (D105): the torn-tail rule and the reader's manners — skip a bad
// line once, never halt, never retry; stop on a rewrite or a vanished file.
// Dev-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonl, attachLivePickup } from '../js/live.js';
import { createStream } from '../js/stream.js';

const card = (id, night = 1) => ({
  e: 'deposit', night,
  artifact: { id, media: 'note', kind: 'work', title: id, people: ['M.'], provenance: 'mcp', visibility: 'public', excerpt: { form: 'words', text: id } },
});
const line = (id, night) => `${JSON.stringify(card(id, night))}\n`;

test('only a newline makes a line whole', () => {
  assert.deepEqual(parseJsonl(''), { lines: [], consumed: 0 });
  assert.deepEqual(parseJsonl('{"a":1}'), { lines: [], consumed: 0 }, 'a line still being written waits');
  assert.deepEqual(parseJsonl('{"a":1}\n'), { lines: ['{"a":1}'], consumed: 8 });
  const torn = '{"a":1}\n{"b":2}\n{"c":3';
  assert.deepEqual(parseJsonl(torn).lines, ['{"a":1}', '{"b":2}'], 'the torn tail is not read');
  assert.equal(parseJsonl(torn).consumed, 16);
  assert.deepEqual(parseJsonl('{"a":1}\n\n\n{"b":2}\n').lines, ['{"a":1}', '{"b":2}'], 'blank lines are nothing');
  assert.deepEqual(parseJsonl(null), { lines: [], consumed: 0 });
});

// A poller wired to stubs: nothing schedules itself, poll() is called by hand.
function harness(body, { ok = true, status = 200 } = {}) {
  const stream = createStream();
  const warned = [];
  const timers = [];
  const state = { body, ok, status, calls: 0, fail: null };
  const pickup = attachLivePickup(stream, {
    fetch: async () => {
      state.calls += 1;
      if (state.fail) throw new Error(state.fail);
      return { ok: state.ok, status: state.status, text: async () => state.body };
    },
    warn: (m) => warned.push(m),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  return { stream, warned, timers, state, pickup };
}

test('new lines are appended in order, once each', async () => {
  const h = harness(line('m-001'));
  await h.pickup.poll();
  assert.deepEqual(h.stream.all().map((e) => e.artifact.id), ['m-001']);
  assert.equal(h.pickup.seen(), 1);

  await h.pickup.poll(); // same body — nothing new
  assert.equal(h.stream.all().length, 1, 'a line is never appended twice');

  h.state.body += line('m-002');
  await h.pickup.poll();
  assert.deepEqual(h.stream.all().map((e) => e.artifact.id), ['m-001', 'm-002']);
  assert.equal(h.warned.length, 0);
});

test('a torn tail waits, then lands whole', async () => {
  const h = harness(`${line('m-001')}{"e":"deposit","nig`);
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 1);
  h.state.body = line('m-001') + line('m-002');
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 2);
  assert.equal(h.warned.length, 0, 'an unfinished line was never damage');
});

test('a damaged or refused line is skipped once, warned once, and never retried', async () => {
  const h = harness(`not json\n${line('m-001')}`);
  await h.pickup.poll();
  assert.equal(h.warned.length, 1);
  assert.match(h.warned[0], /skipped/);
  assert.deepEqual(h.stream.all().map((e) => e.artifact.id), ['m-001'], 'pickup never halts on one bad line');

  h.state.body += line('m-001'); // a duplicate id: the stream refuses it
  await h.pickup.poll();
  assert.equal(h.warned.length, 2);
  assert.match(h.warned[1], /duplicate id/);

  h.state.body += line('m-003');
  await h.pickup.poll();
  assert.equal(h.warned.length, 2, 'no bad line is ever re-read');
  assert.equal(h.stream.all().length, 2);
});

test('a rewritten (shrunk) file stops the reader — the take was reset', async () => {
  const h = harness(line('m-001') + line('m-002'));
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 2);
  h.state.body = '';
  await h.pickup.poll();
  assert.match(h.warned[0], /shrank/);
  assert.ok(h.pickup.stopped());
  const before = h.state.calls;
  await h.pickup.poll();
  assert.equal(h.state.calls, before, 'a stopped reader does not poll again');
});

test('three straight misses stop the reader; any read resets the count', async () => {
  const h = harness('', { ok: false, status: 404 });
  await h.pickup.poll();
  await h.pickup.poll();
  assert.ok(!h.pickup.stopped(), 'two misses are patience');
  assert.equal(h.timers.at(-1).ms, 5000, 'and it backs off while missing');
  h.state.ok = true;
  h.state.body = line('m-001');
  await h.pickup.poll();
  assert.equal(h.timers.at(-1).ms, 750, 'a read restores the tempo');

  h.state.ok = false;
  for (let i = 0; i < 3; i++) await h.pickup.poll();
  assert.ok(h.pickup.stopped());
  assert.match(h.warned.at(-1), /live pickup stopped/);
});

test('a fetch that throws counts as a miss, not a crash', async () => {
  const h = harness(line('m-001'));
  h.state.fail = 'network down';
  await h.pickup.poll();
  await h.pickup.poll();
  await h.pickup.poll();
  assert.ok(h.pickup.stopped());
  assert.match(h.warned.at(-1), /cannot read/);
});

test('stop() is final', async () => {
  const h = harness(line('m-001'));
  h.pickup.stop();
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 0);
});
