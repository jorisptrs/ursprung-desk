// Entry. Wires log → clock → queue → view. No table state of its own:
// everything drawn is fold(events, t) mapped by the view (D38); everything
// moving is one queue job (D13). Boot modes: deployed (the D12 opening pass,
// deferred while hidden, then live) · ?rig (held, driver, no cursor) ·
// ?specimens (still life) · ?cursor=k (deterministic screenshot surface).

import { createStream } from './js/stream.js';
import { fold, eventTime } from './js/fold.js';
import { createTimeline, pacing } from './js/timeline.js';
import { createQueue, sleep } from './js/queue.js';
import { createView } from './js/view.js';
import { attachDriver, attachHelper } from './js/driver.js';

const params = new URLSearchParams(location.search);
const field = document.getElementById('field');
const stream = createStream();

async function loadEvents() {
  // ?specimens: dev-only palette surface (D44) — every media, kind, and fallback. Never linked.
  if (params.has('specimens')) {
    const { specimenEvents } = await import('./js/specimens.js');
    return specimenEvents;
  }
  const res = await fetch('seed.json');
  return (await res.json()).events;
}

async function main() {
  for (const ev of await loadEvents()) stream.append(ev);

  const rig = params.has('rig');
  const view = createView(field, { debug: params.has('debug'), rig });
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
    return;
  }
  if (params.has('specimens')) {
    view.renderInstant(S(events().length));
    settleFlip();
    return;
  }
  const stepped = !rig && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tl = createTimeline({ after: rig ? 'held' : 'live', stepped });
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
        const prev = S(k);
        const next = S(k + 1);
        const job = queue.push({
          run: () => view.playEvent(evs[k], prev, next, pace),
          maxMs: pace.delayBefore + Math.max(pace.duration, pace.wait) + 400,
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

  // The flip (D73): a tap on a backed card turns it, through the same queue as
  // arrivals. Backless cards stay silent (D11); the opening pass finishes first.
  field.addEventListener('click', (event) => {
    if (tl.state.mode === 'compressed') return;
    if (event.target.closest('a')) return; // shelved links behave as links
    const cardEl = event.target.closest('.card');
    if (!cardEl?.dataset.id) {
      // an empty-table tap = Space: next card in manual, skip-ahead mid-deal (D78)
      if (!rig) tl.dispatch('step', events().length);
      return;
    }
    const doorEl = event.target.closest('[data-door]');
    if (doorEl) {
      view.tapDoor(cardEl.dataset.id, doorEl);
      return;
    }
    if (!cardEl.classList.contains('card--backed')) return;
    queue.push({ run: view.flipJob(cardEl.dataset.id), maxMs: 1800 }); // exchange + slack
  });

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
    deal: rig ? null : {
      label: () => (tl.state.mode === 'held' ? 'mode: manual — d resumes auto' : 'mode: auto — d pauses'),
      toggle: toggleDeal,
    },
  });

  if (rig) {
    document.documentElement.classList.add('rig'); // cursor: none — no arrow on the wood
    attachDriver((intent) => tl.dispatch(intent, events().length));
    view.renderInstant(S(0)); // held and empty; the operator steps from here
    settleFlip();
    return;
  }

  // Deployed keys (D53): Space advances in any mode (hold to keep dealing in
  // manual), D pauses/resumes the auto deal, ? opens the help. Nothing else.
  addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (event.repeat) {
        if (tl.state.mode === 'held') tl.dispatch('feed', events().length);
        return; // holding never fast-forwards the auto deal
      }
      tl.dispatch('step', events().length);
    } else if (!event.repeat && event.key.toLowerCase() === 'd') {
      toggleDeal();
    }
  });
  addEventListener('keyup', (event) => {
    if (event.key === ' ') tl.dispatch('hand-release', events().length);
  });

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
