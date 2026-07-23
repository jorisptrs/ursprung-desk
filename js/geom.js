// The few primitives the fold and the solver both need. They live apart so that
// `fold` can call `arrange` — a new stack has to be placed the moment it exists,
// not only when a night's redraw comes round — without the two importing each
// other. Nothing here knows about cards, events, or the DOM.

export const TABLE_ASPECT = 1.6; // canonical table proportions; the renderer maps 0–1 onto its own rect (Q33 open)

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round4 = (v) => Math.round(v * 10000) / 10000;

// Determinism without a clock or a seed anyone has to carry: a card's own id
// hashes to its own corners, a name to its own berth. Same input, same output,
// forever — which is what lets every past state of the table be replayed.
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
