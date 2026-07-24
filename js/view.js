// The impure half of D38: fold state → objects lying in the light. Settled
// geometry is fluid CSS (% positions, cqmin sizes), so resize re-flows the laid
// table with no JS; only threads are px and re-laid on resize. Placements are
// instant (D87): a card appears where it will lie forever — the table never
// performs. The one animation left is the flip, a card picked up to read; it
// runs as a WAAPI overlay on settled truth, so cancelling it leaves a correct
// table.

import { renderCard, backModel } from './cards.js';
import { mountModel } from './model3d.js';
import { spreadAround } from './layout.js';
import { CARD_W, NOMINAL_H } from './fold.js';
import { sleep } from './queue.js';
import { isPlace } from './stream.js';

const EASE = 'cubic-bezier(0.22, 0.9, 0.3, 1)'; // decelerating, like a hand withdrawing
const FLOOR_W = 120; // px pair (width, width·0.075 font) a card never shrinks past —
// browser zoom and tiny windows change how much table you see, never a card's shape
const DECODE_MS = 300; // bounded wait for an arriving trace image
const SETTLE_GRACE_MS = 150; // deadline slack past the gesture's own length
const FLIP_MS = 520; // the turn of a card picked up to read
// A card in hand is a page, not a token (D100): it grows to a reading width —
// nearly the pool's own on a phone, a comfortable column on the table — and
// never past the light's edges.
const READ_W_FRAC = 0.86; // of the pool's width
const READ_H_FRAC = 0.6; // of its height, so a grown card still lies in the light
const READ_MAX = 560; // px
const READ_MIN = 200;
const OPEN_H_FRAC = 0.86; // the tallest a card in hand may stand
const FONT_OF_W = 0.075; // a card's type, as a fraction of its width — laid or in hand
const PIECE_MAX_FRAC = 0.66; // of that: a still shares its leaf, never takes it whole (D102)

// A thread's identity is its two ends, and an anchor's far end is the STUDIO it
// hangs from — never that studio's coordinates, which change every time the map
// is redrawn. Keying on the place meant a rearrangement destroyed every anchor
// and built new ones in their stead, so they blinked instead of travelling.
const threadKey = (t) => `${t.from}→${t.to ?? `@${t.toStack ?? ''}`}`;

export function createView(field, { rig = false } = {}) {
  const cardEls = new Map(); // artifact id → element
  const threadEls = new Map(); // thread key → element
  const active = new Set(); // live Animation objects
  let lastState = { cards: [], threads: [] };
  let rect = { w: field.clientWidth, h: field.clientHeight };
  let flippedId = null; // one card in hand at a time (D73); view-ephemera, never logged (D23)
  let openPage = 0; // which leaf of the open card's back is showing (D100)
  let openLeaves = [0]; // where each leaf begins, in the open back's own pixels
  let openPile = null; // which studio's pile is spread open — view-ephemera too

  const layer = document.createElement('div');
  layer.className = 'threads';
  field.append(layer);
  // Where each studio stands, named. It lies under its own pile and is only
  // read where a studio holds no cards of its own — someone whose whole week is
  // collaborations — which is exactly where a thread would otherwise end in
  // empty air. It is also where the next card will arrive.
  const marks = document.createElement('div');
  marks.className = 'studios';
  field.append(marks);
  const markEls = new Map(); // person → element

  // Names at the ends of the threads that show while a stack is read (D183): a
  // thread reaching a collaborator's studio would otherwise land on a pile with
  // no word on it — so the collaborator's name is set right where it lands, above
  // the cards, in the thread's own amber. Cleared the moment nothing is open.
  const nameLayer = document.createElement('div');
  nameLayer.className = 'endnames';
  field.append(nameLayer);
  const nameEls = new Map(); // person → element

  const short = () => Math.min(rect.w, rect.h);
  let lastPointer = { x: 0, y: 0 }; // where a press landed, for seeking along a line
  field.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);

  const cardSizePx = (card) => {
    const w = short() * CARD_W * card.scale;
    return { w, h: w * (NOMINAL_H[card.artifact.media] ?? 0.9) };
  };

  // ---- a pile spread open (D115's two-beat, borrowed from the editor's deck) ----

  // Which pile a card lies in: a studio by name, or the shared place a set of
  // hands keeps between them. The fold decided this; the view only reads it.
  const pileKey = (card) => card.pile ?? (card.between ? `~${card.between}` : null);

  // What a studio holds, opened (keeper's ruling): everything that person made,
  // their collaborations included — a quest asked alone and the work that
  // answered it with somebody else belong to one thread of thinking, and having
  // to hunt for the second half on a shared place between two piles is exactly
  // the reading the map was meant to make possible. In the order they were
  // made, which is the order the log is in.
  //
  // A shared place opened on its own shows only what those hands made together:
  // it is a place two people keep, not a third person.
  const inSpread = (card) => {
    if (!openPile) return false;
    if (pileKey(card) === openPile) return true;
    return !openPile.startsWith('~') && (card.makers ?? []).includes(openPile);
  };
  const inOpenPile = () => (openPile ? clusterByChains(lastState.cards.filter(inSpread), lastState.threads) : []);

  // Related cards sit together when a studio opens (keeper's ruling — amends D161's
  // pure timeline): a card and the one it builds on, or any two of the pile's cards
  // a thread ties, are pulled adjacent, so a quest and the work that answered it
  // read as one line of thinking instead of drifting apart in the deal order. The
  // rule is gentle: chains keep the order they were laid, unlinked cards keep their
  // place, and each chain rides at the spot of its earliest card — so the timeline
  // still reads underneath, only the linked ones close ranks.
  // The pile's cards, grouped into chains (each a chain of two-or-more, or a
  // one-card group), in laid order. `clusterByChains` flattens this — chains
  // contiguous — for the litThreads set and the count; `spreadPlan` keeps the
  // groups, to lay each chain as its own row (D204's timeline).
  function chainGroups(cards, threads) {
    const singles = () => cards.map((c) => [c]);
    if (cards.length < 3) return singles(); // two cards are already side by side
    const order = new Map(cards.map((c, i) => [c.id, i]));
    const parent = new Map(cards.map((c) => [c.id, c.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    let tied = false;
    for (const t of threads) {
      // a card-to-card tie (not a studio anchor), both ends laid in this pile
      if (t.to && order.has(t.from) && order.has(t.to)) {
        const a = find(t.from); const b = find(t.to);
        if (a !== b) { parent.set(a, b); tied = true; }
      }
    }
    if (!tied) return singles(); // nothing ties inside the pile — the timeline stands (D161)
    const chains = new Map(); // root → its cards, in the order they were laid
    for (const c of cards) {
      const r = find(c.id);
      (chains.get(r) ?? chains.set(r, []).get(r)).push(c);
    }
    return [...chains.values()].sort((p, q) => order.get(p[0].id) - order.get(q[0].id));
  }
  const clusterByChains = (cards, threads) => chainGroups(cards, threads).flat();

  // The studios an open studio reaches into: everyone its gathered collaborations
  // were made with, itself aside — named at their places while the stack is read
  // (D185), so a thread running to a neighbour lands on a word rather than on a
  // dim pile. Their stacks are not otherwise touched.
  let collabStudios = new Set();
  function refreshCollab() {
    const s = new Set();
    if (openPile && !openPile.startsWith('~')) {
      for (const c of inOpenPile()) {
        if (pileKey(c) === openPile) continue; // a solo card is not a collaboration
        for (const m of c.makers ?? []) if (m && m !== openPile) s.add(m);
      }
    }
    collabStudios = s;
  }

  // Where a card of the open pile lies, in px from where it lies stacked. The
  // pile blooms out from the place it stood on and stays centred there (D192):
  // the cards open around the studio's own name, which shows through the gap
  // left at the centre, rather than reflowing into a row that drifts off it.
  let spreadCache = null;
  let openBloomShift = { dx: 0, dy: 0 }; // px the open bloom was pushed to stay in the light; its name rides the same shift
  function spreadPlan() {
    const key = `${openPile}·${Math.round(rect.w)}×${Math.round(rect.h)}`;
    if (spreadCache?.key === key) { openBloomShift = spreadCache.shift; return spreadCache.plan; }
    const units = chainGroups(lastState.cards.filter(inSpread), lastState.threads);
    const group = units.flat(); // = inOpenPile(): the litThreads order and the count
    let plan = null;
    let shift = { dx: 0, dy: 0 };
    if (group.length > 1) {
      const gap = Math.max(6, short() * 0.012); // the thin margin between cards
      // a studio's cards ring its @name, so its centre cell holds the name's air;
      // a shared place carries no name, so the cards close ranks around the point
      const isStudio = !openPile.startsWith('~');
      const nameEl = isStudio ? markEls.get(openPile) : null;
      const nameW = nameEl?.offsetWidth || short() * 0.05;
      const nameH = nameEl?.offsetHeight || short() * 0.028;
      const hole = isStudio ? { w: nameW + gap * 3, h: nameH + gap * 3 } : { w: 0, h: 0 };
      // when cards build on one another they read as a ROW — the chain laid whole,
      // its loose neighbours packed into rows beside it — and the name sits in the
      // middle of those rows (D204). A pile with no such chain keeps the plain grid.
      const hasChain = units.some((u) => u.length >= 2);
      let ordered = group;
      let rowLens = null;
      if (hasChain) {
        const cols = Math.max(2, ...units.map((u) => u.length), Math.round(Math.sqrt(group.length)));
        const rows = [];
        let loose = [];
        const flush = () => { if (loose.length) { rows.push(loose); loose = []; } };
        for (const u of units) {
          if (u.length >= 2) { flush(); rows.push(u); } // a chain is a row of its own
          else { loose.push(u[0]); if (loose.length >= cols) flush(); } // loose cards pack
        }
        flush();
        ordered = rows.flat();
        rowLens = rows.map((r) => r.length);
      }
      const sizes = ordered.map((c) => {
        const el = cardEls.get(c.id);
        const { w, h } = cardSizePx(c);
        return { w: el?.offsetWidth || w, h: el?.offsetHeight || h };
      });
      const spread = spreadAround(sizes, gap, hole, rowLens);
      // the place the pile stood on — the studio's, or the shared place a
      // collaboration keeps between its makers (D140) — so the bloom opens AROUND
      // that point rather than drifting off to the cards' own centroid.
      const studio = lastState.studios?.find((s) => s.name === openPile);
      const place = studio ? studio.place : lastState.places?.[openPile.replace(/^~/, '')];
      const px = (place ? place[0] : group.reduce((a, c) => a + c.x, 0) / group.length) * rect.w;
      const py = (place ? place[1] : group.reduce((a, c) => a + c.y, 0) / group.length) * rect.h;
      // keep the whole bloom in the light, nudged only as far as it must be — and
      // never so far the name leaves the gap it shows through
      let minx = 0; let maxx = 0; let miny = 0; let maxy = 0;
      spread.offsets.forEach((o, i) => {
        minx = Math.min(minx, o.dx - sizes[i].w / 2); maxx = Math.max(maxx, o.dx + sizes[i].w / 2);
        miny = Math.min(miny, o.dy - sizes[i].h / 2); maxy = Math.max(maxy, o.dy + sizes[i].h / 2);
      });
      const M = Math.max(8, short() * 0.02);
      const nudge = (p, lo, hi, max) => {
        let d = 0;
        if (p + hi > max - M) d -= (p + hi) - (max - M);
        if (p + lo + d < M) d += M - (p + lo + d);
        return d;
      };
      // push the whole bloom into the pool as far as it must go, so no card of an
      // edge stack spills off-window. The studio's name rides the same shift (it is
      // re-placed below), so it keeps showing through the gap at the centre — D192
      // holds, only the cap that pinned the name and let edge piles overflow is gone.
      const ox = nudge(px, minx, maxx, rect.w);
      const oy = nudge(py, miny, maxy, rect.h);
      shift = { dx: ox, dy: oy };
      plan = new Map(ordered.map((c, i) => [c.id, {
        dx: px + ox + spread.offsets[i].dx - c.x * rect.w,
        dy: py + oy + spread.offsets[i].dy - c.y * rect.h,
      }]));
    }
    openBloomShift = shift;
    spreadCache = { key, plan, shift };
    return plan;
  }

  function spreadOf(card) {
    if (!inSpread(card)) return null;
    return spreadPlan()?.get(card.id) ?? null;
  }

  // ---- a move is a move, not a jump (D162) ----
  //
  // D87 said placements are instant, and that stands: a card ARRIVES where it
  // will lie forever, because a table that performs on arrival is a screen. But
  // a card that is already lying somewhere and ends up somewhere else has
  // *moved*, and a jump reads as a glitch rather than as a change — which
  // matters most in the replay, where the whole point is watching the cohort
  // find each other. So: arrivals snap, moves travel.
  //
  // Measured from the rendered box rather than from the model, so it catches
  // every kind of move at once — a pile opening, a pile closing, a night's
  // rearrangement — and the settled style is always the truth underneath. The
  // element is put back where it was with a transform and animated to nothing,
  // so nothing but the compositor is asked to work.
  const MOVE_MS = 620;
  let boxesBefore = null;
  let instant = false; // the still surfaces never travel (D62)

  // Whether anything has been rearranged, asked of the fold's own places rather
  // than of the DOM: reading a hundred boxes to find out that nothing moved
  // would force a layout on every event of the pass.
  function placesMoved(was, now) {
    const a = was?.places;
    const b = now?.places;
    if (!a || !b) return false;
    for (const key of Object.keys(b)) {
      const p = a[key];
      if (p && Math.hypot(p[0] - b[key][0], p[1] - b[key][1]) > 0.001) return true;
    }
    return false;
  }

  function watchMoves() {
    boxesBefore = new Map();
    for (const [id, el] of cardEls) boxesBefore.set(id, el.getBoundingClientRect());
  }

  function playMoves() {
    const before = boxesBefore;
    boxesBefore = null;
    if (!before || rig) return;
    for (const [id, el] of cardEls) {
      const was = before.get(id);
      if (!was) continue; // it was not on the table a moment ago: an arrival, which snaps
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.hypot(dx, dy) < 1.5) continue;
      const settled = el.style.transform || 'none';
      track(el.animate(
        [{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) ${settled}` }, { transform: settled }],
        { duration: MOVE_MS, easing: EASE },
      ));
    }
    // and the strings follow the cards rather than being animated beside them:
    // interpolating a thread's own transform let its ends drift off the paper
    // mid-move, since a straight line between two moving points is not itself a
    // straight tween. They are recomputed each frame from the live boxes instead,
    // opening from where the cards were so nothing jumps to the destination first.
    trackThreads(MOVE_MS, before);
  }

  // What a thread must stop short of at a studio's place: the pile standing
  // there, or — where the studio is still empty — the name written on the wood.
  // Never the bare point, which is the middle of the stack and would run the
  // string in under the cards and out the other side.
  const MARK_GAP = 5; // px of air between the string and what it points at
  function placeBoxPx(thread, state, from, fr = null, old = null) {
    const [px, py] = thread.toPlace;
    const cx = px * rect.w;
    const cy = py * rect.h;
    const bare = { cx, cy, x1: cx, y1: cy, x2: cx, y2: cy };

    // While a stack is read, the collaborator a thread reaches wears an amber
    // @name pill at its place (D183/D185) — that pill is the target, and the string
    // must land ON it, not short of it at a cascade-offset near card. A pile's front
    // card can sit well off the place it stands on, so stopping there left the thread
    // ending short of the very name it points at — two-thirds of the way, on a
    // deeper pile. When the pill is set, reach the name; only at rest (no pill) does
    // the string stop at the pile itself, which it must not run under. Not the OPEN
    // studio's own pill, though: its name rides the bloom's shift (D195) while the
    // place here does not, and an anchor to the pile you already opened is redundant
    // — it stays the short internal stub it always was.
    const name = thread.toStack === openPile ? null : nameEls.get(thread.toStack);
    if (name) {
      const w = name.offsetWidth / 2 + MARK_GAP;
      const h = name.offsetHeight / 2 + MARK_GAP;
      return { cx, cy, x1: cx - w, y1: cy - h, x2: cx + w, y2: cy + h };
    }

    // at rest, the card of that pile the string actually meets, not the box around
    // all of them: a pile cascades, so its bounding box has empty corners, and
    // stopping at one leaves the string ending in mid-air beside the stack. Chosen
    // by the model's own centres (cheap), measured live while a pile is rearranged.
    const mine = state.cards.filter((c) => (c.pile ?? c.between) === thread.toStack);
    if (mine.length) {
      const near = mine.reduce((best, c) =>
        (Math.hypot(c.x * rect.w - from.cx, c.y * rect.h - from.cy)
          < Math.hypot(best.x * rect.w - from.cx, best.y * rect.h - from.cy) ? c : best));
      const b = cardBoxPx(near, fr, old);
      return {
        cx, cy,
        x1: b.x1 - MARK_GAP, y1: b.y1 - MARK_GAP,
        x2: b.x2 + MARK_GAP, y2: b.y2 + MARK_GAP,
      };
    }

    const el = markEls.get(thread.toStack);
    if (!el || el.dataset.held !== '0') return bare;
    const w = el.offsetWidth / 2 + MARK_GAP;
    const h = el.offsetHeight / 2 + MARK_GAP;
    return { cx, cy, x1: cx - w, y1: cy - h, x2: cx + w, y2: cy + h };
  }

  const cardBoxPx = (card, fr = null, old = null) => {
    // where the card was as the move began (the first tracked frame), so the
    // strings start from the cards rather than from where they are headed
    const was = old?.get(card.id);
    if (was) return was;
    const el = cardEls.get(card.id);
    // mid-move: the card's real box right now, the one the compositor is
    // animating, so a thread stays fixed to its edge instead of snapping to where
    // the card will come to rest (fr is the field's own rect, to make it local).
    if (fr && el) {
      const r = el.getBoundingClientRect();
      const cx = r.left - fr.left + r.width / 2;
      const cy = r.top - fr.top + r.height / 2;
      return { x1: cx - r.width / 2, y1: cy - r.height / 2, x2: cx + r.width / 2, y2: cy + r.height / 2, cx, cy };
    }
    // at rest, the model box: prefer the real rendered size (content-driven
    // heights, the D66 floor), the model the fallback before a card has laid down
    const { w: mw, h: mh } = cardSizePx(card);
    const w = el?.offsetWidth || mw;
    const h = el?.offsetHeight || mh;
    // a card in hand is grown and slid into the light: its centre is the flip
    // pose, not the place it lies, so a thread leaves from where the card actually
    // is (D73); otherwise the spread offset while its pile is open.
    const off = card.id === flippedId && el ? flipPose(card, el, 'read') : spreadOf(card);
    const cx = card.x * rect.w + (off?.dx ?? 0);
    const cy = card.y * rect.h + (off?.dy ?? 0);
    return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, cx, cy };
  };

  // ---- settled styles (the truth; every animation is an overlay on these) ----

  function settleCard(el, card, z) {
    el.style.left = `${(card.x * 100).toFixed(2)}%`;
    el.style.top = `${(card.y * 100).toFixed(2)}%`;
    const pivot = el.querySelector('.card__pivot');
    el.toggleAttribute('data-lit', card.id === flippedId || inSpread(card));
    // a work made with somebody else is visiting this studio's timeline, not
    // living in it — marked, so the pile still says which are its own
    el.toggleAttribute('data-shared', inSpread(card) && pileKey(card) !== openPile);
    if (card.id === flippedId) {
      // A card in hand is set at its reading size, not blown up to it: a
      // transform scale resamples what was already painted, so at ×4 the text
      // was a photograph of text. Growing the box instead makes the browser lay
      // the type out again at the size it is read at, which is the whole point
      // of picking a card up. The turn still rides a transform — motion is what
      // a compositor is for — but it lands on a real size (D155).
      const w = readWidthPx(card);
      el.style.width = `${w.toFixed(1)}px`;
      el.style.fontSize = `${(w * FONT_OF_W).toFixed(2)}px`;
      layoutOpenBack(el); // height after width, so it measures the true box
      el.style.transform = flippedTransform(card, el);
      el.style.opacity = 1;
      el.style.zIndex = 400;
      if (pivot) pivot.style.transform = 'rotateY(180deg)';
    } else {
      // width and font floor together (same breakpoint), so shape never distorts
      el.style.width = `max(${(CARD_W * 100 * card.scale).toFixed(2)}cqmin, ${Math.round(FLOOR_W * card.scale)}px)`;
      el.style.fontSize = `max(${(CARD_W * 100 * card.scale * FONT_OF_W).toFixed(3)}cqmin, ${(FLOOR_W * FONT_OF_W * card.scale).toFixed(1)}px)`;
      closeBack(el);
      el.style.transform = laidKeyframe(card);
      el.style.opacity = card.opacity;
      el.style.zIndex = spreadOf(card) ? 300 + (card.depth ?? 0) : z;
      if (pivot) pivot.style.transform = '';
    }
  }

  // ---- the open back: one page at a time when it outgrows the light (D100) ----

  function closeBack(el) {
    el.style.height = '';
    const back = el.querySelector('.card__back');
    if (!back) return;
    back.removeAttribute('data-pages');
    back.removeAttribute('data-page');
    back.removeAttribute('data-at');
    back.style.removeProperty('--piece-max');
    const flow = back.querySelector('.back__flow');
    if (flow) flow.scrollTop = 0; // laid down, the back is whole again from the top
  }

  // Which leaf the arrangement is standing on, named on the bar.
  function paintLeaf(back, page, pages) {
    back.dataset.page = String(page + 1);
    back.dataset.at = page === 0 ? 'first' : (page === pages - 1 ? 'last' : 'mid');
    const count = back.querySelector('.back__count');
    if (count) count.textContent = `${page + 1}/${pages}`;
  }

  // Where each leaf begins. A leaf breaks between the arrangement's own pieces
  // — a paragraph, a still, a line — so a page never opens on a half-cut line;
  // only a piece taller than the card itself is walked through by whole lines.
  function leafOffsets(flow, viewport) {
    const offsets = [0];
    const total = flow.scrollHeight;
    const base = flow.offsetTop; // children measure against the back, not the flow
    let start = 0;
    const push = (y) => {
      const at = Math.max(0, Math.min(y, Math.max(0, total - 1)));
      if (at > start + 0.5) { offsets.push(at); start = at; }
    };
    for (const child of flow.children) {
      const top = child.offsetTop - base;
      const height = child.offsetHeight;
      if (top + height <= start + viewport) continue; // still fits on this leaf
      if (height <= viewport) { push(top); continue; } // the whole piece moves down
      if (top > start + 0.5) push(top);
      const lh = parseFloat(getComputedStyle(child).lineHeight);
      const step = lh > 0 ? Math.max(lh, Math.floor(viewport / lh) * lh) : viewport;
      let y = Math.max(start, top);
      while (top + height > y + viewport) { y += step; push(y); }
    }
    return offsets;
  }

  // Grows the card to hold its back; if the back is longer than a card may
  // stand, it stays at that height and the arrangement pages. Pure layout —
  // called on settle and whenever a leaf is turned.
  function layoutOpenBack(el) {
    const back = el.querySelector('.card__back');
    const flow = back?.querySelector('.back__flow');
    if (!back || !flow) { el.style.height = ''; return; }
    back.removeAttribute('data-pages'); // measure the whole arrangement first
    el.style.height = '';
    const pad = () => {
      const cs = getComputedStyle(back);
      return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    };
    const laidH = el.offsetHeight;
    const maxH = rect.h * OPEN_H_FRAC; // the element is already at its reading size (D155)
    // a still is held to part of the card before anything is measured, so one
    // tall photograph cannot become the whole reading (D102)
    back.style.setProperty('--piece-max', `${Math.round(maxH * PIECE_MAX_FRAC)}px`);
    const need = flow.scrollHeight + pad();
    if (need <= maxH) {
      openPage = 0;
      openLeaves = [0];
      back.removeAttribute('data-page');
      if (need > laidH) el.style.height = `${Math.ceil(need)}px`;
      return;
    }
    el.style.height = `${Math.floor(maxH)}px`;
    back.dataset.pages = '2'; // the bar's room is reserved before the count is known
    const viewport = Math.max(1, back.clientHeight - pad());
    openLeaves = leafOffsets(flow, viewport);
    const pages = openLeaves.length;
    openPage = Math.max(0, Math.min(openPage, pages - 1));
    back.dataset.pages = String(pages);
    paintLeaf(back, openPage, pages);
    flow.scrollTop = Math.round(openLeaves[openPage]);
    wireScroll(el, back, flow);
    // a still that arrives after the measure re-lays the leaves, once
    for (const img of flow.querySelectorAll('img')) {
      if (img.complete || img.dataset.relaid) continue;
      img.dataset.relaid = '1';
      img.addEventListener('load', () => { if (el.dataset.id === flippedId) settleOpen(el.dataset.id); }, { once: true });
    }
  }

  function settleOpen(id) {
    const card = lastState.cards.find((c) => c.id === id);
    const el = cardEls.get(id);
    if (!card || !el || flippedId !== id) return;
    const z = lastState.cards.findIndex((c) => c.id === id) + 1;
    settleCard(el, card, z);
  }

  // A hand may also push the arrangement along directly (D102): the bar keeps
  // saying which leaf is standing, whoever moved it.
  function wireScroll(el, back, flow) {
    if (flow.dataset.wired) return;
    flow.dataset.wired = '1';
    let queued = false;
    flow.addEventListener('scroll', () => {
      if (queued || el.dataset.id !== flippedId || !back.dataset.pages) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (el.dataset.id !== flippedId || !back.dataset.pages) return;
        const y = flow.scrollTop;
        const atEnd = y + flow.clientHeight >= flow.scrollHeight - 2;
        let i = atEnd ? openLeaves.length - 1 : 0;
        if (!atEnd) while (i + 1 < openLeaves.length && openLeaves[i + 1] <= y + 2) i += 1;
        if (i === openPage) return;
        openPage = i;
        paintLeaf(back, openPage, openLeaves.length);
      });
    }, { passive: true });
  }

  // The nav bar's two words (D100): the card stays in hand, the leaf turns.
  function pageBack(id, dir) {
    if (flippedId !== id) return;
    const el = cardEls.get(id);
    const back = el?.querySelector('.card__back');
    const flow = back?.querySelector('.back__flow');
    if (!back?.dataset.pages || !flow) return;
    const pages = openLeaves.length;
    const next = openPage + (dir === 'prev' ? -1 : 1);
    if (next < 0 || next >= pages) return; // the ends are quiet, not wrapped
    openPage = next;
    paintLeaf(back, openPage, pages);
    flow.scrollTop = Math.round(openLeaves[openPage]);
  }

  // Distance along a ray to the first exit from a box — slab method.
  function rayExit(x, y, vx, vy, box) {
    let t = Infinity;
    if (vx > 0) t = Math.min(t, (box.x2 - x) / vx);
    else if (vx < 0) t = Math.min(t, (box.x1 - x) / vx);
    if (vy > 0) t = Math.min(t, (box.y2 - y) / vy);
    else if (vy < 0) t = Math.min(t, (box.y1 - y) / vy);
    return Number.isFinite(t) ? Math.max(0, t) : 0;
  }

  // Thread geometry: center to center, trimmed to the two cards' rendered
  // rects so the line is visible end to end (nothing draws under paper). An
  // anchor runs from a shared work to a studio's place rather than to another
  // card — that end is a point on the table, so nothing is trimmed off it.
  function threadGeom(thread, state, fr = null, old = null) {
    const byId = new Map(state.cards.map((c) => [c.id, c]));
    const a = byId.get(thread.from);
    if (!a) return null;
    const A = cardBoxPx(a, fr, old);
    // An anchor runs to a studio's place, which is the middle of its stack. Where
    // the studio stands empty its name is written there, so the thread backs off
    // that name's own box rather than running through the letters.
    const B = thread.toPlace
      ? placeBoxPx(thread, state, A, fr, old)
      : cardBoxPx(byId.get(thread.to) ?? {}, fr, old);
    if (!thread.toPlace && !byId.get(thread.to)) return null;
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const span = Math.hypot(dx, dy);
    if (span < 1) return null;
    const ux = dx / span;
    const uy = dy / span;
    const tA = rayExit(A.cx, A.cy, ux, uy, A); // leave the from-card
    const tB = rayExit(B.cx, B.cy, -ux, -uy, B); // back off whatever stands there
    const len = span - tA - tB;
    if (len <= 2) return null; // cards touch — nothing to draw between them
    return {
      x: A.cx + ux * tA,
      y: A.cy + uy * tA,
      angle: Math.atan2(uy, ux),
      len,
    };
  }

  const threadTransform = (g, scale = 1) =>
    `translate(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px) rotate(${g.angle.toFixed(4)}rad) scaleX(${(g.len * scale).toFixed(1)})`;

  // What a thread claims, and when it says so (D181, amends the 2026-07-23
  // policy). At rest the anchors alone are drawn — each holds a
  // floating work between the hands that made it, and without it the card is an
  // orphan in a gap. Open a stack, or take a card in hand, and the threads that
  // show are that stack's own story: its collaborations reaching out to the
  // collaborators' studios, its quest reaching the work that answered it. The
  // rest of the web recedes, so a studio opened reads as one thread of thinking
  // (D173) rather than the whole castle at once — and the cartography comes back
  // whole at replay, where the map is the point.
  let litThreads = new Set();
  function refreshLitThreads() {
    litThreads = new Set(openPile ? inOpenPile().map((c) => c.id) : []);
    if (flippedId != null) litThreads.add(flippedId);
  }
  const threadShows = (thread) =>
    (litThreads.size
      ? litThreads.has(thread.from) || litThreads.has(thread.to)
      : thread.anchor);

  function settleThread(el, thread, state) {
    const g = threadShows(thread) ? threadGeom(thread, state) : null;
    el.style.display = g ? '' : 'none';
    if (g) el.style.transform = threadTransform(g);
    el.style.opacity = thread.opacity;
    el.dataset.from = thread.from; // the thread's identity, for eye/debug (no CSS keys off it)
    el.dataset.to = thread.to ?? `@${thread.toStack ?? ''}`;
    return g;
  }

  // A thread is two card edges, and both are in motion during a flip, a pile
  // opening, or a night's rearrangement. So while anything travels the strings
  // are recomputed frame by frame from the cards' live boxes — staying fixed to
  // both edges the whole way — then settled to the model's geometry (the truth
  // underneath). This is the one place the view runs its own frame loop rather
  // than handing motion to the compositor: a thread's shape is a function of two
  // other moving things, which a keyframe cannot know. It reads only the boxes
  // already being animated, and only the strings that show.
  let threadRAF = 0;
  let threadDeadline = 0;
  function trackThreadsFrame(old = null) {
    const fr = field.getBoundingClientRect();
    const byKey = new Map(lastState.threads.map((t) => [threadKey(t), t]));
    for (const [key, el] of threadEls) {
      if (el.style.display === 'none') continue;
      const t = byKey.get(key);
      const g = t ? threadGeom(t, lastState, fr, old) : null;
      if (g) el.style.transform = threadTransform(g);
    }
  }
  // the boxes a move began at, in the field's own frame, for the first tracked
  // frame — so the strings open the move from where the cards are, not from where
  // they will land (the snap-ahead the old parallel animation was fighting)
  function boxesInField(before) {
    if (!before) return null;
    const fr = field.getBoundingClientRect();
    const m = new Map();
    for (const [id, r] of before) {
      const cx = r.left - fr.left + r.width / 2;
      const cy = r.top - fr.top + r.height / 2;
      m.set(id, { x1: cx - r.width / 2, y1: cy - r.height / 2, x2: cx + r.width / 2, y2: cy + r.height / 2, cx, cy });
    }
    return m;
  }
  function trackThreads(ms, before = null) {
    threadDeadline = Math.max(threadDeadline, performance.now() + ms);
    if (threadRAF) return;
    trackThreadsFrame(boxesInField(before)); // first frame from where the cards were, so nothing jumps ahead
    const step = () => {
      trackThreadsFrame(); // live thereafter, following the compositor
      if (performance.now() < threadDeadline) threadRAF = requestAnimationFrame(step);
      else { threadRAF = 0; relayThreads(); } // the move is done: settle to the model
    };
    threadRAF = requestAnimationFrame(step);
  }
  function stopTracking() {
    if (threadRAF) cancelAnimationFrame(threadRAF);
    threadRAF = 0;
    threadDeadline = 0;
  }

  // ---- reconcile ----

  // Three layers, kept in step with the fold by the same pattern each time: make
  // what is new, settle what stands, remove what the state no longer names.
  function keepInStep(want, els, make, settle, parent) {
    const seen = new Set();
    for (const [key, item] of want) {
      let el = els.get(key);
      if (!el) {
        el = make(item);
        els.set(key, el);
        parent.append(el);
      }
      settle(el, item);
      seen.add(key);
    }
    for (const [key, el] of els) {
      if (seen.has(key)) continue;
      el.remove();
      els.delete(key);
    }
  }

  function reconcileCards(state) {
    const z = new Map(state.cards.map((c, i) => [c.id, i + 1]));
    const gone = new Set(cardEls.keys());
    for (const c of state.cards) gone.delete(c.id);
    // a retired card leaves the hand too, before its element is taken away
    for (const id of gone) if (id === flippedId) { flippedId = null; stopExperience(id); syncModel(); }
    keepInStep(
      state.cards.map((c) => [c.id, c]),
      cardEls,
      (card) => {
        const el = renderCard(card.artifact, { rig });
        wirePlayers(el);
        el.dataset.id = card.id;
        return el;
      },
      (el, card) => settleCard(el, card, z.get(card.id)),
      field,
    );
  }

  function reconcileStudios(state) {
    keepInStep(
      (state.studios ?? []).map((s) => [s.name, s]),
      markEls,
      (studio) => {
        const el = document.createElement('div');
        el.className = 'studio';
        el.textContent = `@${studio.name}`;
        return el;
      },
      (el, studio) => {
        // an open pile blooms around its name (D192): reveal it where it stands,
        // shown through the gap the cards leave at the centre — and riding the same
        // shift the bloom took to stay in the light, so the gap still finds it
        const open = studio.name === openPile;
        el.style.left = `${(studio.place[0] * 100 + (open ? openBloomShift.dx / rect.w * 100 : 0)).toFixed(2)}%`;
        el.style.top = `${(studio.place[1] * 100 + (open ? openBloomShift.dy / rect.h * 100 : 0)).toFixed(2)}%`;
        el.dataset.held = String(studio.held);
        el.toggleAttribute('data-open', open);
      },
      marks,
    );
  }

  // The name at each thread's far end while a stack is read: the collaborators
  // its works reach out to, set at their studios so a thread never lands on a
  // pile you cannot name (D183). Quest→work threads end on cards in the spread,
  // which carry their own byline, so only the studio ends are named here.
  function reconcileEndNames(state) {
    const placeOf = (name) => state.places?.[name] ?? state.studios?.find((s) => s.name === name)?.place;
    const want = [];
    // The open studio's own name, big at its place: the pile mark that named the
    // wood is hidden the moment it holds a card (studios show only where empty),
    // so an opened stack would otherwise say nowhere whose it is. Named here in
    // the same amber as its collaborators, so selecting a pile shows who it belongs to.
    if (openPile && !openPile.startsWith('~')) {
      const place = placeOf(openPile);
      if (place) want.push([openPile, { name: openPile, place }]);
    }
    if (openPile) {
      for (const name of collabStudios) {
        const place = placeOf(name);
        if (place) want.push([name, { name, place }]);
      }
    }
    keepInStep(
      want,
      nameEls,
      () => { const el = document.createElement('div'); el.className = 'endname'; return el; },
      (el, item) => {
        el.textContent = `@${item.name}`;
        // the open studio's own name rides the bloom's shift so it stays in the
        // gap; the collaborators' names sit at their own places, untouched
        const open = item.name === openPile;
        el.style.left = `${(item.place[0] * 100 + (open ? openBloomShift.dx / rect.w * 100 : 0)).toFixed(2)}%`;
        el.style.top = `${(item.place[1] * 100 + (open ? openBloomShift.dy / rect.h * 100 : 0)).toFixed(2)}%`;
      },
      nameLayer,
    );
  }

  function reconcileThreads(state) {
    refreshLitThreads(); // which stack's story is on show decides which threads draw
    keepInStep(
      state.threads.map((t) => [threadKey(t), t]),
      threadEls,
      () => {
        const el = document.createElement('div');
        el.className = 'thread';
        return el;
      },
      (el, thread) => settleThread(el, thread, state),
      layer,
    );
  }

  function reconcile(state) {
    if (!instant && boxesBefore === null && placesMoved(lastState, state)) watchMoves();
    const moving = boxesBefore !== null;
    refreshCollab(); // before the cards, so each knows whether its stack is a collaborator's
    reconcileCards(state);
    reconcileStudios(state); // after the cards: a mark is read only where its pile is empty
    reconcileEndNames(state); // before the threads: a thread lands ON the collaborator's @name pill (D185), so it must exist first
    reconcileThreads(state); // last, measured off the cards, studios and names it reaches
    // While something is being read, the rest of the table steps back a little.
    // Brightness, never opacity — opacity is how the table says age (D14), and
    // two meanings on one channel is how a legend gets invented.
    field.toggleAttribute('data-reading', flippedId != null || openPile != null);
    lastState = state;
    if (moving) playMoves();
  }

  function renderInstant(state) {
    instant = true;
    try { return renderStill(state); } finally { instant = false; }
  }

  function renderStill(state) {
    cancelActive();
    reconcile(state);
  }

  // ---- motion ----

  function track(anim) {
    active.add(anim);
    anim.finished.catch(() => {}).then(() => active.delete(anim));
    return anim;
  }

  // One gesture is in flight at a time; its token lets the outside settle it
  // early. 'finish' snaps it to its settled truth (press-through at any speed);
  // 'discard' abandons it (a scene change is about to render something else).
  let activeToken = null;

  function newToken() {
    const token = { state: null };
    token.aborted = new Promise((resolve) => { token.resolve = resolve; });
    activeToken = token;
    return token;
  }

  function settleActive(state) {
    if (activeToken && !activeToken.state) {
      activeToken.state = state;
      activeToken.resolve();
    }
    for (const a of active) a.cancel();
    active.clear();
    stopTracking(); // the thread loop rides these animations; the following reconcile settles the strings
  }

  const finishActive = () => settleActive('finish');
  const cancelActive = () => settleActive('discard');

  // ---- the flip: picked up to read, put back where it lay (D73–D75) ----

  // Grown and straightened; slid inward just enough that the grown card sits
  // aligned inside the pool's border. Everything from settled data — no DOM
  // reads beyond the card's own laid size.
  // How much a card grows when it comes into the hand: enough to read, never
  // wider than the light allows, never smaller than it lay (D100).
  // The two sizes a card has, both computed rather than measured, so either can
  // be known while the element is wearing the other.
  const laidWidthPx = (card) => Math.max(CARD_W * card.scale * short(), FLOOR_W * card.scale);
  const readWidthPx = (card) => Math.max(
    laidWidthPx(card), // never smaller than it lay
    READ_MIN, // …nor smaller than a column anyone would read
    Math.min(READ_MAX, rect.w * READ_W_FRAC, rect.h * READ_H_FRAC),
  );
  // how far the element must be scaled to look like the other size, for the turn
  const flipGrow = (card) => readWidthPx(card) / Math.max(1, laidWidthPx(card));

  // Where the open card sits so it stays in the light. `at` says which size the
  // element is wearing while we ask: at its reading size the box is what it
  // measures, at its laid size the open box is that box grown.
  function flipPose(card, el, at = 'read') {
    const by = at === 'read' ? 1 : flipGrow(card);
    const gw = el.offsetWidth * by;
    const gh = el.offsetHeight * by;
    const m = Math.max(10, short() * 0.02);
    const spread = spreadOf(card);
    const cx = card.x * rect.w;
    const cy = card.y * rect.h;
    const fit = (c, half, max) =>
      half * 2 + m * 2 >= max ? max / 2 : Math.min(Math.max(c, half + m), max - half - m);
    return {
      dx: fit(cx + (spread?.dx ?? 0), gw / 2, rect.w) - cx,
      dy: fit(cy + (spread?.dy ?? 0), gh / 2, rect.h) - cy,
    };
  }

  // `at` is the size the element is actually wearing right now: a pose describes
  // where the card looks, and the scale is only ever the difference between the
  // two sizes — 1 whenever the element is already the size it should look.
  function flippedTransform(card, el, at = 'read') {
    const pose = flipPose(card, el, at);
    const scale = at === 'read' ? 1 : flipGrow(card);
    return `translate(calc(-50% + ${pose.dx.toFixed(1)}px), calc(-50% + ${pose.dy.toFixed(1)}px)) rotate(0deg) scale(${scale.toFixed(3)})`;
  }

  // Keyframes need matching transform-function lists, or interpolation falls
  // into matrix decomposition. The turn itself lives on the pivot alone.
  const laidKeyframe = (card, at = 'laid') => {
    const s = spreadOf(card);
    const scale = at === 'laid' ? 1 : 1 / flipGrow(card);
    return `translate(calc(-50% + ${(s?.dx ?? 0).toFixed(1)}px), calc(-50% + ${(s?.dy ?? 0).toFixed(1)}px)) rotate(${card.rot}deg) scale(${scale.toFixed(3)})`;
  };

  async function turnCard(id, open, token) {
    const card = lastState.cards.find((c) => c.id === id);
    const el = cardEls.get(id);
    if (!card || !el) {
      if (!open && flippedId === id) flippedId = null;
      return;
    }
    if (!open) stopExperience(id); // a card laid down goes quiet
    const wasBox = el.getBoundingClientRect(); // where it lies before the turn grows it, for the strings' first frame
    const pivot = el.querySelector('.card__pivot');
    const wasOpen = flippedId === id;
    // the poses are read after settleCard has resized the element, so each is
    // expressed against the size it is then wearing
    const fromPose = wasOpen
      ? () => flippedTransform(card, el, 'laid') // was open, element now laid
      : () => laidKeyframe(card, 'read'); // was laid, element now at reading size
    const fromTurn = wasOpen ? 'rotateY(180deg)' : 'rotateY(0deg)';
    const fromOpacity = wasOpen ? 1 : card.opacity;
    flippedId = open ? id : null;
    if (open) openPage = 0; // a card comes into the hand at its first leaf (D100)
    const z = lastState.cards.findIndex((c) => c.id === id) + 1;
    settleCard(el, card, z); // truth first; the turn is an overlay
    relayThreads(); // and the card in hand is the one whose threads speak
    syncModel(); // a model coming into the hand starts turning; one laid down stops (D190)
    if (!open) el.style.zIndex = 400; // stay lifted while turning back down
    const toPose = open ? flippedTransform(card, el, 'read') : laidKeyframe(card, 'laid');
    const anims = [
      track(el.animate(
        [{ transform: fromPose(), opacity: fromOpacity }, { transform: toPose, opacity: open ? 1 : card.opacity }],
        { duration: FLIP_MS, easing: EASE },
      )),
    ];
    if (pivot) {
      anims.push(track(pivot.animate(
        [{ transform: fromTurn }, { transform: open ? 'rotateY(180deg)' : 'rotateY(0deg)' }],
        { duration: FLIP_MS, easing: EASE },
      )));
    }
    trackThreads(FLIP_MS + SETTLE_GRACE_MS, new Map([[id, wasBox]])); // the strings follow the card as it is lifted or laid, not snap to its rest
    await Promise.race([
      Promise.allSettled(anims.map((a) => a.finished.catch(() => {}))),
      sleep(FLIP_MS + SETTLE_GRACE_MS),
      token.aborted,
    ]);
    // laid again — back into the pile, which is still above the table while it
    // is open, or the card sinks under the studios beside it
    if (!open && flippedId !== id) settleCard(el, card, z);
  }

  // One queue job (D13): a swap is one exchange — the open card starts down,
  // and the next lifts while it lands (amended 2026-07-22).
  function flipJob(id) {
    return async () => {
      const token = newToken();
      const open = flippedId;
      if (open === id) {
        await turnCard(id, false, token);
        return;
      }
      if (open) {
        const closing = turnCard(open, false, token);
        await Promise.race([sleep(FLIP_MS * 0.38), token.aborted]);
        if (token.state) {
          await closing;
          return; // interrupted mid-exchange; truth is already written
        }
        await Promise.all([closing, turnCard(id, true, token)]);
        return;
      }
      await turnCard(id, true, token);
    };
  }

  function flipInstant(id) { // dev-only (?flip=<id>): settled with a card in hand
    const el = cardEls.get(id);
    if (!el || !el.classList.contains('card--backed')) return; // a card with no back turns to a blank page
    flippedId = id;
    openPage = 0;
    reconcile(lastState);
  }

  // ---- the summoned experience (D72/D75): once, in place, stillness after ----

  // A card laid down goes quiet (D75's promise, kept against the new mechanism):
  // the players live on the back now, so stillness means pausing what is there.
  function stopExperience(id) {
    if (id == null) return;
    for (const el of cardEls.get(id)?.querySelectorAll('[data-plays] audio, [data-plays] video') ?? []) el.pause();
  }

  // ---- the desk's own transport (D151) ----

  const clock = (t) => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  };

  // The bar is painted from the recording, never the other way round: seeking
  // sets the time and the next frame draws it, so a dropped event cannot leave
  // the line saying something the sound is not doing.
  function paintPlayer(wrap) {
    const media = wrap.querySelector('audio, video');
    if (!media) return;
    const done = media.duration > 0 ? media.currentTime / media.duration : 0;
    wrap.querySelector('.play__run').style.width = `${(done * 100).toFixed(2)}%`;
    wrap.querySelector('[data-mark]').dataset.mark = media.paused ? 'play' : 'pause';
    const left = wrap.querySelector('[data-at]');
    left.textContent = media.duration > 0 ? clock(media.duration - media.currentTime) : '';
  }

  // One press works whatever is under it: the mark starts and stops, the line
  // moves through. A press anywhere else on a player is not a press on the card.
  function workPlayer(target) {
    const wrap = target.closest('[data-plays]');
    const media = wrap?.querySelector('audio, video');
    if (!media) return;
    if (target.closest('[data-seek]')) {
      const line = target.closest('[data-seek]').getBoundingClientRect();
      const at = Math.min(1, Math.max(0, (lastPointer.x - line.left) / (line.width || 1)));
      if (media.duration > 0) media.currentTime = at * media.duration;
      paintPlayer(wrap);
      return;
    }
    if (media.paused) {
      for (const other of field.querySelectorAll('[data-plays] audio, [data-plays] video')) {
        if (other !== media) other.pause(); // one recording at a time, always (D75)
      }
      media.play().catch(() => {});
    } else media.pause();
  }

  // The 3D lives only in the card that is open (D190): one WebGL context at a
  // time, mounted when a model card comes into the hand and disposed when it
  // lies back down — a pile of model cards keeps none of them live. The still
  // surfaces never call this, so a screenshot shows the poster, deterministic.
  let modelHandle = null;
  let modelFor = null; // the [data-model] element the live context belongs to
  function syncModel() {
    const want = flippedId != null
      ? (cardEls.get(flippedId)?.querySelector('.card__back [data-model]') ?? null)
      : null;
    if (want === modelFor) return;
    modelHandle?.dispose();
    modelHandle = null;
    modelFor = want;
    if (want) modelHandle = mountModel(want, want.dataset.model);
  }

  // the players of a card just built: painted once, and repainted as they run
  function wirePlayers(el) {
    for (const wrap of el.querySelectorAll('[data-plays]')) {
      const media = wrap.querySelector('audio, video');
      if (!media || media.dataset.wired) continue;
      media.dataset.wired = '';
      for (const ev of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended', 'seeked']) {
        media.addEventListener(ev, () => paintPlayer(wrap));
      }
      paintPlayer(wrap);
    }
  }

  // The only door left is 'visit': the work runs elsewhere and the table stays
  // still. A recording no longer needs a door — it plays on the back (D147).
  function tapDoor(id) {
    const card = lastState.cards.find((c) => c.id === id);
    const model = card ? backModel(card.artifact) : null;
    if (model?.door?.mode !== 'visit') return;
    if (!isPlace(model.door.src)) return; // never a script, however it got here (D127)
    window.open(model.door.src, '_blank', 'noopener');
  }

  // Cache-warm a trace image without touching the DOM — decoding after the
  // settled styles are written would paint one frame at the target first.
  const decodedSrcs = new Set();
  async function decodeSrc(src) {
    if (decodedSrcs.has(src)) return;
    const img = new Image();
    img.src = src;
    await Promise.race([img.decode().catch(() => {}), sleep(DECODE_MS)]);
    decodedSrcs.add(src);
  }

  // One queue job: place event `ev` — the instant step to its settled truth
  // (D87: nothing on the table ever moves). The pace carries only the pass's
  // cadence: a rest before the placement, a hold after it. The token still
  // lets a press snap the waits — scrubbing runs as fast as the keys ask.
  async function playEvent(ev, next, pace) {
    const token = newToken();
    if (pace.delayBefore) {
      await Promise.race([sleep(pace.delayBefore), token.aborted]);
      if (token.state) {
        if (token.state === 'finish') reconcile(next);
        return;
      }
    }
    // decode before DOM: the trace paints whole or not at all (D55)
    if (ev.e === 'deposit' && ev.artifact.excerpt?.src) {
      await Promise.race([decodeSrc(ev.artifact.excerpt.src), token.aborted]);
      if (token.state) {
        if (token.state === 'finish') reconcile(next);
        return;
      }
    }
    reconcile(next);
    if (pace.wait) await Promise.race([sleep(pace.wait), token.aborted]);
  }

  // threads are px, so they are re-laid by hand: on resize, and whenever a card
  // is picked up or put down, since that is what decides which of them show
  // The first tap on a pile spreads it; the second takes a card in hand. A pile
  // of one is not a pile — that tap goes straight through to the flip. Returns
  // whether the tap was spent here.
  function spreadPile(id) {
    const card = id == null ? null : lastState.cards.find((c) => c.id === id);
    if (card && inSpread(card)) return false; // already open: the card is the target now
    const key = card ? pileKey(card) : null;
    const group = key ? lastState.cards.filter((c) => pileKey(c) === key || (!key.startsWith('~') && (c.makers ?? []).includes(key))) : [];
    const next = group.length > 1 ? key : null;
    if (next === openPile) return false;
    openPile = next;
    spreadCache = null; // measured from the laid cards; they are about to change
    watchMoves(); // opening or shutting a pile is a move, and reads as one
    if (flippedId != null) { // one thing in hand at a time: the card goes back down
      stopExperience(flippedId);
      const was = cardEls.get(flippedId);
      if (was) closeBack(was); // give the grown height back before the pack measures
      flippedId = null;
      syncModel(); // and a turning model stops with it (D190)
    }
    reconcile(lastState);
    return next != null;
  }

  const pileOpen = () => openPile != null;
  const inHand = () => flippedId;

  function relayThreads() {
    refreshLitThreads();
    const byKey = new Map(lastState.threads.map((t) => [threadKey(t), t]));
    for (const [key, el] of threadEls) {
      const t = byKey.get(key);
      if (t) settleThread(el, t, lastState);
    }
  }

  function onResize() {
    rect = { w: field.clientWidth, h: field.clientHeight };
    spreadCache = null;
    relayThreads(); // cards are %/cqmin and re-flow by CSS
  }

  return { renderInstant, playEvent, cancelActive, finishActive, onResize, flipJob, flipInstant, tapDoor, pageBack, spreadPile, pileOpen, inHand, workPlayer };
}
