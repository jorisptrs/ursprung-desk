// The truth. fold(events, t) → table state. Pure and deterministic: no DOM,
// no Date.now, no Math.random — same (events, t) in, the same table out, forever.
// Coordinates are normalized 0–1 against the field (D38); the renderer maps to pixels.
// Overlap is modeled in a canonical table (TABLE_ASPECT). The table is a map of
// studios: one pile per person, placed by the latest arrangement in the log, so
// position carries meaning again — whose work this is, and whose problem it turns
// out to share. Nothing moves while anyone is watching; a new arrangement is an
// appended fact, and the table simply stands somewhere else the next time it is
// drawn.

import { humansOf, CLAUDE } from './affinity.js';

export const SPACING = 1; // table-time units between consecutive events (D25)
export const eventTime = (i) => (i + 1) * SPACING;
export const pastEnd = (events) => eventTime(events.length - 1) + SPACING;

export const TABLE_ASPECT = 1.6; // canonical table proportions; the renderer maps 0–1 onto its own rect (Q33 open)

const STRATUM_DIM = 0.1; // older material sinks per night…
const STRATUM_FLOOR = 0.7; // …but never below reading light (eye-tuned ×2 2026-07-22)
const SCALES = { image: 1.15, video: 1.15, fold: 1.05, note: 0.8 }; // §5: subtle, nothing shouts

export const CARD_W = 0.24; // of the canonical short side, before scale — mirrors the renderer's sizing
export const NOMINAL_H = { image: 1.05, video: 0.85, model: 0.9, fold: 1.0, audio: 0.65, text: 0.85, code: 0.85, note: 0.42 };

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const c of str) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round4 = (v) => Math.round(v * 10000) / 10000;

// ---- overlap model (canonical units: table is TABLE_ASPECT × 1) ----

export function cardRect(card) {
  const w = CARD_W * card.scale;
  const h = w * (NOMINAL_H[card.artifact.media] ?? 0.9);
  const xc = card.x * TABLE_ASPECT;
  return { x1: xc - w / 2, y1: card.y - h / 2, x2: xc + w / 2, y2: card.y + h / 2 };
}

export function captionStrip(card) {
  const r = cardRect(card);
  if (card.artifact.media === 'note') return r; // the words are the card; protect them whole
  const h = r.y2 - r.y1;
  return { x1: r.x1, y1: r.y2 - h * 0.32, x2: r.x2, y2: r.y2 };
}

// ---- the map of studios (keeper's ruling 2026-07-23) ----
//
// The table is one pile per person, because a scatter stops being legible at
// about twenty-five cards and the cohort passes that on day one. It is also the
// proposal's own model made literal: Claude attends with a studio in the chain,
// and people wander in as they wander into each other's rooms.
//
// A card belongs to its HUMAN makers. Claude is never an anchor (§3): a card
// credited "E. + Claude" is E.'s work with Claude in service, so it lies in E.'s
// pile; only Claude's own work — its field notes, its failures — makes a pile of
// Claude's own, one studio among the rest rather than a reserved corner (amends
// D67). A work by two or more humans belongs to neither pile alone, so it floats
// between them, and its threads to each maker stay drawn: they are what explains
// where it is.

// Twenty-five studios and everything shared between them will not fit at
// reading size — measured, not guessed: at 0.65 the table holds about 34 objects
// and a full castle wants fifty. So a studio is drawn smaller than a card lies
// elsewhere, and a shared work smaller still: it is a token saying "these two
// made something", not a thing you read where it floats. Both open to full size
// when touched, which is where reading was always going to happen.
const PILE_SCALE = 0.55; // ~143px on a 1080p projection — above the D66 floor
const FLOAT_SCALE = 0.4; // a mark between two studios, read by opening it
const PILE_SHOWS = 4; // past the fourth, a pile is just a pile — never a tally of output
const PILE_STEP_X = 0.006; // the cascade of one pile, in canonical units
const PILE_STEP_Y = 0.008;

// A shared work is settled off the studios rather than dropped on the midpoint
// between its makers — that midpoint is very often exactly where somebody else
// is standing. Deterministic: a fixed number of steps, a hashed direction to
// break ties, no randomness.
// Measured on the castle table (?castle: 25 people, 101 cards, 27 shared
// works): 60 steps at 0.045 left 34 covered caption strips, 240 at 0.065 leaves
// 16. Clearance is bought with distance — the shared work is pushed further from
// the hands that made it, so its threads run longer. Capping that drift was
// tried and is worse on both counts (57 covered at a 0.16 cap), because 26
// studios and 19 shared places genuinely need the whole table.
const FLOAT_STEPS = 240;
const FLOAT_CLEAR = 0.065; // canonical gap it tries to keep from anything else

function settleFloats(floats, fixed) {
  for (let step = 0; step < FLOAT_STEPS; step++) {
    let moved = false;
    for (const f of floats) {
      let vx = 0;
      let vy = 0;
      const push = (ox, oy, need) => {
        const dx = f.cx - ox;
        const dy = f.cy - oy;
        const d = Math.hypot(dx, dy);
        if (d >= need) return;
        if (d < 1e-6) { // exactly on top: part along a settled direction
          const a = ((fnv1a(f.key) % 360) * Math.PI) / 180;
          vx += Math.cos(a) * need;
          vy += Math.sin(a) * need;
          moved = true;
          return;
        }
        vx += (dx / d) * (need - d) * 0.5;
        vy += (dy / d) * (need - d) * 0.5;
        moved = true;
      };
      for (const o of fixed) push(o.cx, o.cy, o.need + f.need);
      for (const o of floats) if (o !== f) push(o.cx, o.cy, o.need + f.need);
      // and it never strays far from the people who made it
      const dx = f.homeX - f.cx;
      const dy = f.homeY - f.cy;
      vx += dx * 0.06;
      vy += dy * 0.06;
      f.cx = clamp(f.cx + vx, 0.05 * TABLE_ASPECT, TABLE_ASPECT - 0.05 * TABLE_ASPECT);
      f.cy = clamp(f.cy + vy, 0.05, 0.95);
    }
    if (!moved) break;
  }
}

// Where a person stands when no arrangement has named them yet.
function fallbackPlace(name, index, total) {
  const rng = mulberry32(fnv1a(`${name}:studio`));
  const a = index * 2.399963229728653; // golden angle: a room, not a queue
  const r = 0.42 * Math.sqrt((index + 0.5) / Math.max(1, total));
  return [
    clamp(0.5 + r * Math.cos(a) + (rng() - 0.5) * 0.04, 0.09, 0.91),
    clamp(0.5 + r * Math.sin(a) + (rng() - 0.5) * 0.04, 0.09, 0.91),
  ];
}

export function fold(events, t) {
  const arrived = [];
  for (let i = 0; i < events.length; i++) {
    if (eventTime(i) <= t) arrived.push({ ev: events[i], i });
  }

  // One walk in stream order. Retires drop a card from the table; the pile it
  // was in simply closes up behind it.
  const live = [];
  let maxNight = 0;
  let places = null; // the latest arrangement at or before t
  for (const { ev, i } of arrived) {
    if (Number.isInteger(ev.night) && ev.night > maxNight) maxNight = ev.night;
    if (ev.e === 'arrange') {
      // arrangements accumulate: a night that moves three studios says only
      // those three, and everyone else keeps the place they already had
      places = { ...places, ...ev.places };
      continue;
    }
    if (ev.e === 'retire') {
      const at = live.findIndex((c) => c.id === ev.id);
      if (at >= 0) live.splice(at, 1);
      continue;
    }
    if (ev.e !== 'deposit') continue;
    const a = ev.artifact;
    const makers = humansOf(a);
    live.push({
      id: a.id,
      artifact: a,
      makers,
      pile: makers.length === 1 ? makers[0] : makers.length ? null : CLAUDE,
      night: ev.night,
      arrivedAt: eventTime(i),
    });
  }

  // Whose studios stand tonight, in the order the log first named them — so a
  // table with no arrangement yet is still a room. Everyone named on any card
  // gets one, not only those who deposited alone: someone whose whole week is
  // collaborations still has a studio, and a floating work needs both its ends
  // to have somewhere to hang from.
  const studios = [];
  for (const c of live) {
    for (const name of c.makers) if (!studios.includes(name)) studios.push(name);
    if (!c.makers.length && !studios.includes(CLAUDE)) studios.push(CLAUDE);
  }
  const at = new Map();
  studios.forEach((name, i) => {
    const said = places?.[name];
    at.set(name, Array.isArray(said) && said.length === 2 && said.every(Number.isFinite)
      ? [clamp(said[0], 0.06, 0.94), clamp(said[1], 0.06, 0.94)]
      : fallbackPlace(name, i, studios.length));
  });

  // Each pile cascades up-right, newest on top; past the fourth the cards stop
  // stepping, so depth is a placement rule and a pile never reads as a score.
  // Everything the same hands made together is one floating pile, for the same
  // reason: two people who keep working together make one place between them,
  // not a drift of separate cards.
  const depth = new Map();
  const floats = new Map(); // maker-set → the shared works of those hands
  for (const c of live) {
    const rng = mulberry32(fnv1a(c.id));
    c.rot = round4((rng() - 0.5) * 7);
    c.baseOpacity = c.artifact.kind === 'quest' ? 0.62 : 1;

    if (c.pile) {
      c.scale = (SCALES[c.artifact.media] ?? 1) * PILE_SCALE;
      const d = depth.get(c.pile) ?? 0;
      depth.set(c.pile, d + 1);
      c.depth = d;
      const shown = Math.min(d, PILE_SHOWS - 1);
      const [px, py] = at.get(c.pile);
      c.x = clamp(px + shown * PILE_STEP_X, 0.05, 0.95);
      c.y = clamp(py - shown * PILE_STEP_Y, 0.05, 0.95);
      c.buried = d >= PILE_SHOWS;
      continue;
    }
    c.scale = (SCALES[c.artifact.media] ?? 1) * FLOAT_SCALE;
    const key = [...c.makers].sort().join('+');
    c.between = key;
    if (!floats.has(key)) floats.set(key, []);
    floats.get(key).push(c);
  }

  // Where each shared pile settles: it starts between the hands that made it,
  // then is pushed clear of the studios and of the other shared piles.
  const half = (s) => (CARD_W * s * 0.5 + FLOAT_CLEAR);
  const fixed = studios.map((name) => {
    const [x, y] = at.get(name);
    return { cx: x * TABLE_ASPECT, cy: y, need: half(PILE_SCALE * 1.15) };
  });
  const nodes = [...floats.entries()].map(([key, group]) => {
    const anchors = group[0].makers.filter((m) => at.has(m));
    const hx = anchors.length ? anchors.reduce((s, m) => s + at.get(m)[0], 0) / anchors.length : 0.5;
    const hy = anchors.length ? anchors.reduce((s, m) => s + at.get(m)[1], 0) / anchors.length : 0.5;
    return { key, group, homeX: hx * TABLE_ASPECT, homeY: hy, cx: hx * TABLE_ASPECT, cy: hy, need: half(FLOAT_SCALE * 1.15) };
  }).sort((a, b) => a.key.localeCompare(b.key)); // a settled order, so the settle is settled
  settleFloats(nodes, fixed);

  for (const n of nodes) {
    n.group.forEach((c, d) => {
      c.depth = d;
      const shown = Math.min(d, PILE_SHOWS - 1);
      c.x = clamp(n.cx / TABLE_ASPECT + shown * PILE_STEP_X, 0.05, 0.95);
      c.y = clamp(n.cy - shown * PILE_STEP_Y, 0.05, 0.95);
      c.buried = d >= PILE_SHOWS;
    });
  }

  const cards = live;
  for (const c of cards) {
    const stratum = maxNight - c.night;
    c.stratum = stratum;
    c.opacity = round4(c.baseOpacity * Math.max(STRATUM_FLOOR, 1 - stratum * STRATUM_DIM));
    delete c.baseOpacity;
    c.x = round4(c.x);
    c.y = round4(c.y);
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  // A floating work is held by its makers' studios, and those threads are drawn
  // at rest: without them the card is an orphan in a gap. Every other thread
  // waits for its card to be picked up.
  const anchorThreads = [];
  for (const n of nodes) {
    const top = n.group[0];
    for (const m of top.makers) {
      if (!at.has(m)) continue;
      const [x, y] = at.get(m);
      anchorThreads.push({ from: top.id, toPlace: [round4(x), round4(y)], anchor: true, opacity: top.opacity });
    }
  }
  const threads = arrived
    .filter((x) => x.ev.e === 'thread' && byId.has(x.ev.from) && byId.has(x.ev.to))
    .map((x) => ({
      from: x.ev.from,
      to: x.ev.to,
      why: x.ev.why ?? null,
      night: x.ev.night,
      anchor: false,
      // D14 concretized: a thread fades with its dimmer end.
      opacity: round4(Math.min(byId.get(x.ev.from).opacity, byId.get(x.ev.to).opacity)),
    }));

  const studioList = studios.map((name) => ({ name, place: at.get(name).map(round4), held: depth.get(name) ?? 0 }));
  return { t, maxNight, cards, studios: studioList, threads: [...anchorThreads, ...threads] };
}
