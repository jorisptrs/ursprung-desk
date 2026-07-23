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
//
// The table stands for four days in a room, so this reader recovers rather
// than gives up: a desk that is briefly not answering — restarted, replugged,
// off the wifi for a moment — must be picked up again when it returns, not
// wait for someone to notice a dead tab. So a missing file backs off and keeps
// asking, and a file that shrank (truncated between takes, or a fresh log) is
// simply read again from the top.
//
// A duplicate id is the one refusal that is never damage here. The door
// allocates ids from the log itself, so it cannot write one twice; a duplicate
// only ever means this reader is passing over a card that is already on the
// table, which is the outcome the line was asking for. It is skipped without a
// word, and needs no state to know when to expect it.
export function attachLivePickup(stream, {
  url = 'drop/stream.jsonl',
  intervalMs = 750,
  missIntervalMs = 5000,
  fetch: fetchImpl = null,
  warn = (msg) => console.warn(msg),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const get = fetchImpl ?? ((u, o) => fetch(u, o));
  let seen = 0;
  let quiet = false; // one word about a desk that went away, not one per poll
  let timer = null;
  let stopped = false;

  function stop() {
    stopped = true;
    if (timer) clearTimer(timer);
    timer = null;
  }

  function missed(msg) {
    if (!quiet) {
      quiet = true;
      warn(`desk: ${msg} — still listening`);
    }
    return missIntervalMs;
  }

  const duplicate = (err) => /duplicate id/.test(String(err?.message ?? err));

  async function poll() {
    if (stopped) return;
    let delay = intervalMs;
    try {
      const res = await get(url, { cache: 'no-store' });
      if (!res.ok) {
        delay = missed(`no ${url} (${res.status})`);
      } else {
        if (quiet) {
          quiet = false;
          warn(`desk: ${url} is back`);
        }
        const { lines } = parseJsonl(await res.text());
        if (lines.length < seen) seen = 0; // a shorter log is a new log: read it again
        for (let i = seen; i < lines.length; i++) {
          try {
            stream.append(JSON.parse(lines[i]));
          } catch (err) {
            if (duplicate(err)) continue; // already on the table; nothing to say
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
