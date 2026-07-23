// Affinity in, places out. The half of the map a reader must never do: asking
// anything to emit coordinates gives you clumps, overlaps, and a table that
// jumps every night. "Do not overlap" and "stay near where you were" are
// constraints, and constraints belong in code.
//
// Pure and deterministic — no Date.now, no Math.random, seeded from the names
// themselves. Same affinity in, same map out, forever; which is what lets the
// arrangement be an appended fact the fold can replay.

import { fnv1a, mulberry32, TABLE_ASPECT } from './fold.js';

// Canonical table units, as fold.js uses: x runs 0..TABLE_ASPECT, y runs 0..1.
// Places come out in 0..1 on both axes, which is what the arrange event carries.
const MARGIN = 0.09; // piles keep clear of the light's edge
const APART = 0.2; // canonical distance below which two studios crowd each other
const PULL = 0.035; // how hard a shared problem draws two studios together
const PUSH = 0.05; // how hard any two studios hold each other off
const STEPS = 240;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A first table with nothing to go on: everyone on a ring, in the order the log
// first named them, spaced by the golden angle so no two crowd the same arc.
// Deterministic, and roomy enough that the first night reads as a room rather
// than a queue.
export function ring(people) {
  const places = {};
  const n = Math.max(1, people.length);
  people.forEach((name, i) => {
    const a = i * 2.399963229728653; // golden angle, in radians
    const r = 0.5 * Math.sqrt((i + 0.5) / n); // spiral outward, equal-area
    places[name] = [
      clamp(0.5 + r * Math.cos(a), MARGIN, 1 - MARGIN),
      clamp(0.5 + r * Math.sin(a), MARGIN, 1 - MARGIN),
    ];
  });
  return places;
}

// The night's map. `previous` is last night's places — the map drifts from
// there rather than being redrawn from nothing, because people have to find
// their own studio in the morning. Anyone new gets a berth hashed from their
// name, so they land somewhere sensible before any affinity is known.
export function arrange(people, pairs = [], previous = {}, { steps = STEPS, drift = 0.22 } = {}) {
  const names = [...new Set(people.filter((n) => typeof n === 'string' && n.trim()))].map((n) => n.trim());
  if (!names.length) return {};
  if (names.length === 1) return { [names[0]]: [0.5, 0.5] };

  const seeded = ring(names);
  const start = {};
  for (const name of names) {
    const was = previous[name];
    if (Array.isArray(was) && was.length === 2 && was.every((v) => Number.isFinite(v))) {
      start[name] = [clamp(was[0], 0, 1), clamp(was[1], 0, 1)];
      continue;
    }
    // new tonight: a berth of their own, jittered off the ring so two arrivals
    // never land on one spot
    const rng = mulberry32(fnv1a(`${name}:berth`));
    const [rx, ry] = seeded[name];
    start[name] = [clamp(rx + (rng() - 0.5) * 0.1, MARGIN, 1 - MARGIN), clamp(ry + (rng() - 0.5) * 0.1, MARGIN, 1 - MARGIN)];
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
        if (d >= APART) continue;
        const f = (PUSH * (APART - d)) / APART;
        const ux = dx / d;
        const uy = dy / d;
        move.get(names[i])[0] += ux * f;
        move.get(names[i])[1] += uy * f;
        move.get(names[j])[0] -= ux * f;
        move.get(names[j])[1] -= uy * f;
      }
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
