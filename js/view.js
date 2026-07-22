// The impure half of D38: fold state → objects lying in the light. Settled
// geometry is fluid CSS (% positions, cqmin sizes), so resize re-flows the laid
// table with no JS; only threads are px and re-laid on resize. Motion is FLIP
// overlays via WAAPI: the DOM is written to the settled truth first, animations
// play from the inverted old pose on top — cancelling anything leaves a correct
// table. One gesture = one event's full consequence: the arriving card, the
// nudges and dims it causes (starting as it lands, not before — the pile shifts
// on contact), a thread drawing itself, a retirement fading out.

import { renderCard, backModel } from './cards.js';
import { fnv1a, mulberry32, CARD_W, NOMINAL_H } from './fold.js';
import { sleep } from './queue.js';

const EASE = 'cubic-bezier(0.22, 0.9, 0.3, 1)'; // decelerating, like a hand withdrawing
const SETTLE_EASE = 'cubic-bezier(0.3, 0, 0.22, 1)'; // the pile giving way, no snap
const NUDGE_AT = 0.65; // consequences of un-located gestures (threads) begin here
const NUDGE_FROM = 0.3; // the pile starts giving way while the card is still travelling…
const NUDGE_SPREAD = 0.32; // …reaching the farthest card by ~62% — a slide, not a jolt
const FLOOR_W = 120; // px pair (width, width·0.075 font) a card never shrinks past —
// browser zoom and tiny windows change how much table you see, never a card's shape
const ENTRY_LIT_AT = 0.25; // opacity ramps only while crossing the dark rim
const ENTRY_ROT = 14; // up to ±7° of over-rotation, resolving on landing
const MIN_TRAVEL = 0.12; // of the field's short side — placements, never twitches
const DECODE_MS = 300; // bounded wait for an arriving trace image
const SETTLE_GRACE_MS = 150; // deadline slack past the gesture's own length
const FLIP_MS = 520; // the turn of a card picked up to read
const FLIP_GROW = 1.45; // grown while in hand, aligned inside the pool (D73)

const threadKey = (t) => `${t.from}→${t.to}`;

export function createView(field, { debug = false, rig = false } = {}) {
  const cardEls = new Map(); // artifact id → element
  const threadEls = new Map(); // thread key → element
  const active = new Set(); // live Animation objects
  let lastState = { cards: [], threads: [] };
  let rect = { w: field.clientWidth, h: field.clientHeight };
  let flippedId = null; // one card in hand at a time (D73); view-ephemera, never logged (D23)
  let playing = null; // the one summoned experience: { cardId, el, doorEl } (D75)

  const layer = document.createElement('div');
  layer.className = 'threads';
  field.append(layer);

  const short = () => Math.min(rect.w, rect.h);

  const cardSizePx = (card) => {
    const w = short() * CARD_W * card.scale;
    return { w, h: w * (NOMINAL_H[card.artifact.media] ?? 0.9) };
  };

  const cardBoxPx = (card) => {
    // prefer the real rendered box (content-driven heights, the D66 floor);
    // the model is the fallback before a card has ever laid down
    const el = cardEls.get(card.id);
    const { w: mw, h: mh } = cardSizePx(card);
    const w = el?.offsetWidth || mw;
    const h = el?.offsetHeight || mh;
    const cx = card.x * rect.w;
    const cy = card.y * rect.h;
    return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, cx, cy };
  };

  // ---- settled styles (the truth; every animation is an overlay on these) ----

  function settleCard(el, card, z) {
    el.style.left = `${(card.x * 100).toFixed(2)}%`;
    el.style.top = `${(card.y * 100).toFixed(2)}%`;
    // width and font floor together (same breakpoint), so shape never distorts
    el.style.width = `max(${(CARD_W * 100 * card.scale).toFixed(2)}cqmin, ${Math.round(FLOOR_W * card.scale)}px)`;
    el.style.fontSize = `max(${(CARD_W * 100 * card.scale * 0.075).toFixed(3)}cqmin, ${(FLOOR_W * 0.075 * card.scale).toFixed(1)}px)`;
    const pivot = el.querySelector('.card__pivot');
    if (card.id === flippedId) { // in hand: grown, straightened, lifted, fully lit
      el.style.transform = flippedTransform(card, el);
      el.style.opacity = 1;
      el.style.zIndex = 400;
      if (pivot) pivot.style.transform = 'rotateY(180deg)';
    } else {
      el.style.transform = `translate(-50%, -50%) rotate(${card.rot}deg)`;
      el.style.opacity = card.opacity;
      el.style.zIndex = z;
      if (pivot) pivot.style.transform = '';
    }
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
  // rects so the draw-on is visible end to end (nothing draws under paper).
  function threadGeom(thread, state) {
    const byId = new Map(state.cards.map((c) => [c.id, c]));
    const a = byId.get(thread.from);
    const b = byId.get(thread.to);
    if (!a || !b) return null;
    const A = cardBoxPx(a);
    const B = cardBoxPx(b);
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const span = Math.hypot(dx, dy);
    if (span < 1) return null;
    const ux = dx / span;
    const uy = dy / span;
    const tA = rayExit(A.cx, A.cy, ux, uy, A); // leave the from-card
    const tB = rayExit(B.cx, B.cy, -ux, -uy, B); // back off the to-card
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

  function settleThread(el, thread, state) {
    const g = threadGeom(thread, state);
    el.style.display = g ? '' : 'none';
    if (g) el.style.transform = threadTransform(g);
    el.style.opacity = thread.opacity;
    return g;
  }

  // ---- reconcile ----

  function reconcile(state, keep = new Set()) {
    const seenCards = new Set();
    state.cards.forEach((card, i) => {
      let el = cardEls.get(card.id);
      if (!el) {
        el = renderCard(card.artifact);
        el.dataset.id = card.id;
        cardEls.set(card.id, el);
        field.append(el);
      }
      settleCard(el, card, i + 1);
      seenCards.add(card.id);
    });
    for (const [id, el] of cardEls) {
      if (!seenCards.has(id) && !keep.has(id)) {
        if (id === flippedId) { flippedId = null; stopExperience(); } // a retired card leaves the hand too
        el.remove();
        cardEls.delete(id);
      }
    }
    const seenThreads = new Set();
    for (const thread of state.threads) {
      const key = threadKey(thread);
      let el = threadEls.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'thread';
        threadEls.set(key, el);
        layer.append(el);
      }
      settleThread(el, thread, state);
      seenThreads.add(key);
    }
    for (const [key, el] of threadEls) {
      if (!seenThreads.has(key) && !keep.has(key)) {
        el.remove();
        threadEls.delete(key);
      }
    }
    lastState = state;
  }

  function renderInstant(state) {
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

  // Entry pose: from the dark rim along the card's placement ray (through its
  // settled point from the field's center), to the field inflated by one card
  // diagonal. Deterministic per id — no runtime randomness in motion (D24).
  function entryPose(card) {
    const rng = mulberry32(fnv1a(card.id + ':entry'));
    const rotExtra = (rng() - 0.5) * ENTRY_ROT;
    const px = card.x * rect.w;
    const py = card.y * rect.h;
    let vx = px - rect.w / 2;
    let vy = py - rect.h / 2;
    const len = Math.hypot(vx, vy);
    if (len < 1) {
      vx = Math.cos(card.dir);
      vy = Math.sin(card.dir);
    } else {
      vx /= len;
      vy /= len;
    }
    const { w, h } = cardSizePx(card);
    const diag = Math.hypot(w, h);
    const out = rayExit(px, py, vx, vy, { x1: -diag, y1: -diag, x2: rect.w + diag, y2: rect.h + diag });
    const travel = Math.max(out, MIN_TRAVEL * short());
    return { dx: vx * travel, dy: vy * travel, rotExtra };
  }

  // ---- the flip: picked up to read, put back where it lay (D73–D75) ----

  // Grown and straightened; slid inward just enough that the grown card sits
  // aligned inside the pool's border. Everything from settled data — no DOM
  // reads beyond the card's own laid size.
  function flipPose(card, el) {
    const gw = el.offsetWidth * FLIP_GROW;
    const gh = el.offsetHeight * FLIP_GROW;
    const m = Math.max(10, short() * 0.02);
    const cx = card.x * rect.w;
    const cy = card.y * rect.h;
    const fit = (c, half, max) =>
      half * 2 + m * 2 >= max ? max / 2 : Math.min(Math.max(c, half + m), max - half - m);
    return { dx: fit(cx, gw / 2, rect.w) - cx, dy: fit(cy, gh / 2, rect.h) - cy };
  }

  function flippedTransform(card, el) {
    const pose = flipPose(card, el);
    return `translate(calc(-50% + ${pose.dx.toFixed(1)}px), calc(-50% + ${pose.dy.toFixed(1)}px)) rotate(0deg) scale(${FLIP_GROW})`;
  }

  // Keyframes need matching transform-function lists, or interpolation falls
  // into matrix decomposition. The turn itself lives on the pivot alone.
  const laidKeyframe = (card) =>
    `translate(calc(-50% + 0px), calc(-50% + 0px)) rotate(${card.rot}deg) scale(1)`;

  async function turnCard(id, open, token) {
    const card = lastState.cards.find((c) => c.id === id);
    const el = cardEls.get(id);
    if (!card || !el) {
      if (!open && flippedId === id) flippedId = null;
      return;
    }
    if (!open && playing?.cardId === id) stopExperience(); // flip-back is stillness
    const pivot = el.querySelector('.card__pivot');
    const wasOpen = flippedId === id;
    const fromPose = wasOpen ? flippedTransform(card, el) : laidKeyframe(card);
    const fromTurn = wasOpen ? 'rotateY(180deg)' : 'rotateY(0deg)';
    const fromOpacity = wasOpen ? 1 : card.opacity;
    flippedId = open ? id : null;
    const z = lastState.cards.findIndex((c) => c.id === id) + 1;
    settleCard(el, card, z); // truth first; the turn is an overlay
    if (!open) el.style.zIndex = 400; // stay lifted while turning back down
    const toPose = open ? flippedTransform(card, el) : laidKeyframe(card);
    const anims = [
      track(el.animate(
        [{ transform: fromPose, opacity: fromOpacity }, { transform: toPose, opacity: open ? 1 : card.opacity }],
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
    if (!open && flippedId !== id) el.style.zIndex = z; // laid again, back into the pile
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
    reconcile(lastState);
  }

  // ---- the summoned experience (D72/D75): once, in place, stillness after ----

  function stopExperience() {
    if (!playing) return;
    playing.el.pause?.();
    playing.el.remove?.();
    if (playing.doorEl) playing.doorEl.textContent = 'play';
    playing = null;
  }

  function tapDoor(id, doorEl) {
    const card = lastState.cards.find((c) => c.id === id);
    const model = card ? backModel(card.artifact) : null;
    if (!model?.door) return;
    if (model.door.mode === 'visit') { // the work runs elsewhere; the table stays still
      window.open(model.door.src, '_blank', 'noopener');
      return;
    }
    if (playing?.cardId === id) { // tap again: stillness
      stopExperience();
      return;
    }
    stopExperience(); // one at a time, always
    const src = !rig && model.door.demoSrc ? model.door.demoSrc : model.door.src;
    if (card.artifact.media === 'video') {
      const video = document.createElement('video');
      video.className = 'back__player';
      video.src = src;
      video.playsInline = true;
      video.autoplay = true;
      video.onended = stopExperience;
      video.onerror = stopExperience;
      cardEls.get(id)?.querySelector('.card__back')?.append(video);
      playing = { cardId: id, el: video, doorEl };
    } else {
      const audio = new Audio(src);
      audio.onended = stopExperience;
      audio.onerror = stopExperience;
      audio.play().catch(() => stopExperience());
      playing = { cardId: id, el: audio, doorEl };
    }
    if (doorEl) doorEl.textContent = 'still'; // the door word is its own stop
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

  // One queue job: play event `ev` as the gesture between two adjacent truths.
  async function playEvent(ev, prev, next, pace) {
    const token = newToken();
    const bail = () => {
      // 'finish': snap this gesture to done; 'discard': someone else renders
      if (token.state === 'finish') reconcile(next);
    };

    if (pace.delayBefore) {
      await Promise.race([sleep(pace.delayBefore), token.aborted]);
      if (token.state) return bail();
    }

    if (ev.e === 'deposit' && ev.artifact.excerpt?.src) {
      await Promise.race([decodeSrc(ev.artifact.excerpt.src), token.aborted]);
      if (token.state) return bail();
    }

    const d = pace.duration;
    if (d === 0) { // stepped / reduced-motion: instant placement, cadence kept
      reconcile(next);
      if (pace.wait) await Promise.race([sleep(pace.wait), token.aborted]);
      return;
    }

    const prevCards = new Map(prev.cards.map((c) => [c.id, c]));
    const nextCards = new Set(next.cards.map((c) => c.id));
    const prevThreads = new Map(prev.threads.map((t) => [threadKey(t), t]));
    const nextThreads = new Set(next.threads.map((t) => threadKey(t)));
    const arrivingId = ev.e === 'deposit' ? ev.artifact.id : null;

    // retiring pieces stay in the DOM for their fade; removed on resolve
    const keep = new Set();
    for (const c of prev.cards) if (!nextCards.has(c.id)) keep.add(c.id);
    for (const t of prev.threads) if (!nextThreads.has(threadKey(t))) keep.add(threadKey(t));

    // Truth and overlay in ONE synchronous block — an await in here would paint
    // a frame of the settled state before the animations mask it (the jitter).
    reconcile(next, keep);

    const anims = [];
    // Nudges ripple outward from the contact: nearest cards give way first, all
    // settled by the gesture's end — the pile absorbs the newcomer, no jolt.
    const origin = arrivingId ? next.cards.find((c) => c.id === arrivingId) : null;
    const rippleDelay = (x, y) => {
      if (!origin) return d * NUDGE_AT;
      const dist = Math.hypot((x - origin.x) * rect.w, (y - origin.y) * rect.h);
      const span = Math.hypot(rect.w, rect.h) * 0.55;
      return d * (NUDGE_FROM + NUDGE_SPREAD * Math.min(1, dist / span));
    };
    const rippled = (x, y) => {
      const delay = rippleDelay(x, y);
      return { delay, duration: Math.max(1, d - delay), easing: SETTLE_EASE, fill: 'backwards' };
    };
    const later = rippled(origin?.x ?? 0.5, origin?.y ?? 0.5); // for threads: flat, un-located

    for (const card of next.cards) {
      const el = cardEls.get(card.id);
      const was = prevCards.get(card.id);
      if (card.id === arrivingId && !was) {
        const pose = entryPose(card);
        anims.push(track(el.animate([
          {
            transform: `translate(calc(-50% + ${pose.dx.toFixed(1)}px), calc(-50% + ${pose.dy.toFixed(1)}px)) rotate(${(card.rot + pose.rotExtra).toFixed(2)}deg)`,
            opacity: 0,
            offset: 0,
          },
          { opacity: card.opacity, offset: ENTRY_LIT_AT }, // lit once out of the rim
          { transform: `translate(-50%, -50%) rotate(${card.rot}deg)`, opacity: card.opacity, offset: 1 },
        ], { duration: d, easing: EASE })));
        continue;
      }
      if (!was) continue; // jumped in outside a gesture (shouldn't happen mid-queue)
      if (card.id === flippedId) continue; // a card in hand holds its pose; truth moved via settle
      const moved = was.x !== card.x || was.y !== card.y || was.rot !== card.rot;
      const dimmed = was.opacity !== card.opacity;
      if (!moved && !dimmed) continue;
      const dx = (was.x - card.x) * rect.w;
      const dy = (was.y - card.y) * rect.h;
      anims.push(track(el.animate([
        {
          transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) rotate(${was.rot}deg)`,
          opacity: was.opacity,
        },
        { transform: `translate(-50%, -50%) rotate(${card.rot}deg)`, opacity: card.opacity },
      ], rippled(card.x, card.y))));
    }

    for (const thread of next.threads) {
      const key = threadKey(thread);
      const el = threadEls.get(key);
      const was = prevThreads.get(key);
      const g = threadGeom(thread, next);
      if (!g) continue;
      if (!was) { // the arrival of a thread event — it draws itself (D14)
        anims.push(track(el.animate([
          { transform: threadTransform(g, 0), opacity: thread.opacity },
          { transform: threadTransform(g), opacity: thread.opacity },
        ], { duration: d, easing: EASE })));
        continue;
      }
      const gWas = threadGeom(was, prev);
      if (!gWas) continue;
      if (gWas.x !== g.x || gWas.y !== g.y || gWas.len !== g.len || was.opacity !== thread.opacity) {
        anims.push(track(el.animate([
          { transform: threadTransform(gWas), opacity: was.opacity },
          { transform: threadTransform(g), opacity: thread.opacity },
        ], later)));
      }
    }

    // retirements: quiet fade, then gone (D32). fill:'forwards' holds the faded
    // frame until removal — without it the node flashes back for one paint.
    for (const c of prev.cards) {
      if (nextCards.has(c.id)) continue;
      const el = cardEls.get(c.id);
      if (!el) continue;
      const a = track(el.animate([{ opacity: c.opacity }, { opacity: 0 }], { duration: d, easing: 'ease-out', fill: 'forwards' }));
      anims.push(a);
      a.finished.catch(() => {}).then(() => { el.remove(); cardEls.delete(c.id); });
    }
    for (const t of prev.threads) {
      const key = threadKey(t);
      if (nextThreads.has(key)) continue;
      const el = threadEls.get(key);
      if (!el) continue;
      const a = track(el.animate([{ opacity: t.opacity }, { opacity: 0 }], { duration: d, easing: 'ease-out', fill: 'forwards' }));
      anims.push(a);
      a.finished.catch(() => {}).then(() => { el.remove(); threadEls.delete(key); });
    }

    if (!anims.length) return;
    const finished = Promise.allSettled(anims.map((a) => a.finished.catch(() => {})));
    const outcome = await Promise.race([
      finished.then(() => 'finished'),
      sleep(d + SETTLE_GRACE_MS).then(() => 'deadline'),
      token.aborted, // settled early: animations cancelled, truth already written
    ]);
    if (outcome === 'deadline' && debug) console.warn(`desk: gesture for ${ev.e} resolved by deadline, not finished`);
  }

  function onResize() {
    rect = { w: field.clientWidth, h: field.clientHeight };
    // cards are %/cqmin and re-flow by CSS; threads are px and re-laid here
    const byKey = new Map(lastState.threads.map((t) => [threadKey(t), t]));
    for (const [key, el] of threadEls) {
      const t = byKey.get(key);
      if (t) settleThread(el, t, lastState);
    }
  }

  return { renderInstant, playEvent, cancelActive, finishActive, onResize, flipJob, flipInstant, tapDoor };
}
