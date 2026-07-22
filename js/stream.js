// The log. Append-only events — deposits, threads, retirements — in one order.
// Knows nothing of pixels or time policies. Invariant 2 holds here by construction:
// there is no second collection that could diverge from this one.

const MEDIA = ['image', 'audio', 'video', 'text', 'code', 'fold', 'model', 'note'];
const KINDS = ['quest', 'work', 'failure', 'fieldnotes', 'meta'];
const FORMS = ['crop', 'waveform', 'frames', 'sentence', 'lines', 'linework', 'render', 'words'];
const PROVENANCES = ['mcp', 'hand', 'curator']; // doors, never media (D65)
const VISIBILITIES = ['room', 'community', 'public'];

const isFilled = (v) => typeof v === 'string' && v.length > 0;
const reject = (msg) => { throw new Error(`stream reject: ${msg}`); };

export function createStream() {
  const events = [];
  const artifacts = new Map();
  const listeners = [];

  function validate(event) {
    if (!event || typeof event !== 'object') reject('event must be an object');
    if (!Number.isInteger(event.night) || event.night < 0) reject('night must be a non-negative integer');

    if (event.e === 'deposit') {
      const a = event.artifact;
      if (!a || typeof a !== 'object') reject('deposit needs an artifact');
      if (!isFilled(a.id)) reject('artifact needs an id');
      if (artifacts.has(a.id)) reject(`duplicate id ${a.id}`);
      if (!MEDIA.includes(a.media)) reject(`unknown media "${a.media}"`);
      if (!KINDS.includes(a.kind)) reject(`unknown kind "${a.kind}"`);
      if (!isFilled(a.title)) reject('artifact needs a title');
      // D17 amended 2026-07-22: practice is optional at the door — the seed and
      // the curator still fill it; if present it must carry a word.
      if (a.practice !== undefined && !isFilled(a.practice)) reject('practice, if present, must be a non-empty string');
      if (!PROVENANCES.includes(a.provenance)) reject(`unknown provenance "${a.provenance}"`);
      if (!VISIBILITIES.includes(a.visibility)) reject(`unknown visibility "${a.visibility}"`);
      if (!a.excerpt || typeof a.excerpt !== 'object') reject('artifact needs an excerpt — it is the surface');
      if (!FORMS.includes(a.excerpt.form)) reject(`unknown excerpt form "${a.excerpt?.form}"`);
      // excerpt.src / excerpt.text stay optional: withheld is legal (D6), absent excerpt is not.
      if (a.caption !== undefined && !isFilled(a.caption)) reject('caption, if present, must be a non-empty string');
      if (a.people !== undefined && !(Array.isArray(a.people) && a.people.every(isFilled))) reject('people must be strings');
      if (a.detail !== undefined) {
        if (typeof a.detail !== 'object') reject('detail must be an object');
        const ex = a.detail.experience; // D72: one experience per back, depositor-set
        if (ex !== undefined) {
          if (!ex || typeof ex !== 'object') reject('experience must be an object');
          if (!['play', 'visit'].includes(ex.mode)) reject(`unknown experience mode "${ex?.mode}"`);
          if (!isFilled(ex.src)) reject('experience needs a src — the door must lead somewhere');
          if (ex.demoSrc !== undefined && !isFilled(ex.demoSrc)) reject('demoSrc, if present, must be a non-empty string');
        }
      }
      return;
    }

    if (event.e === 'thread') {
      if (!isFilled(event.from) || !isFilled(event.to)) reject('thread needs from and to');
      if (event.from === event.to) reject('thread cannot self-reference');
      // D16: threads only reference artifacts already in the stream.
      if (!artifacts.has(event.from)) reject(`thread from unknown artifact ${event.from}`);
      if (!artifacts.has(event.to)) reject(`thread to unknown artifact ${event.to}`);
      return;
    }

    if (event.e === 'retire') {
      if (!artifacts.has(event.id)) reject(`retire of unknown artifact ${event.id}`);
      return;
    }

    reject(`unknown event type "${event.e}"`);
  }

  function append(event) {
    validate(event);
    events.push(event);
    if (event.e === 'deposit') artifacts.set(event.artifact.id, event.artifact);
    for (const fn of listeners) fn(event);
    return event;
  }

  return {
    append,
    onAppend: (fn) => listeners.push(fn),
    all: () => events, // read-only by convention; the fold never mutates
    artifact: (id) => artifacts.get(id),
  };
}
