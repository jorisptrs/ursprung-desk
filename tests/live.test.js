// Live pickup (D105): the torn-tail rule and the reader's manners — skip a bad
// line once, never halt, never retry; and recover rather than give up, because
// the table stands in a room for four days and the desk it watches may
// restart under it. Dev-only.

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

  // a card the stream will not take: unsigned, and it says so
  const unsigned = JSON.parse(JSON.stringify(card('m-002')));
  delete unsigned.artifact.people;
  h.state.body += `${JSON.stringify(unsigned)}\n`;
  await h.pickup.poll();
  assert.equal(h.warned.length, 2);
  assert.match(h.warned[1], /needs an author/);

  h.state.body += line('m-003');
  await h.pickup.poll();
  assert.equal(h.warned.length, 2, 'no bad line is ever re-read');
  assert.equal(h.stream.all().length, 2);
});

test('a duplicate id is already on the table, not damage', async () => {
  const h = harness(line('m-001'));
  await h.pickup.poll();
  h.state.body += line('m-001'); // the same card again
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 1);
  assert.equal(h.warned.length, 0, 'the card the line asked for is there — nothing to report');
});

test('a shrunk file is a new log: re-read from the top, and what is laid stays quiet', async () => {
  const h = harness(line('m-001') + line('m-002'));
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 2);

  h.state.body = ''; // truncated between takes
  await h.pickup.poll();
  assert.ok(!h.pickup.stopped(), 'the table keeps listening — the desk may just have restarted');
  assert.equal(h.pickup.seen(), 0, 'and it will read the next log from its first line');

  // the same two cards come back, then a third: only the third is new
  h.state.body = line('m-001') + line('m-002') + line('m-003');
  await h.pickup.poll();
  assert.deepEqual(h.stream.all().map((e) => e.artifact.id), ['m-001', 'm-002', 'm-003']);
  assert.equal(h.warned.length, 0, 'a card already on the table is not damage');
});

test('a desk that goes away is waited for, and says so once', async () => {
  const h = harness('', { ok: false, status: 404 });
  for (let i = 0; i < 5; i++) await h.pickup.poll();
  assert.ok(!h.pickup.stopped(), 'a missing desk is never given up on');
  assert.equal(h.timers.at(-1).ms, 5000, 'it backs off while missing');
  assert.equal(h.warned.length, 1, 'one word, not one per poll');
  assert.match(h.warned[0], /still listening/);

  h.state.ok = true;
  h.state.body = line('m-001');
  await h.pickup.poll();
  assert.equal(h.timers.at(-1).ms, 750, 'a read restores the tempo');
  assert.match(h.warned.at(-1), /is back/);
  assert.deepEqual(h.stream.all().map((e) => e.artifact.id), ['m-001']);
});

test('a fetch that throws is waited out too, not a crash', async () => {
  const h = harness(line('m-001'));
  h.state.fail = 'network down';
  await h.pickup.poll();
  await h.pickup.poll();
  assert.ok(!h.pickup.stopped());
  assert.match(h.warned.at(-1), /cannot read/);

  h.state.fail = null;
  await h.pickup.poll();
  assert.deepEqual(h.stream.all().map((e) => e.artifact.id), ['m-001'], 'it picks up where it left off');
});

test('stop() is final', async () => {
  const h = harness(line('m-001'));
  h.pickup.stop();
  await h.pickup.poll();
  assert.equal(h.stream.all().length, 0);
});

test('the reader carries every kind of fact, not only cards (D172)', async () => {
  // the room server writes a roster when the curator registers someone and when
  // a person renames themselves, so those lines reach the table this way too —
  // a reader that only understood deposits would have dropped the room's names
  const roster = `${JSON.stringify({ e: 'roster', night: 0, people: ['E.', 'M.'] })}\n`;
  const arrange = `${JSON.stringify({ e: 'arrange', night: 1, places: { 'E.': [0.3, 0.3] } })}\n`;
  const h = harness(roster + line('m-001') + arrange);
  await h.pickup.poll();
  assert.deepEqual(h.stream.all().map((e) => e.e), ['roster', 'deposit', 'arrange']);
  assert.deepEqual(h.warned, [], 'and says nothing about any of it');

  // a log read again from the top repeats its rosters; the fold dedupes by name,
  // so a re-read is quiet rather than an error the reader has to explain
  await h.pickup.poll();
  assert.equal(h.warned.length, 0);
});
