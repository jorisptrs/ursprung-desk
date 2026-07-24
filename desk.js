// Entry. Wires log → clock → queue → view. No table state of its own:
// everything drawn is fold(events, t) mapped by the view (D38); everything
// moving is one queue job (D13). Boot modes: deployed (the D12 opening pass,
// deferred while hidden, then live) · ?rig (held, driver, no cursor) ·
// ?specimens (still life) · ?cursor=k (deterministic screenshot surface).
// Two local-only flags for the MCP door: ?live watches the drop file (D105),
// ?tail=k holds the stream's last k events back until m (D111). Neither is
// ever on the deployed link, and neither keys off ?rig.

import { createStream } from './js/stream.js';
import { fold, eventTime } from './js/fold.js';
import { createTimeline, pacing } from './js/timeline.js';
import { createQueue, sleep } from './js/queue.js';
import { createView } from './js/view.js';
import { attachDriver, attachHelper } from './js/driver.js';
import { openSheet, directSink, attachBroadcastReceiver, warmEditor, claimGate } from './js/deposit.js';
import { attachLivePickup } from './js/live.js';

const params = new URLSearchParams(location.search);
const field = document.getElementById('field');
const stream = createStream();

// The table is a thing to look at, not a document to scroll (§4): at the resting
// zoom a two-finger scroll or a swipe does nothing — no rubber-band, no
// back-gesture, no drift. Only once you have pinched INTO the map does scrolling
// mean something — panning the zoom — and there the browser is left alone. The
// two things that genuinely scroll keep their wheel: the deposit sheet, and a
// card in hand paging its back (D102).
addEventListener('wheel', (event) => {
  if ((window.visualViewport?.scale ?? 1) > 1.01) return; // pinched in: let it pan the zoom
  if (event.target instanceof Element && event.target.closest('.sheet, .card__back[data-pages]')) return;
  event.preventDefault();
}, { passive: false });

async function loadEvents() {
  // ?specimens: dev-only palette surface (D44) — every media, kind, and fallback. Never linked.
  if (params.has('specimens')) {
    const { specimenEvents } = await import('./js/specimens.js');
    return specimenEvents;
  }
  // ?castle: dev-only crowd surface — the table at the density the retreat
  // actually reaches, where the old scatter's legibility failure was measured.
  if (params.has('castle')) {
    const { castleEvents } = await import('./js/castle.js');
    return castleEvents;
  }
  // ?seed=<name>.json plays an alternate seed — a demo set, the October mocks —
  // without touching seed.json, which the tests fixture on. Name only: no path,
  // no protocol, so a link can never point the table at someone else's file.
  const named = params.get('seed');
  // The deployed root shows the curated demo (our own assets, the J/R/C cohort);
  // seed.json stays the bare fixture the tests load by name (?seed=seed.json).
  const file = /^[\w.-]+\.json$/.test(named ?? '') ? named : 'seed-demo.json';
  const res = await fetch(file);
  return (await res.json()).events;
}

async function main() {
  // ?tail=k holds the stream's last k events off the table until m lands them
  // (D111) — so a live MCP deposit can precede the meta card in one take (D52).
  const loaded = await loadEvents();
  const tailCount = Math.min(Math.max(0, parseInt(params.get('tail'), 10) || 0), loaded.length);
  const heldTail = tailCount ? loaded.slice(loaded.length - tailCount) : [];
  for (const ev of tailCount ? loaded.slice(0, loaded.length - tailCount) : loaded) stream.append(ev);

  // The demo's identity: with no room server, a visitor is one of the seed's own
  // cohort — Claude excluded, since Claude is never the hand behind a deposit.
  // The bare fixture (?seed=seed.json, what the e2e drives) stays without it.
  const rosterEvent = loaded.find((e) => e.e === 'roster');
  const demoAuthors = (params.get('seed') === 'seed.json' || !rosterEvent)
    ? []
    : rosterEvent.people.filter((n) => n !== 'Claude');
  let demoMe = demoAuthors[0] ?? null;

  const rig = params.has('rig');
  const live = params.has('live');
  const view = createView(field, { rig });
  const events = () => stream.all();
  const S = (k) => fold(events(), k === 0 ? 0 : eventTime(k - 1));
  addEventListener('resize', () => view.onResize());

  // D76: still views may boot with one card in hand — the back's screenshot surface
  const settleFlip = () => { if (params.has('flip')) view.flipInstant(params.get('flip')); };

  if (params.has('cursor')) { // D62: fold at a boundary, motionless — never linked
    const n = events().length;
    const k = Math.max(0, Math.min(n, parseInt(params.get('cursor'), 10) || 0));
    view.renderInstant(S(k));
    settleFlip();
    // &sheet composes here for the byte-stable still — the table beneath holds
    if (params.has('sheet')) openSheet({ mode: 'overlay', container: document.body, sink: directSink(stream), autofocus: false });
    return;
  }
  if (params.has('specimens')) {
    view.renderInstant(S(events().length));
    settleFlip();
    return;
  }
  // A table watching the drop file rests live, so a deposit lands the moment it
  // is made — the room's whole point. Only a rig that is NOT watching (the
  // shoot) rests held, where → deals arrivals on cue (keeper's ruling 2026-07-23).
  const tl = createTimeline({ after: rig && !live ? 'held' : 'live' });
  if (params.has('debug')) { // the clock's whole life, alongside D59's canary
    const raw = tl.dispatch;
    tl.dispatch = (action, n) => {
      const fx = raw(action, n);
      console.log(`desk: ${action}(${n}) → ${tl.state.mode} c${tl.state.cursor} t${tl.state.target}${fx.length ? ` [${fx}]` : ''}`);
      return fx;
    };
  }
  const queue = createQueue();

  // Fetches start now; each card's gesture then waits only its own bounded decode.
  for (const ev of events()) {
    if (ev.e === 'deposit' && ev.artifact.excerpt?.src) new Image().src = ev.artifact.excerpt.src;
  }

  let epoch = 0;
  let draining = false;

  function sync() { // scene change, not motion: flush and stand at the cursor's truth
    epoch += 1;
    queue.flush();
    view.renderInstant(S(tl.state.cursor));
  }

  async function drain() {
    if (draining) return;
    draining = true;
    const my = epoch;
    let launched = tl.state.cursor;
    try {
      while (my === epoch && launched < tl.state.target) {
        const k = launched;
        const evs = events();
        const pace = pacing(tl.state, evs, k);
        const next = S(k + 1);
        const job = queue.push({
          run: () => view.playEvent(evs[k], next, pace),
          maxMs: pace.delayBefore + pace.wait + 400,
        });
        launched += 1;
        job.settled.then(() => { if (my === epoch) tl.dispatch('played', events().length); });
        await job.settled; // strict: one gesture at a time (D13)
      }
    } finally {
      draining = false;
    }
    if (my !== epoch) return;
    await queue.idle();
    await sleep(0); // let trailing 'played' dispatches land
    if (my === epoch) tl.dispatch('drained', events().length);
  }

  tl.onEffects((effects) => {
    for (const e of effects) {
      if (e === 'sync') sync();
      else if (e === 'finish') view.finishActive(); // snap the in-flight gesture to done
      else if (e === 'drain') drain();
    }
  });
  stream.onAppend(() => tl.dispatch('appended', events().length));

  // The MCP door's end of the pipe (D105): ?live watches the file the server
  // appends to. Local views only — never the deployed link — and gated on the
  // flag alone, so ?rig&live and a later ?film compose without a branch here.
  // While the table is held a picked-up card simply waits: 'appended' rests
  // silent there, and the next → or d shows it.
  if (live) attachLivePickup(stream);

  // The held-back tail (D111): m lands what ?tail kept off the table. The
  // append alone drains in live; held, the release steps once per event, since
  // 'appended' does nothing there. The events are the seed's own — conducting,
  // never fabricating (D26).
  const landTail = () => {
    if (!heldTail.length) return;
    let landed = 0;
    for (const ev of heldTail.splice(0, heldTail.length)) {
      try {
        stream.append(ev);
        landed += 1;
      } catch (err) { // one event the stream won't take must not swallow the rest
        console.warn(`desk: a held event could not land — ${err?.message ?? err}`);
      }
    }
    if (tl.state.mode === 'held') for (let i = 0; i < landed; i++) tl.dispatch('step', events().length);
  };
  if (tailCount) {
    addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (document.querySelector('.sheet')) return; // an open sheet takes the keyboard
      if (event.key.toLowerCase() === 'm') landTail();
    });
  }

  // The flip (D73): a clean tap on a backed card turns it at any moment —
  // mid-deal it simply takes its turn in the queue between arrivals. A drag,
  // or a live text selection, is reading — it never flips or closes (D92).
  // Backless cards stay silent (D11).
  let pressStart = null;
  let pressDrag = false;
  field.addEventListener('pointerdown', (event) => {
    pressStart = { x: event.clientX, y: event.clientY };
    pressDrag = false;
  }, true);
  addEventListener('pointermove', (event) => {
    if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 6) pressDrag = true;
  });
  addEventListener('pointerup', () => { pressStart = null; });
  field.addEventListener('click', (event) => {
    if (event.target.closest('a')) return; // shelved links behave as links
    const cardEl = event.target.closest('.card');
    // A tap on the wood steps back one thing at a time (keeper's ruling): the
    // card in hand goes down first, into the pile it came out of if that pile is
    // still spread; only once nothing is in hand does the next tap shut the
    // pile. Undoing two things with one tap is how you lose the place you were
    // reading from.
    if (!cardEl?.dataset.id) {
      const held = view.inHand();
      if (held != null) { queue.push({ run: view.flipJob(held), maxMs: 1800 }); return; }
      view.spreadPile(null);
      return; // and past that, the empty table is pointer territory (below)
    }
    const sel = getSelection();
    if (pressDrag || (sel && !sel.isCollapsed)) return; // marking text to copy keeps the card as it is
    if (event.target.closest('[data-plays]')) { // working a player is not putting the card down
      view.workPlayer(event.target);
      return;
    }
    if (event.target.closest('[data-model]')) return; // taking hold of the model to turn it is not putting the card down (D190)
    const pageEl = event.target.closest('[data-page]'); // turning a leaf is not putting the card down (D100)
    if (pageEl) {
      view.pageBack(cardEl.dataset.id, pageEl.dataset.page);
      return;
    }
    const doorEl = event.target.closest('[data-door]');
    if (doorEl) {
      view.tapDoor(cardEl.dataset.id, doorEl);
      return;
    }
    if (view.spreadPile(cardEl.dataset.id)) return; // a pile opens before any card in it is read
    if (!cardEl.classList.contains('card--backed')) return;
    queue.push({ run: view.flipJob(cardEl.dataset.id), maxMs: 1800 }); // exchange + slack
  });

  // The scrub (D78): press = one card; held, our own timer rushes through the
  // stream — never the OS key-repeat, which can be slow or off entirely.
  // A tap is exactly one card; the rush begins only on a deliberate hold, past
  // HOLD_MS. Without the delay a normal keypress (~120 ms) outlasts the 70 ms
  // interval and deals two or three from one press — the fast-forward-on-a-tap bug.
  const HOLD_MS = 300;
  let scrub = null;
  const startScrub = (action) => {
    stopScrub();
    const step = () => tl.dispatch(action, events().length);
    step(); // the press itself
    const s = { timer: setTimeout(() => { s.timer = setInterval(step, 70); }, HOLD_MS) };
    scrub = s;
  };
  const stopScrub = () => {
    if (!scrub) return;
    clearTimeout(scrub.timer);
    clearInterval(scrub.timer);
    scrub = null;
  };
  field.addEventListener('pointerdown', (event) => {
    if (rig || event.button !== 0) return;
    if (event.target.closest('.card, a, .keys-btn, .add-btn')) return;
    if (view.pileOpen() || view.inHand() != null) return; // the press that steps back does not also step the stream
    startScrub('step');
  });
  addEventListener('pointerup', stopScrub);
  addEventListener('pointercancel', stopScrub);

  // The hand door (D79/D85): the sheet lays into this tab's own fork through
  // the direct sink; deposit.html reaches any table tab over the broadcast
  // channel — the rig included, where held mode holds arrivals until L arms it.
  attachBroadcastReceiver(stream);
  const sheetOpen = () => document.querySelector('.sheet') != null;
  // Tapping the name picks another of the cohort and reopens signed as them —
  // the same claimGate the castle uses (D138), here fed by the seed's roster.
  const switchDemoName = async () => {
    document.querySelector('.sheet')?.remove();
    const got = await claimGate({ container: document.body, people: demoAuthors, me: demoMe, onClaim: async (name) => ({ name }) });
    demoMe = got.name;
    openTheSheet();
  };
  const openTheSheet = (prefill = null) => {
    if (sheetOpen()) return;
    openSheet({
      mode: 'overlay', container: document.body, sink: directSink(stream), prefill,
      me: demoMe, people: demoAuthors,
      onSwitchName: demoAuthors.length ? switchDemoName : null,
      // the author's own cards, so a new one can be linked as a follow-up (D145)
      myCards: () => stream.all()
        .filter((e) => e.e === 'deposit' && (e.artifact.people ?? []).includes(demoMe))
        .map((e) => e.artifact),
    });
  };

  // The ? on the table, from the start (D77): plain help for every visitor,
  // keys where keys exist, and on the deployed page the deal control (D78) —
  // d is pause/play; at a full table it re-deals from empty.
  const toggleDeal = () => {
    const n = events().length;
    if (tl.state.mode === 'held') tl.dispatch(tl.state.cursor >= n ? 'replay' : 'resume', n);
    else tl.dispatch('pause', n);
  };
  attachHelper(field, {
    withKeys: rig,
    tail: tailCount > 0, // the m row stands only while a tail is held (D111)
    deal: rig ? null : {
      label: () => (tl.state.mode === 'held' ? 'mode: manual — d resumes auto' : 'mode: auto — d pauses'),
      toggle: toggleDeal,
    },
  });

  if (rig) {
    const root = document.documentElement;
    root.classList.add('rig'); // no + on the wood
    // The arrow is hidden while the mouse is still — nothing screen-like resting
    // on the projection — but a presenter driving this on a screen can move to
    // summon it, and it fades again two seconds after they stop (D179).
    root.classList.add('rig--still');
    let stillTimer = null;
    addEventListener('mousemove', () => {
      root.classList.remove('rig--still');
      clearTimeout(stillTimer);
      stillTimer = setTimeout(() => root.classList.add('rig--still'), 2000);
    });
    attachDriver((intent) => tl.dispatch(intent, events().length));
    // ?rig&live is the room: deal the opening pass and rest live (D178), so a
    // deposit lands on its own without anyone pressing →. ?rig alone is the
    // shoot: held and empty, dealt on cue. The driver keys still conduct either way.
    if (live) tl.dispatch('boot-pass', events().length);
    else view.renderInstant(S(0));
    settleFlip();
    return;
  }

  // Deployed keys (D53/D103): → forward, ← back — held, they scrub fast; Space
  // is Enter's twin and nothing else — it opens the sheet, it never steps the
  // table; D pauses/resumes, R clears, ? help. Nothing else.
  addEventListener('keydown', (event) => {
    if (sheetOpen()) return; // an open sheet takes the keyboard — typing is typing
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (key === ' ') event.preventDefault(); // Safari scrolls the viewport regardless of overflow
    if (key === 'ArrowRight' || key === '>' || key === '.') {
      if (!event.repeat) startScrub('step'); // our own timer; OS repeats are ignored
    } else if (key === 'ArrowLeft' || key === '<' || key === ',') {
      if (!event.repeat) startScrub('back');
    } else if (!event.repeat && key.toLowerCase() === 'd') {
      toggleDeal();
    } else if (!event.repeat && key.toLowerCase() === 'r') {
      tl.dispatch('reset', events().length); // clear to empty, held
    } else if (!event.repeat && (key === 'Enter' || key === ' ')) {
      // the +'s keys (D98/D99). The editor mounts and focuses within this same
      // task (its module is already warm), so without preventDefault the browser
      // delivers Enter's own newline into the fresh page.
      event.preventDefault();
      openTheSheet();
    }
  });
  addEventListener('keyup', (event) => {
    const key = event.key;
    if (key === 'ArrowRight' || key === '>' || key === '.' || key === 'ArrowLeft' || key === '<' || key === ',') stopScrub();
  });

  // The + in the pool's other quiet corner (D91): the hand door's own door,
  // the ?'s mirror. Tapping it opens the sheet.
  const addBtn = document.createElement('div');
  addBtn.className = 'add-btn';
  addBtn.textContent = '+';
  addBtn.addEventListener('pointerdown', () => warmEditor()); // the editor module is on its way before the tap lands
  addBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openTheSheet();
  });
  field.append(addBtn);
  setTimeout(() => warmEditor(), 800); // the module is warm long before anyone reaches for the +

  // Dropping a file anywhere on the table opens the sheet pre-filled (D79) —
  // the sheet's own drop zone handles drops while it is open.
  addEventListener('dragover', (event) => event.preventDefault());
  addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) openTheSheet({ file });
  });

  if (params.has('sheet')) openTheSheet(); // dev-only: the sheet's screenshot surface — never linked

  // Deployed: the opening pass — deferred while hidden, never skipped (arrivals
  // are owed the greeting); mid-pass hide flushes to settled (no rerun owed).
  view.renderInstant(S(0));
  const startPass = () => tl.dispatch('boot-pass', events().length);
  if (document.hidden) {
    const onVisible = () => {
      if (document.hidden) return;
      removeEventListener('visibilitychange', onVisible);
      startPass();
    };
    addEventListener('visibilitychange', onVisible);
  } else {
    startPass();
  }
  addEventListener('visibilitychange', () => {
    if (document.hidden) tl.dispatch('hide-flush', events().length);
  });
}

main().catch((err) => console.error(err));
