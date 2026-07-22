// The truth. fold(events, t) → table state. Pure and deterministic: no DOM,
// no Date.now, no Math.random — same (events, t) in, the same table out, forever.
// Coordinates are normalized 0–1 against the field (D38); the renderer maps to pixels.
// Overlap is modeled in a canonical table (TABLE_ASPECT) — real desks overlap, so
// relaxation enforces only one legibility floor: no card's title/caption strip is
// ever covered by a newer card (D43). Placements are final (D87): a card lands
// somewhere on the table and never moves again — position carries no meaning
// beyond "someone put it there"; only Claude's corner pile is a place.

export const SPACING = 1; // table-time units between consecutive events (D25)
export const eventTime = (i) => (i + 1) * SPACING;
export const pastEnd = (events) => eventTime(events.length - 1) + SPACING;

export const TABLE_ASPECT = 1.6; // canonical table proportions; the renderer maps 0–1 onto its own rect (Q33 open)

const STRATUM_DIM = 0.1; // older material sinks per night…
const STRATUM_FLOOR = 0.7; // …but never below reading light (eye-tuned ×2 2026-07-22)
const SCALES = { image: 1.15, video: 1.15, fold: 1.05, note: 0.8 }; // §5: subtle, nothing shouts

export const CARD_W = 0.24; // of the canonical short side, before scale — mirrors the renderer's sizing
export const NOMINAL_H = { image: 1.05, video: 0.85, model: 0.9, fold: 1.0, audio: 0.65, text: 0.85, code: 0.85, note: 0.42 };
const SAFE = 0.02; // absorbs the ±6° rotation the rect model ignores
const RELAX_STEP = 0.02;

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

// Claude's studio corner (D67 amended): its work (field notes) and its
// rejects (failures) pile there, like any studio holds drafts.
function pilePlace(artifact) {
  const rng = mulberry32(fnv1a(artifact.id));
  return {
    x: 0.155 + (rng() - 0.5) * 0.03,
    y: 0.84 + (rng() - 0.5) * 0.03,
    rot: round4((rng() - 0.5) * 7),
    scale: SCALES[artifact.media] ?? 1,
    baseOpacity: 1,
  };
}

// Claude's corner pile neither drifts nor sweeps, and may cover its own.
const stays = (card) => card.artifact.kind === 'fieldnotes' || card.artifact.kind === 'failure';

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

const expand = (r, m) => ({ x1: r.x1 - m, y1: r.y1 - m, x2: r.x2 + m, y2: r.y2 + m });
const intersects = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

// The pair geometry the settle checks: true shapes, a small safety margin on
// the protected strip (placements are final — no drift discs, D87).
const pairStrip = (c) => expand(captionStrip(c), SAFE);

// ---- the berth: each card lands in the largest empty space (D89) ----

const GAP_PITCH = 0.05; // canonical lattice pitch (~390 candidates)
const GAP_JITTER = 0.03; // per-card lattice offset ≥ pitch/2 — no grid survives
const GAP_EDGE_W = 0.9; // a wall counts as 0.9 of a neighboring card
const GAP_BAND_MIN = 0.03; // absolute slack floor on the tie-band
const GAP_BAND_FRAC = 0.35; // relative slack — what varies the early, open table
const CORNER_CANON = { x1: 0, y1: 0.66, x2: 0.34 * TABLE_ASPECT, y2: 1 }; // the pile's ground, as an obstacle

// Signed Chebyshev separation between rects: > 0 gap, < 0 overlap depth —
// negative values keep a total order once the table is crowded.
const sep = (a, b) => Math.max(
  Math.max(a.x1 - b.x2, b.x1 - a.x2),
  Math.max(a.y1 - b.y2, b.y1 - a.y2),
);

// Bottleneck clearance of a rect against the laid cards, Claude's corner, and
// the table's own bounds (walls at GAP_EDGE_W). Exported: the tests reuse it.
export function clearance(rect, cards) {
  let m = Infinity;
  for (const c of cards) m = Math.min(m, sep(rect, cardRect(c)));
  m = Math.min(m, sep(rect, CORNER_CANON));
  const wall = Math.min(rect.x1, TABLE_ASPECT - rect.x2, rect.y1, 1 - rect.y2);
  return Math.min(m, GAP_EDGE_W * wall);
}

// The largest empty space, deterministically: score a jittered lattice of
// candidate rects, then pick from the near-best band — the relative band is
// what keeps an open table varied instead of repeating one argmax. Fixed draw
// order on one salted stream: jx, jy, pick, rot.
function bestBerth(artifact, obstacles) {
  const rng = mulberry32(fnv1a(artifact.id + ':gap'));
  const jx = ((rng() * 2 - 1) * GAP_JITTER) / TABLE_ASPECT;
  const jy = (rng() * 2 - 1) * GAP_JITTER;
  const scale = SCALES[artifact.media] ?? 1;
  const probe = { artifact, scale, x: 0, y: 0 };
  const candidates = [];
  let best = -Infinity;
  const px = GAP_PITCH / TABLE_ASPECT;
  for (let bx = 0.1; bx <= 0.9 + 1e-9; bx += px) {
    for (let by = 0.13; by <= 0.87 + 1e-9; by += GAP_PITCH) {
      const x = bx + jx;
      const y = by + jy;
      // jitter first, filter after — nothing ever leaks into the corner
      if (x < 0.1 || x > 0.9 || y < 0.13 || y > 0.87) continue;
      if (x < 0.34 && y > 0.66) continue;
      probe.x = x;
      probe.y = y;
      const s = clearance(cardRect(probe), obstacles);
      candidates.push({ x, y, s });
      if (s > best) best = s;
    }
  }
  const tol = Math.max(GAP_BAND_MIN, GAP_BAND_FRAC * best);
  const band = candidates.filter((c) => c.s >= best - tol);
  const pick = band[Math.floor(rng() * band.length)] ?? { x: 0.5, y: 0.5 };
  return {
    x: pick.x,
    y: pick.y,
    rot: round4((rng() - 0.5) * 12),
    scale,
    // quests stay faded — a register, not a place (eye-tuned 2026-07-22)
    baseOpacity: artifact.kind === 'quest' ? 0.62 : 1,
  };
}

// When gradient descent wedges in a local minimum, scan a deterministic spiral
// for the nearest free berth — legibility is not negotiable (D43).
function findClearBerth(cards, j) {
  const a0 = ((fnv1a(cards[j].id + ':berth') % 360) * Math.PI) / 180;
  const clear = (x, y) => {
    const probe = { ...cards[j], x, y };
    const rect = cardRect(probe);
    for (let i = 0; i < j; i++) {
      if (stays(cards[i]) && stays(cards[j])) continue;
      if (intersects(rect, pairStrip(cards[i]))) return false;
    }
    return true;
  };
  for (let ring = 0; ring < 24; ring++) {
    const r = 0.04 + ring * 0.035;
    const steps = 10 + ring * 4;
    for (let k = 0; k < steps; k++) {
      const ang = a0 + (k / steps) * Math.PI * 2;
      const x = clamp(cards[j].x + (Math.cos(ang) * r) / TABLE_ASPECT, 0.07, 0.93);
      const y = clamp(cards[j].y + Math.sin(ang) * r, 0.09, 0.91);
      if (clear(x, y)) {
        cards[j].x = x;
        cards[j].y = y;
        return;
      }
    }
  }
  // no free berth at scan resolution — the floor test will say so
}

// The newcomer gives way to the laid table (D1/D43): gradient descent off
// every violated strip at once, the spiral berth when descent wedges. One pass
// suffices — the newcomer settles against cards that are already final.
function settleOne(cards, j) {
  const hashDir = (id) => {
    const a = ((fnv1a(id) % 360) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
  };
  let guard = 0;
  while (guard++ < 60) {
    const rect = cardRect(cards[j]);
    let vx = 0, vy = 0, hits = 0;
    for (let i = 0; i < j; i++) {
      if (stays(cards[i]) && stays(cards[j])) continue; // the pile may cover its own older notes
      const strip = pairStrip(cards[i]);
      if (!intersects(rect, strip)) continue;
      hits++;
      let dx = cards[j].x * TABLE_ASPECT - (strip.x1 + strip.x2) / 2;
      let dy = cards[j].y - (strip.y1 + strip.y2) / 2;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) [dx, dy] = hashDir(cards[j].id);
      else { dx /= len; dy /= len; }
      vx += dx; vy += dy;
    }
    if (!hits) return;
    const vlen = Math.hypot(vx, vy);
    if (vlen < 1e-6) [vx, vy] = hashDir(cards[j].id); // opposed strips cancel: break the tie
    else { vx /= vlen; vy /= vlen; }
    cards[j].x = clamp(cards[j].x + (vx * RELAX_STEP) / TABLE_ASPECT, 0.07, 0.93);
    cards[j].y = clamp(cards[j].y + vy * RELAX_STEP, 0.09, 0.91);
  }
  findClearBerth(cards, j); // descent exhausted with hits remaining
}

export function fold(events, t) {
  const arrived = [];
  for (let i = 0; i < events.length; i++) {
    if (eventTime(i) <= t) arrived.push({ ev: events[i], i });
  }

  // One walk in stream order (D87/D89): each deposit lands in the largest
  // empty space among the cards PRESENT AT THAT MOMENT and settles against
  // them, then never moves — retires shrink the obstacle set only for cards
  // that land later, so a retirement never re-places a survivor.
  const live = [];
  let pileDepth = 0; // the corner pile cascades up-right; a retired slot stays a slot
  let maxNight = 0;
  for (const { ev, i } of arrived) {
    if (ev.night > maxNight) maxNight = ev.night;
    if (ev.e === 'retire') {
      const at = live.findIndex((c) => c.id === ev.id);
      if (at >= 0) live.splice(at, 1);
      continue;
    }
    if (ev.e !== 'deposit') continue;
    const a = ev.artifact;
    let g;
    if (a.kind === 'fieldnotes' || a.kind === 'failure') {
      g = pilePlace(a);
      g.x += pileDepth * 0.03;
      g.y -= pileDepth * 0.024;
      pileDepth += 1;
    } else {
      g = bestBerth(a, live);
    }
    live.push({
      id: a.id,
      artifact: a,
      x: g.x,
      y: g.y,
      rot: g.rot,
      scale: g.scale,
      baseOpacity: g.baseOpacity,
      night: ev.night,
      arrivedAt: eventTime(i),
    });
    settleOne(live, live.length - 1);
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
  const threads = arrived
    .filter((x) => x.ev.e === 'thread' && byId.has(x.ev.from) && byId.has(x.ev.to))
    .map((x) => ({
      from: x.ev.from,
      to: x.ev.to,
      why: x.ev.why ?? null,
      night: x.ev.night,
      // D14 concretized: a thread fades with its dimmer end.
      opacity: round4(Math.min(byId.get(x.ev.from).opacity, byId.get(x.ev.to).opacity)),
    }));

  return { t, maxNight, cards, threads };
}
