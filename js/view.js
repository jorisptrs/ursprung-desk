// The impure half of D38: fold state → objects lying in the light. Settled
// geometry is fluid CSS (% positions, cqmin sizes), so resize re-flows the laid
// table with no JS; only threads are px and re-laid on resize. Placements are
// instant (D87): a card appears where it will lie forever — the table never
// performs. The one animation left is the flip, a card picked up to read; it
// runs as a WAAPI overlay on settled truth, so cancelling it leaves a correct
// table.

import { renderCard, backModel } from './cards.js';
import { packSpread } from './layout.js';
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
  const inOpenPile = () => (openPile ? lastState.cards.filter(inSpread) : []);

  // Where a card of the open pile lies, in px from where it lies stacked. The
  // pile opens to exactly the room its own cards need — a pile of two goes two
  // wide, a pile of one grows nothing — and the block is nudged back inside the
  // light, so a studio at the edge opens inward rather than off the table.
  let spreadCache = null;
  function spreadPlan() {
    const key = `${openPile}·${Math.round(rect.w)}×${Math.round(rect.h)}`;
    if (spreadCache?.key === key) return spreadCache.plan;
    const group = inOpenPile();
    let plan = null;
    if (group.length > 1) {
      const gap = Math.max(6, short() * 0.012); // the thin margin between cards
      const sizes = group.map((c) => {
        const el = cardEls.get(c.id);
        const { w, h } = cardSizePx(c);
        return { w: el?.offsetWidth || w, h: el?.offsetHeight || h };
      });
      // wide rows, because a studio opened is a sequence to follow along: the
      // oldest at the top left, the newest at the end (D161)
      const pack = packSpread(sizes, gap, rect.w * 0.8);
      // the studio's own place is the middle of its stack (fold.js), so the
      // spread opens around the same point the pile stood on
      const [cx, cy] = [group[0].x * rect.w, group[0].y * rect.h];
      const m = Math.max(8, short() * 0.015);
      const fit = (c, size, max) =>
        size + m * 2 >= max ? max / 2 : Math.min(Math.max(c, size / 2 + m), max - size / 2 - m);
      const ox = fit(cx, pack.w, rect.w) - cx;
      const oy = fit(cy, pack.h, rect.h) - cy;
      plan = new Map(group.map((c, i) => [c.id, {
        dx: ox + pack.offsets[i].dx + cx - c.x * rect.w,
        dy: oy + pack.offsets[i].dy + cy - c.y * rect.h,
      }]));
    }
    spreadCache = { key, plan };
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
  let threadsBefore = null;
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
    // and the strings, which are px and re-laid rather than re-flowed: without
    // this they snapped to where the piles are going while the piles were still
    // on their way, which is the one thing that made a move look wrong
    threadsBefore = new Map();
    for (const [key, el] of threadEls) {
      if (el.style.display !== 'none' && el.style.transform) threadsBefore.set(key, el.style.transform);
    }
  }

  function playMoves() {
    const before = boxesBefore;
    const strings = threadsBefore;
    boxesBefore = null;
    threadsBefore = null;
    if (!before || rig) return;
    for (const [key, el] of threadEls) {
      const was = strings?.get(key);
      const now = el.style.transform;
      if (!was || !now || was === now || el.style.display === 'none') continue;
      track(el.animate([{ transform: was }, { transform: now }], { duration: MOVE_MS, easing: EASE }));
    }
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
  }

  // What a thread must stop short of at a studio's place: the pile standing
  // there, or — where the studio is still empty — the name written on the wood.
  // Never the bare point, which is the middle of the stack and would run the
  // string in under the cards and out the other side.
  const MARK_GAP = 5; // px of air between the string and what it points at
  function placeBoxPx(thread, state, from) {
    const [px, py] = thread.toPlace;
    const cx = px * rect.w;
    const cy = py * rect.h;
    const bare = { cx, cy, x1: cx, y1: cy, x2: cx, y2: cy };

    // The card of that pile the string actually meets, not the box around all of
    // them: a pile cascades, so its bounding box has empty corners, and stopping
    // at one of those leaves the string ending in mid-air beside the stack.
    const mine = state.cards.filter((c) => (c.pile ?? c.between) === thread.toStack);
    if (mine.length) {
      const boxes = mine.map((c) => cardBoxPx(c));
      const near = boxes.reduce((best, b) =>
        (Math.hypot(b.cx - from.cx, b.cy - from.cy) < Math.hypot(best.cx - from.cx, best.cy - from.cy) ? b : best));
      return {
        cx, cy,
        x1: near.x1 - MARK_GAP, y1: near.y1 - MARK_GAP,
        x2: near.x2 + MARK_GAP, y2: near.y2 + MARK_GAP,
      };
    }

    const el = markEls.get(thread.toStack);
    if (!el || el.dataset.held !== '0') return bare;
    const w = el.offsetWidth / 2 + MARK_GAP;
    const h = el.offsetHeight / 2 + MARK_GAP;
    return { cx, cy, x1: cx - w, y1: cy - h, x2: cx + w, y2: cy + h };
  }

  const cardBoxPx = (card) => {
    // prefer the real rendered box (content-driven heights, the D66 floor);
    // the model is the fallback before a card has ever laid down
    const el = cardEls.get(card.id);
    const { w: mw, h: mh } = cardSizePx(card);
    const w = el?.offsetWidth || mw;
    const h = el?.offsetHeight || mh;
    const spread = spreadOf(card);
    const cx = card.x * rect.w + (spread?.dx ?? 0);
    const cy = card.y * rect.h + (spread?.dy ?? 0);
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
  function threadGeom(thread, state) {
    const byId = new Map(state.cards.map((c) => [c.id, c]));
    const a = byId.get(thread.from);
    if (!a) return null;
    const A = cardBoxPx(a);
    // An anchor runs to a studio's place, which is the middle of its stack. Where
    // the studio stands empty its name is written there, so the thread backs off
    // that name's own box rather than running through the letters.
    const B = thread.toPlace
      ? placeBoxPx(thread, state, A)
      : cardBoxPx(byId.get(thread.to) ?? {});
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

  // What a thread claims, and when it says so (keeper's ruling 2026-07-23).
  // An anchor holds a shared work between the studios that made it, and is
  // always drawn: without it the card is an orphan in a gap. Every other
  // thread is a claim about two works — a quest answered, a problem shared —
  // and at castle scale drawing them all at once is a web. So they wait for
  // their card to be picked up, which is the gesture that already means
  // "tell me more about this one". The cartography comes back whole at replay
  // and at the closing ceremony, where the map is the point.
  const threadShows = (thread) =>
    thread.anchor || (flippedId != null && (thread.from === flippedId || thread.to === flippedId));

  function settleThread(el, thread, state) {
    const g = threadShows(thread) ? threadGeom(thread, state) : null;
    el.style.display = g ? '' : 'none';
    if (g) el.style.transform = threadTransform(g);
    el.style.opacity = thread.opacity;
    return g;
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
    for (const id of gone) if (id === flippedId) { flippedId = null; stopExperience(id); }
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
        el.style.left = `${(studio.place[0] * 100).toFixed(2)}%`;
        el.style.top = `${(studio.place[1] * 100).toFixed(2)}%`;
        el.dataset.held = String(studio.held);
      },
      marks,
    );
  }

  function reconcileThreads(state) {
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
    reconcileCards(state);
    reconcileStudios(state); // after the cards: a mark is read only where its pile is empty
    reconcileThreads(state); // and last, since a thread is measured off both
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
    if (!cardEls.has(id)) return;
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
    }
    reconcile(lastState);
    return next != null;
  }

  const pileOpen = () => openPile != null;

  function relayThreads() {
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

  return { renderInstant, playEvent, cancelActive, finishActive, onResize, flipJob, flipInstant, tapDoor, pageBack, spreadPile, pileOpen, workPlayer };
}
