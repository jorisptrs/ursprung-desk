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
import { TABLE_ASPECT, clamp, round4, fnv1a, mulberry32 } from './geom.js';
import { arrange } from './layout.js';

export const SPACING = 1; // table-time units between consecutive events (D25)
export const eventTime = (i) => (i + 1) * SPACING;
export const pastEnd = (events) => eventTime(events.length - 1) + SPACING;

// the primitives live in geom.js so the fold may call the solver (see there)
export { TABLE_ASPECT, fnv1a, mulberry32 } from './geom.js';

// D14 is retired (keeper's ruling): nothing on this table is translucent. A card
// lies at full strength however old it is, and an opened pile is one brightness
// throughout. `stratum` stays — it is a true fact about the log — but it no
// longer reaches the light. What is being read is marked by dimming everything
// else (D149), which is one meaning on one channel instead of two.
const SCALES = { image: 1.15, video: 1.15, fold: 1.05, note: 0.8 }; // §5: subtle, nothing shouts

export const CARD_W = 0.24; // of the canonical short side, before scale — mirrors the renderer's sizing
export const NOMINAL_H = { image: 1.05, video: 0.85, model: 0.9, fold: 1.0, audio: 0.65, text: 0.85, code: 0.85, note: 0.42 };


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
// What it costs to place a stack the arrangement has not heard of yet — a
// person's first card, or the first work two hands made together. Fewer steps
// than a night's redraw and a tight drift cap, because this is a newcomer
// finding room among stacks that are already right, not the room being redrawn.
const SETTLE_STEPS = 120;
const SETTLE_DRIFT = 0.07;
const PILE_SHOWS = 4; // past the fourth, a pile is just a pile — never a tally of output
// The step of the cascade, as a fraction of the table. Set against the card's
// own size rather than picked: a laid pile card is 0.0825 of the table wide and
// 0.119 tall, so these are about a seventh of it each way — enough that every
// card under the top one shows an edge, and a pile of four reads as four from
// across a room rather than as one card with a shadow.
const PILE_STEP_X = 0.008;
const PILE_STEP_Y = 0.011;
// A pile cascades around its studio's place rather than away from it, so the
// place is the middle of the stack: it is where the studio's mark stands, where
// the threads land, and where the next card arrives.
const cascade = (d, held) => Math.min(d, PILE_SHOWS - 1) - (Math.min(held, PILE_SHOWS) - 1) / 2;



// Where a person stands when no arrangement has named them yet.

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
  const enrolled = []; // the cohort the curator registered, in the order they were
  for (const { ev, i } of arrived) {
    if (Number.isInteger(ev.night) && ev.night > maxNight) maxNight = ev.night;
    if (ev.e === 'arrange') {
      // arrangements accumulate: a night that moves three studios says only
      // those three, and everyone else keeps the place they already had
      places = { ...places, ...ev.places };
      continue;
    }
    if (ev.e === 'roster') {
      for (const name of ev.people) {
        const clean = String(name).trim();
        if (clean && !enrolled.includes(clean)) enrolled.push(clean);
      }
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
  // Everyone the curator registered stands here from the first moment, in the
  // order they were registered; the log's own names follow.
  const studios = [...enrolled];
  for (const c of live) {
    for (const name of c.makers) if (!studios.includes(name)) studios.push(name);
    if (!c.makers.length && !studios.includes(CLAUDE)) studios.push(CLAUDE);
  }
  // Every stack on the table, before any of them is placed: a studio for each
  // person, and one shared place for each set of hands that worked together.
  const floats = new Map(); // maker-set → the shared works of those hands
  for (const c of live) {
    if (c.pile) continue;
    const key = [...c.makers].sort().join(' + ');
    c.between = key;
    if (!floats.has(key)) floats.set(key, { of: [...c.makers].sort(), group: [] });
    floats.get(key).group.push(c);
  }
  const stacks = [
    ...studios,
    ...[...floats.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, f]) => ({ key, of: f.of })),
  ];

  // Where each stands. The arrangement in the log is authoritative for every
  // stack it names; a stack it does not name is one that came into existence
  // since — a person's first card, or the first work two hands made together —
  // and the same solver places it among the others, seeded from where they
  // already are. So a new stack costs a small rearrangement and another card on
  // a pile that already stands costs nothing at all: the room was reserved when
  // the stack began, and the fold's input has not changed.
  const stated = {};
  for (const stack of stacks) {
    const key = typeof stack === 'string' ? stack : stack.key;
    const said = places?.[key];
    if (Array.isArray(said) && said.length === 2 && said.every(Number.isFinite)) {
      stated[key] = [clamp(said[0], 0.06, 0.94), clamp(said[1], 0.06, 0.94)];
    }
  }
  // The affinity the log already carries, so a stack the arrangement has not
  // heard of does not land beside a stranger: two people who made something
  // together belong near each other, and the fold can see that without asking
  // anyone. Deliberately unweighted — **that** they worked together, never how
  // often — because a count grows with every card and the table must not move
  // when a card is laid on a pile that already stands. How much a pair's history
  // should weigh is a judgment for the night's redraw, not for the fold.
  const ties = [];
  for (const { of } of floats.values()) {
    for (let i = 0; i < of.length; i++) {
      for (let j = i + 1; j < of.length; j++) ties.push({ a: of[i], b: of[j], weight: 1 });
    }
  }
  const settled = stacks.length && stacks.length > Object.keys(stated).length
    ? arrange(stacks, ties, stated, { steps: SETTLE_STEPS, drift: SETTLE_DRIFT, seed: 'stable' })
    : stated;
  const at = new Map(stacks.map((stack) => {
    const key = typeof stack === 'string' ? stack : stack.key;
    return [key, settled[key] ?? stated[key] ?? [0.5, 0.5]];
  }));

  // How deep each pile ends up, counted before anything is placed, so the
  // cascade can be centred on the studio rather than trailing off it.
  const held = new Map();
  for (const c of live) if (c.pile) held.set(c.pile, (held.get(c.pile) ?? 0) + 1);

  // Each pile cascades up-right, newest on top; past the fourth the cards stop
  // stepping, so depth is a placement rule and a pile never reads as a score.
  // Everything the same hands made together is one floating pile, for the same
  // reason: two people who keep working together make one place between them,
  // not a drift of separate cards.
  const depth = new Map();
  for (const c of live) {
    const rng = mulberry32(fnv1a(c.id));
    c.rot = round4((rng() - 0.5) * 7);
    const key = c.pile ?? c.between;
    c.scale = (SCALES[c.artifact.media] ?? 1) * (c.pile ? PILE_SCALE : FLOAT_SCALE);
    const d = depth.get(key) ?? 0;
    depth.set(key, d + 1);
    c.depth = d;
    const total = c.pile ? (held.get(key) ?? 1) : floats.get(key).group.length;
    const shown = cascade(d, total);
    const [px, py] = at.get(key);
    c.x = clamp(px + shown * PILE_STEP_X, 0.05, 0.95);
    c.y = clamp(py - shown * PILE_STEP_Y, 0.05, 0.95);
    c.buried = d >= PILE_SHOWS;
  }

  const cards = live;
  for (const c of cards) {
    c.stratum = maxNight - c.night;
    c.opacity = 1;
    c.x = round4(c.x);
    c.y = round4(c.y);
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  // A floating work is held by its makers' studios, and those threads are drawn
  // at rest: without them the card is an orphan in a gap. Every other thread
  // waits for its card to be picked up.
  const anchorThreads = [];
  for (const { group } of floats.values()) {
    const top = group[0];
    for (const m of top.makers) {
      if (!at.has(m)) continue;
      const [x, y] = at.get(m);
      anchorThreads.push({ from: top.id, to: null, toStack: m, toPlace: [round4(x), round4(y)], anchor: true, opacity: top.opacity });
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
  // where every stack stands — studios and shared places alike — so the next
  // arrangement can be seeded from this one rather than from nothing
  const stackPlaces = Object.fromEntries([...at].map(([key, p]) => [key, p.map(round4)]));
  return { t, maxNight, cards, studios: studioList, places: stackPlaces, threads: [...anchorThreads, ...threads] };
}
