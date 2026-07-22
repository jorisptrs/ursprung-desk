// The truth. fold(events, t) → table state. Pure and deterministic: no DOM,
// no Date.now, no Math.random — same (events, t) in, the same table out, forever.
// Coordinates are normalized 0–1 against the field (D38); the renderer maps to pixels.
// Overlap is modeled in a canonical table (TABLE_ASPECT) — real desks overlap, so
// relaxation enforces only one legibility floor: no card's title/caption strip is
// ever covered by a newer card (D43). Relax runs on base placements and the
// arrival shoves are replayed after, so an arrival can only ever move a laid
// card by one schedule increment — the continuity the motion layer tweens
// against. Final tuning waits for the eye.

export const SPACING = 1; // table-time units between consecutive events (D25)
export const eventTime = (i) => (i + 1) * SPACING;
export const pastEnd = (events) => eventTime(events.length - 1) + SPACING;

export const TABLE_ASPECT = 1.6; // canonical table proportions; the renderer maps 0–1 onto its own rect (Q33 open)

const NUDGE_MAX = 0.03; // lifetime shove budget per card, as a fraction of the field (D1/D41)
const NUDGE_TAU = 6;
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

function place(artifact) {
  const rng = mulberry32(fnv1a(artifact.id));
  const dir = rng() * Math.PI * 2;
  let radius = 0.1 + rng() * 0.24; // center-biased scatter
  let baseOpacity = 1;
  if (artifact.kind === 'fieldnotes') { // the cartographer's pile keeps to its corner (§9)
    return {
      x: 0.155 + (rng() - 0.5) * 0.03,
      y: 0.84 + (rng() - 0.5) * 0.03,
      dir,
      rot: round4((rng() - 0.5) * 7),
      scale: SCALES[artifact.media] ?? 1,
      baseOpacity,
    };
  }
  if (artifact.kind === 'quest') { // quests spawn faded and edgeward (§9)
    radius = 0.32 + rng() * 0.1;
    baseOpacity = 0.62; // faded, still readable at four strata deep (eye-tuned 2026-07-22)
  }
  return {
    x: 0.5 + Math.cos(dir) * radius,
    y: 0.5 + Math.sin(dir) * radius,
    dir,
    rot: round4((rng() - 0.5) * 12),
    scale: SCALES[artifact.media] ?? 1,
    baseOpacity,
  };
}

const stays = (card) => card.artifact.kind === 'fieldnotes'; // the pile neither drifts nor sweeps

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

// The nudge schedule: each arrival shoves every earlier card OUTWARD FROM ITS
// LANDING POINT (D41 amended) — the m-th shove a card feels is the increment of
// this saturating curve, scaled down with distance from the landing. Vector sum
// of a card's lifetime shoves ≤ NUDGE_MAX by construction, so every card lives
// forever inside a disc of that radius around its relaxed base — the bound the
// floor guarantee leans on.
const driftAt = (later) => NUDGE_MAX * (1 - Math.exp(-later / NUDGE_TAU));
const PUSH_SIGMA = 0.22; // distance falloff: the pile parts around what lands in it

// The shared pair geometry: base shapes inflated by each card's lifetime shove
// disc. The pile neither shoves nor sweeps; it is exempt against itself only.
const cardSwept = (c) => expand(cardRect(c), stays(c) ? 0 : NUDGE_MAX);
const pairStrip = (c) => expand(captionStrip(c), (stays(c) ? 0 : NUDGE_MAX) + SAFE);

// When gradient descent wedges in a local minimum, scan a deterministic spiral
// for the nearest free berth — legibility is not negotiable (D43).
function findClearBerth(cards, j) {
  const a0 = ((fnv1a(cards[j].id + ':berth') % 360) * Math.PI) / 180;
  const clear = (x, y) => {
    const probe = { ...cards[j], x, y };
    const rect = cardSwept(probe);
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

// Newer cards give way — the newcomer finds space, the laid table stands (D1).
// Deterministic: fixed order, fixed steps, hash-derived tie-break. Each move sums
// the repulsion from every violated strip at once, so a card wedged between two
// captions escapes sideways instead of ping-ponging pair by pair.
function relax(cards) {
  const hashDir = (id) => {
    const a = ((fnv1a(id) % 360) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
  };
  for (let sweep = 0; sweep < 14; sweep++) {
    let moved = false;
    for (let j = 1; j < cards.length; j++) {
      let guard = 0;
      while (guard++ < 60) {
        if (guard >= 60) { // descent exhausted with hits remaining
          findClearBerth(cards, j);
          break;
        }
        const rect = cardSwept(cards[j]);
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
        if (!hits) break;
        const vlen = Math.hypot(vx, vy);
        if (vlen < 1e-6) [vx, vy] = hashDir(cards[j].id); // opposed strips cancel: break the tie
        else { vx /= vlen; vy /= vlen; }
        cards[j].x = clamp(cards[j].x + (vx * RELAX_STEP) / TABLE_ASPECT, 0.07, 0.93);
        cards[j].y = clamp(cards[j].y + vy * RELAX_STEP, 0.09, 0.91);
        moved = true;
      }
    }
    if (!moved) return;
  }
}

export function fold(events, t) {
  const arrived = [];
  for (let i = 0; i < events.length; i++) {
    if (eventTime(i) <= t) arrived.push({ ev: events[i], i });
  }

  const retired = new Set(arrived.filter((x) => x.ev.e === 'retire').map((x) => x.ev.id));
  const deposits = arrived.filter((x) => x.ev.e === 'deposit' && !retired.has(x.ev.artifact.id));
  const maxNight = arrived.reduce((m, x) => Math.max(m, x.ev.night), 0);

  let pileDepth = 0; // fieldnotes cascade up-right, newest on top, stream-order stable
  const cards = deposits.map(({ ev, i }) => {
    const a = ev.artifact;
    const g = place(a);
    if (a.kind === 'fieldnotes') {
      g.x += pileDepth * 0.03;
      g.y -= pileDepth * 0.024;
      pileDepth += 1;
    }
    const stratum = maxNight - ev.night;
    return {
      id: a.id,
      artifact: a,
      x: g.x, // base placement; relax sees only these, drift lands after
      y: g.y,
      dir: g.dir,
      rot: g.rot,
      scale: g.scale,
      opacity: round4(g.baseOpacity * Math.max(STRATUM_FLOOR, 1 - stratum * STRATUM_DIM)),
      stratum,
      night: ev.night,
      arrivedAt: eventTime(i),
    };
  });

  // Relax on base placements: card j's inputs (cards 0..j-1) never change as the
  // stream grows, so a laid card's between-event motion is exactly one drift
  // increment (<1% of the field) — nudges stay nudges, never relax lurches.
  relax(cards);

  // D1/D41 (amended): replay the arrivals in order — each lands at its relaxed
  // base and shoves every earlier card outward from that point, one schedule
  // increment scaled by distance. Only deposits shove; the pile holds still.
  for (let m = 1; m < cards.length; m++) {
    const drop = cards[m]; // unpushed at its own arrival: this is the landing spot
    for (let i = 0; i < m; i++) {
      const c = cards[i];
      if (stays(c)) continue;
      let ux = c.x - drop.x;
      let uy = c.y - drop.y;
      const dist = Math.hypot(ux, uy);
      if (dist < 1e-6) {
        ux = Math.cos(c.dir);
        uy = Math.sin(c.dir);
      } else {
        ux /= dist;
        uy /= dist;
      }
      const shove = (driftAt(m - i) - driftAt(m - i - 1)) * Math.exp(-dist / PUSH_SIGMA);
      c.x = clamp(c.x + ux * shove, 0.08, 0.92);
      c.y = clamp(c.y + uy * shove, 0.1, 0.9);
    }
  }
  for (const c of cards) {
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
