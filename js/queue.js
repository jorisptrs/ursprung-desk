// The one line all motion stands in (D13). Serializes opaque async jobs —
// arrivals, thread draws, later flips — knowing nothing of events or pixels.
// Strictly one at a time: the next job starts when the current one settles.
// flush() drops jobs that have not started; the running one is its owner's to
// cancel. maxMs is the hard deadline after which the queue moves on
// regardless — nothing wedges it.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createQueue() {
  let gate = Promise.resolve(); // resolves when the next job may start
  let inFlight = 0;
  let epoch = 0;
  let idleResolvers = [];

  const maybeIdle = () => {
    if (inFlight > 0) return;
    for (const r of idleResolvers) r();
    idleResolvers = [];
  };

  function push(job) {
    // job: { run: () => Promise, maxMs?: ms }
    const myEpoch = epoch;
    inFlight++;
    const prev = gate;
    let open;
    gate = new Promise((r) => { open = r; });

    const settled = prev
      .then(() => {
        if (myEpoch !== epoch) return; // flushed while queued: skip, never run
        const run = Promise.resolve().then(job.run).catch(() => {});
        return job.maxMs != null ? Promise.race([run, sleep(job.maxMs)]) : run;
      })
      .finally(() => {
        open();
        inFlight--;
        maybeIdle();
      });

    return { settled };
  }

  return {
    push,
    flush: () => { epoch++; },
    idle: () => (inFlight === 0 ? Promise.resolve() : new Promise((r) => idleResolvers.push(r))),
    busy: () => inFlight > 0,
  };
}
