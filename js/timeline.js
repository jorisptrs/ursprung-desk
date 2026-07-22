// The clock. Only this module maps intent to table time; the view is only ever
// told "animate one more event at this tempo" (D26: the driver conducts, never
// fabricates). Pure state machine — reduce(state, action, n) → { state, effects } —
// so the whole key-spam matrix is node truth. The cursor is event-granular: the
// table is always a settled fold state or tweening to the next one.
//
// Modes: held (rig rest; step advances one), live (target pinned to the stream,
// later appends play as they land), compressed (the full stream from empty —
// one policy, two entrances: the D12 opening pass at boot, R under the driver).
//
// Effects, for the shell to execute: 'sync' (flush motion, render the cursor's
// settled state instantly — scene changes are not motion), 'drain' (start
// playing toward target).

export const LIVE_MS = 1600; // furniture-slow arrival
export const PASS_MS = 15000; // opening-pass budget, mid of D12's 12–18 s window
export const REST_MS = 1000; // beat on the empty pool before the first quest
export const BEAT_MS = 500; // breath between nights — four days read as four waves
export const EVENT_MIN_MS = 350; // pacing is budget-first; these clamp the derived tempo
export const EVENT_MAX_MS = 900;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function initialState({ after = 'live', stepped = false } = {}) {
  // after: where a finished compressed run rests — 'live' (deployed) or 'held' (rig).
  // stepped: prefers-reduced-motion — instant placements on the same cadence.
  return { mode: 'held', cursor: 0, target: 0, after, stepped };
}

export function reduce(state, action, n) {
  const none = { state, effects: [] };
  switch (action) {
    case 'boot-pass': // D12: the opening pass is replay entered at boot
    case 'replay':
      return { state: { ...state, mode: 'compressed', cursor: 0, target: n }, effects: ['sync', 'drain'] };
    case 'step':
      // Space, in any mode (D78): mid-deal it snaps the card in flight so the
      // next starts now; held, it deals one more — press-through at any speed.
      if (state.mode !== 'held') return { state, effects: ['finish'] };
      if (state.target >= n) return none;
      return { state: { ...state, target: state.target + 1 }, effects: ['finish', 'drain'] };
    case 'feed': // Space held down: keep exactly one card queued while keys repeat
      if (state.mode !== 'held' || state.target >= n || state.target - state.cursor > 1) return none;
      return { state: { ...state, target: state.target + 1 }, effects: ['drain'] };
    case 'hand-release': // Space released: the card in flight lands, then the table holds
      if (state.mode !== 'held') return none;
      return { state: { ...state, target: Math.min(state.target, state.cursor + 1) }, effects: [] };
    case 'pause': // d mid-deal: snap the card in flight placed, hold right here — nothing clears
      if (state.mode !== 'compressed' && state.mode !== 'live') return none;
      return { state: { ...state, mode: 'held', target: Math.min(state.target, state.cursor + 1) }, effects: ['finish'] };
    case 'resume': // d from held with cards remaining: deal the rest at pass cadence
      if (state.mode !== 'held' || state.cursor >= n) return none;
      return { state: { ...state, mode: 'compressed', target: n }, effects: ['drain'] };
    case 'reset':
      return { state: { ...state, mode: 'held', cursor: 0, target: 0 }, effects: ['sync'] };
    case 'end':
      return { state: { ...state, mode: 'held', cursor: n, target: n }, effects: ['sync'] };
    case 'live-toggle':
      if (state.mode === 'live') {
        // pause after the current gesture — never mid-flight
        return { state: { ...state, mode: 'held', target: Math.min(state.target, state.cursor + 1, n) }, effects: [] };
      }
      if (state.mode === 'held') {
        return { state: { ...state, mode: 'live', target: n }, effects: ['drain'] };
      }
      return none;
    case 'appended':
      if (state.mode !== 'live') return none; // held/compressed pick it up on their next transition
      return { state: { ...state, target: n }, effects: ['drain'] };
    case 'played': // one gesture settled
      return { state: { ...state, cursor: Math.min(state.cursor + 1, state.target) }, effects: [] };
    case 'drained': { // cursor reached target and the queue is idle
      if (state.mode !== 'compressed') return none;
      const mode = state.after;
      return { state: { ...state, mode, target: mode === 'live' ? n : state.target }, effects: [] };
    }
    case 'hide-flush': // tab hidden mid-pass: arrivals are owed the greeting, returners no rerun
      if (state.mode !== 'compressed') return none;
      return { state: { ...state, mode: state.after, cursor: n, target: n }, effects: ['sync'] };
    default:
      return none;
  }
}

// Budget-first pacing: the pass length is fixed and the per-event tempo derived,
// so the seed growing can never silently stretch past D12's window.
export function compressedEventMs(events) {
  let beats = 0;
  for (let i = 1; i < events.length; i++) {
    if (events[i].night !== events[i - 1].night) beats++;
  }
  const budget = PASS_MS - REST_MS - beats * BEAT_MS;
  return clamp(budget / Math.max(1, events.length), EVENT_MIN_MS, EVENT_MAX_MS);
}

export function pacing(state, events, k) {
  // → { duration, delayBefore, wait } (ms) for the gesture playing event k.
  // duration: the tween; delayBefore: rest/beat ahead of it; wait: the
  // post-placement hold in stepped mode, where placements are instant but the
  // cadence still narrates. One gesture at a time, always (D13).
  if (state.mode !== 'compressed') {
    return { duration: state.stepped ? 0 : LIVE_MS, delayBefore: 0, wait: 0 };
  }
  const eventMs = compressedEventMs(events);
  const delayBefore = k === 0 ? REST_MS : events[k].night !== events[k - 1].night ? BEAT_MS : 0;
  if (state.stepped) return { duration: 0, delayBefore, wait: eventMs };
  return { duration: eventMs, delayBefore, wait: 0 };
}

export function createTimeline(opts) {
  let state = initialState(opts);
  const listeners = [];
  return {
    get state() { return state; },
    dispatch(action, n) {
      const r = reduce(state, action, n);
      state = r.state;
      if (r.effects.length) for (const fn of listeners) fn(r.effects, action);
      return r.effects;
    },
    onEffects: (fn) => listeners.push(fn),
  };
}
