// Live pickup (D105): the table watches the drop file the MCP door writes.
// Only under ?live on a locally-served table — never the deployed link, and
// nothing here keys off the rig. Events arrive complete (the server already
// allocated m-###/night), so this is a reader, not a door: it appends what it
// finds and never invents anything.
//
// The torn-tail rule lives here and the server reads with the same function —
// one definition of "a whole line", both sides of the file.

// Everything up to and including the last newline is whole; the remainder is a
// line still being written and waits for its newline. Blank lines are nothing.
export function parseJsonl(text) {
  const end = String(text ?? '').lastIndexOf('\n');
  if (end < 0) return { lines: [], consumed: 0 };
  const lines = String(text).slice(0, end).split('\n').filter((l) => l.trim());
  return { lines, consumed: end + 1 };
}

// A damaged or refused line is skipped with one dry warn and never retried —
// transport damage is not a coerced deposit, and pickup never halts on it.
// Three straight missing-file polls stop the poller for good (a hand-typed
// ?live on a static host self-heals into silence).
export function attachLivePickup(stream, {
  url = 'drop/stream.jsonl',
  intervalMs = 750,
  missIntervalMs = 5000,
  maxMisses = 3,
  fetch: fetchImpl = null,
  warn = (msg) => console.warn(msg),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const get = fetchImpl ?? ((u, o) => fetch(u, o));
  let seen = 0;
  let misses = 0;
  let timer = null;
  let stopped = false;

  function stop() {
    stopped = true;
    if (timer) clearTimer(timer);
    timer = null;
  }

  function missed(msg) {
    misses += 1;
    if (misses < maxMisses) return missIntervalMs;
    warn(`desk: ${msg} — live pickup stopped`);
    stop();
    return null;
  }

  async function poll() {
    if (stopped) return;
    let delay = intervalMs;
    try {
      const res = await get(url, { cache: 'no-store' });
      if (!res.ok) {
        delay = missed(`no ${url} (${res.status})`);
      } else {
        misses = 0;
        const { lines } = parseJsonl(await res.text());
        if (lines.length < seen) { // rewritten between takes — this reader is done
          warn(`desk: ${url} shrank — live pickup stopped`);
          stop();
          return;
        }
        for (let i = seen; i < lines.length; i++) {
          try {
            stream.append(JSON.parse(lines[i]));
          } catch (err) {
            warn(`desk: drop line ${i + 1} skipped — ${err?.message ?? err}`);
          }
        }
        seen = lines.length; // bad lines are passed, never retried
      }
    } catch (err) {
      delay = missed(`cannot read ${url} (${err?.message ?? err})`);
    }
    if (!stopped && delay != null) timer = setTimer(poll, delay);
  }

  timer = setTimer(poll, 0);
  return { stop, poll, seen: () => seen, stopped: () => stopped };
}
