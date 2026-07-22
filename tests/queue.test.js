// The queue is D13's enforcement point — its serialization is machine truth,
// not taste. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, sleep } from '../js/queue.js';

test('strict jobs run one at a time, FIFO', async () => {
  const q = createQueue();
  const log = [];
  let concurrent = 0, maxConcurrent = 0;
  const job = (name, ms) => ({
    run: async () => {
      concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
      log.push(`${name}:start`);
      await sleep(ms);
      log.push(`${name}:end`);
      concurrent--;
    },
  });
  q.push(job('a', 20));
  q.push(job('b', 5));
  const { settled } = q.push(job('c', 5));
  await settled;
  assert.deepEqual(log, ['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  assert.equal(maxConcurrent, 1);
});

test('flush skips queued jobs; the running one settles on its own', async () => {
  const q = createQueue();
  const log = [];
  let signalStart;
  const aStarted = new Promise((r) => { signalStart = r; });
  const first = q.push({ run: async () => { log.push('a'); signalStart(); await sleep(20); } });
  q.push({ run: async () => log.push('b') });
  q.push({ run: async () => log.push('c') });
  await aStarted; // starts are microtask-deferred; flush only spares what has begun
  q.flush();
  await first.settled;
  await q.idle();
  assert.deepEqual(log, ['a'], 'flushed jobs must never run');
});

test('maxMs deadline: a never-resolving job cannot wedge the queue', async () => {
  const q = createQueue();
  const log = [];
  q.push({ run: () => new Promise(() => {}), maxMs: 20 }); // dangles forever
  const { settled } = q.push({ run: async () => log.push('next') });
  await settled;
  assert.deepEqual(log, ['next']);
});

test('a rejecting job neither wedges nor rejects the chain', async () => {
  const q = createQueue();
  const log = [];
  q.push({ run: async () => { throw new Error('gesture died'); } });
  const { settled } = q.push({ run: async () => log.push('after') });
  await settled;
  await q.idle();
  assert.deepEqual(log, ['after']);
});

test('idle() resolves only when everything has settled or been skipped', async () => {
  const q = createQueue();
  assert.equal(q.busy(), false);
  await q.idle(); // immediate when empty
  let done = false;
  q.push({ run: () => sleep(15).then(() => { done = true; }) });
  assert.equal(q.busy(), true);
  await q.idle();
  assert.equal(done, true);
  assert.equal(q.busy(), false);
});
