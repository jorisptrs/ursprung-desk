// Which night it is (BRIEF §9). Everything else the desk works out for itself —
// an id from the log, a place from the arrangement, an author from the token —
// but no amount of reading the log tells you that yesterday ended. Both doors
// lay a card on whatever night the log is already on, so without this every
// card of a four-day retreat would arrive on night 0 and the table would never
// break into the waves it is built to show.
//
//   node mcp/night.mjs        what night it is
//   node mcp/night.mjs next   the next night begins
//
// One appended fact, like everything else: the log is never rewritten, and a
// night may only move forward — a night that went backwards would re-date every
// card laid after it. Step 7 will offer the same thing from a Claude session,
// where the rest of the keeper's morning already happens; this is the version
// that works before there is a session at all.

import { existsSync, readFileSync } from 'node:fs';

import { appendEvent, dropFileIn, isMainModule, ROOT } from './core.mjs';

const root = process.env.DESK_ROOT || ROOT;
const say = (msg = '') => process.stdout.write(`${msg}\n`);

export function nightOf(root_ = root) {
  const file = dropFileIn(root_);
  if (!existsSync(file)) return 0;
  let night = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (Number.isInteger(ev.night) && ev.night > night) night = ev.night;
    } catch { /* a torn tail is not a night */ }
  }
  return night;
}

export function beginNight(root_ = root) {
  const next = nightOf(root_) + 1;
  appendEvent(root_, { e: 'night', night: next });
  return next;
}

if (isMainModule(import.meta.url)) {
  const [what] = process.argv.slice(2);
  if (!what) {
    const night = nightOf();
    say(night === 0 ? 'the log has not opened a night yet' : `night ${night}`);
    say('  node mcp/night.mjs next   the next night begins');
  } else if (what === 'next') {
    say(`night ${beginNight()} · cards laid from now on belong to it`);
  } else {
    say('node mcp/night.mjs [next]');
    process.exitCode = 1;
  }
}
