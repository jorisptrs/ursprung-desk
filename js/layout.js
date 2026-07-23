// Affinity in, places out. The half of the map a reader must never do: asking
// anything to emit coordinates gives you clumps, overlaps, and a table that
// jumps every night. "Do not overlap" and "stay near where you were" are
// constraints, and constraints belong in code.
//
// Pure and deterministic — no Date.now, no Math.random, seeded from the names
// themselves. Same affinity in, same map out, forever; which is what lets the
// arrangement be an appended fact the fold can replay.

import { fnv1a, TABLE_ASPECT, clamp } from './geom.js';

// Canonical table units, as fold.js uses: x runs 0..TABLE_ASPECT, y runs 0..1.
// Places come out in 0..1 on both axes, which is what the arrange event carries.
const MARGIN = 0.09; // piles keep clear of the light's edge
// Every stack on the table is one atom holding the others off at its own size:
// a studio's pile is a bigger object than a shared work's, so the arm's length
// between them is the sum of their reaches, not one number for the whole room.
// Each is a little more than the stack's own half-diagonal in canonical units —
// a studio's pile measures about 0.104 corner to centre, a shared work's 0.079 —
// so two stacks at arm's length have air between them rather than a shared edge.
const REACH_STUDIO = 0.137;
const REACH_SHARED = 0.108;
const APART = REACH_STUDIO * 2; // two studios, the old single distance
const PULL = 0.035; // how hard a shared problem draws two studios together
const PUSH = 0.05; // how hard any two stacks hold each other off
// A shared work's place has a meaning the others' do not: it belongs between
// the hands that made it. So it is pulled to their midpoint every step, hard —
// and yields only where there is genuinely no room, which is the one case where
// being legible beats being exactly halfway.
const HOME = 0.09;
const STEPS = 240;


// Two ways to guess where a stack should start, for two different jobs.
//
// `ring` is for a whole-room act — the night's redraw, where every stack is
// placed at once: an equal-area spiral in the order the log named them, which
// starts the relaxation near a good answer and reads as a room rather than a
// queue. Measured: seeding a fresh castle this way ends at 1 covered caption
// strip against 12 from hashed berths, because 240 steps cannot undo a bad
// start. Its weakness is that every berth depends on how many others there are.
//
// `berths` is for an insertion — one stack arriving among stacks that are
// already right. Angle and radius are hashed **from the key alone**, so one more
// arrival moves nobody else's guess, which is what makes a new stack cost a
// nudge instead of a redraw. Same key, same berth, forever.
export function ring(keys) {
  const places = {};
  const n = Math.max(1, keys.length);
  keys.forEach((key, i) => {
    const a = i * 2.399963229728653; // golden angle, in radians
    const r = 0.5 * Math.sqrt((i + 0.5) / n); // spiral outward, equal-area
    places[key] = [
      clamp(0.5 + r * Math.cos(a), MARGIN, 1 - MARGIN),
      clamp(0.5 + r * Math.sin(a), MARGIN, 1 - MARGIN),
    ];
  });
  return places;
}

export function berths(keys) {
  const places = {};
  for (const key of keys) {
    const a = ((fnv1a(`${key}:angle`) % 100000) / 100000) * Math.PI * 2;
    const r = 0.46 * Math.sqrt((fnv1a(`${key}:radius`) % 100000) / 100000);
    places[key] = [
      clamp(0.5 + r * Math.cos(a), MARGIN, 1 - MARGIN),
      clamp(0.5 + r * Math.sin(a), MARGIN, 1 - MARGIN),
    ];
  }
  return places;
}

// The night's map. `previous` is last night's places — the map drifts from
// there rather than being redrawn from nothing, because people have to find
// their own studio in the morning. Anyone new gets a berth hashed from their
// name, so they land somewhere sensible before any affinity is known.
//
// A stack is either a person's studio (pass the name) or a work several hands
// made together (pass `{ key, of: [names] }`), and both are placed in the one
// relaxation — which is the only way either can be right, since a shared work
// wants to be between its makers and the makers want to be near what they are
// working on. Same stacks in, same map out; so laying another card on a pile
// that already stands changes nothing, and only a stack that did not exist
// before costs a rearrangement.
export function arrange(people, pairs = [], previous = {}, { steps = STEPS, drift = 0.22, seed = 'ring' } = {}) {
  const seen = new Set();
  const nodes = [];
  for (const n of people ?? []) {
    const key = String((typeof n === 'string' ? n : n?.key) ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const of = typeof n === 'string' || !Array.isArray(n?.of) ? null : n.of.map((m) => String(m).trim());
    nodes.push({ key, of: of?.length ? of : null, reach: of?.length ? REACH_SHARED : REACH_STUDIO });
  }
  const names = nodes.map((n) => n.key);
  const node = new Map(nodes.map((n) => [n.key, n]));
  if (!names.length) return {};
  if (names.length === 1) return { [names[0]]: [0.5, 0.5] };

  const seeded = seed === 'stable' ? berths(names) : ring(names);
  const start = {};
  for (const n of nodes) {
    const was = previous[n.key];
    if (Array.isArray(was) && was.length === 2 && was.every((v) => Number.isFinite(v))) {
      start[n.key] = [clamp(was[0], 0, 1), clamp(was[1], 0, 1)];
      continue;
    }
    // New tonight. On an insertion, a work several hands made starts between
    // those hands where they already stand — that is its whole meaning, and
    // starting it there is what keeps the relaxation from dragging it across
    // the room. On a whole-room redraw nobody stands anywhere yet, so it takes a
    // berth like everyone else and the midpoint pull walks it home: measured, a
    // castle seeded that way ends at 1 covered caption strip against 6.
    const hands = seed === 'stable' ? (n.of ?? []).map((m) => previous[m]).filter(Boolean) : [];
    start[n.key] = hands.length
      ? [clamp(hands.reduce((a, [x]) => a + x, 0) / hands.length, MARGIN, 1 - MARGIN),
         clamp(hands.reduce((a, [, y]) => a + y, 0) / hands.length, MARGIN, 1 - MARGIN)]
      : seeded[n.key];
  }

  // canonical space, so distances read the same across the table's width
  const at = new Map(names.map((n) => [n, [start[n][0] * TABLE_ASPECT, start[n][1]]]));
  const known = new Set(names);
  const edges = pairs.filter((p) => p && known.has(p.a) && known.has(p.b) && p.a !== p.b);

  for (let step = 0; step < steps; step++) {
    const cool = 1 - step / steps; // settle rather than oscillate
    const move = new Map(names.map((n) => [n, [0, 0]]));

    // every studio holds every other off, hardest when they are on top of each other
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [ax, ay] = at.get(names[i]);
        const [bx, by] = at.get(names[j]);
        let dx = ax - bx;
        let dy = ay - by;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { // exactly coincident: part them along a settled direction
          const a = ((fnv1a(names[i] + names[j]) % 360) * Math.PI) / 180;
          dx = Math.cos(a); dy = Math.sin(a); d = 1e-6;
        }
        const apart = node.get(names[i]).reach + node.get(names[j]).reach;
        if (d >= apart) continue;
        const f = (PUSH * (apart - d)) / apart;
        const ux = dx / d;
        const uy = dy / d;
        move.get(names[i])[0] += ux * f;
        move.get(names[i])[1] += uy * f;
        move.get(names[j])[0] -= ux * f;
        move.get(names[j])[1] -= uy * f;
      }
    }

    // and a work made by several hands is drawn to the middle of those hands
    for (const n of nodes) {
      if (!n.of) continue;
      const hands = n.of.map((m) => at.get(m)).filter(Boolean);
      if (!hands.length) continue;
      const hx = hands.reduce((a, [x]) => a + x, 0) / hands.length;
      const hy = hands.reduce((a, [, y]) => a + y, 0) / hands.length;
      const [cx, cy] = at.get(n.key);
      move.get(n.key)[0] += (hx - cx) * HOME;
      move.get(n.key)[1] += (hy - cy) * HOME;
    }

    // and a shared problem draws two of them back together
    for (const e of edges) {
      const [ax, ay] = at.get(e.a);
      const [bx, by] = at.get(e.b);
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.hypot(dx, dy);
      if (d < APART) continue; // near enough; do not stack them
      const f = PULL * Math.min(1, Math.max(0, e.weight)) * (d - APART);
      move.get(e.a)[0] += (dx / d) * f;
      move.get(e.a)[1] += (dy / d) * f;
      move.get(e.b)[0] -= (dx / d) * f;
      move.get(e.b)[1] -= (dy / d) * f;
    }

    for (const name of names) {
      const p = at.get(name);
      const m = move.get(name);
      p[0] = clamp(p[0] + m[0] * cool, MARGIN * TABLE_ASPECT, TABLE_ASPECT - MARGIN * TABLE_ASPECT);
      p[1] = clamp(p[1] + m[1] * cool, MARGIN, 1 - MARGIN);
    }
  }

  // A night moves a studio a little, never across the room: the map drifts, so
  // your pile is where you left it, only nearer the people you turned out to
  // share a problem with.
  const places = {};
  for (const name of names) {
    const [cx, cy] = at.get(name);
    let x = cx / TABLE_ASPECT;
    let y = cy;
    const was = previous[name];
    if (Array.isArray(was) && was.length === 2 && was.every((v) => Number.isFinite(v))) {
      const dx = x - was[0];
      const dy = y - was[1];
      const d = Math.hypot(dx, dy);
      if (d > drift) {
        x = was[0] + (dx / d) * drift;
        y = was[1] + (dy / d) * drift;
      }
    }
    places[name] = [Number(clamp(x, MARGIN, 1 - MARGIN).toFixed(4)), Number(clamp(y, MARGIN, 1 - MARGIN).toFixed(4))];
  }
  return places;
}

// A pile opened under a hand (D144/D161): every card shown whole, a thin margin
// between them, and no more room taken than that needs. The order is the order
// they were made, reading left to right and top to bottom, so opening a studio
// is following how the work went rather than reading a heap. Rows are filled to
// `width` and then wrapped, and each row is as tall as its tallest card, since a
// photograph and a note are not one size. Sizes in, offsets from the block's
// centre out. Pure — no DOM, no clock.
export function packSpread(sizes, gap = 8, width = Infinity) {
  const list = (sizes ?? []).filter((s) => s && s.w > 0 && s.h > 0);
  if (!list.length) return { offsets: [], w: 0, h: 0 };

  const rows = [[]];
  let run = 0;
  for (const c of list) {
    const row = rows[rows.length - 1];
    const need = row.length ? run + gap + c.w : c.w;
    if (row.length && need > width) {
      rows.push([c]);
      run = c.w;
      continue;
    }
    row.push(c);
    run = need;
  }

  const rowW = rows.map((r) => r.reduce((s, c) => s + c.w, 0) + gap * (r.length - 1));
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.h)));
  const h = rowH.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
  const offsets = [];
  let y = -h / 2;
  rows.forEach((row, ri) => {
    let x = -rowW[ri] / 2;
    for (const c of row) {
      offsets.push({ dx: x + c.w / 2, dy: y + rowH[ri] / 2 });
      x += c.w + gap;
    }
    y += rowH[ri] + gap;
  });
  return { offsets, w: Math.max(...rowW), h };
}
