// The log. Append-only events — deposits, threads, retirements — in one order.
// Knows nothing of pixels or time policies. Invariant 2 holds here by construction:
// there is no second collection that could diverge from this one.

const MEDIA = ['image', 'audio', 'video', 'text', 'code', 'fold', 'model', 'note'];
const KINDS = ['quest', 'work', 'failure', 'fieldnotes', 'meta'];
const FORMS = ['crop', 'waveform', 'frames', 'sentence', 'lines', 'linework', 'render', 'words'];
const PROVENANCES = ['mcp', 'hand', 'curator']; // doors, never media (D65)
const VISIBILITIES = ['room', 'community', 'public'];

// Blank is not filled: a title of one space is not something a reader can
// read, and the door's own helper has always trimmed — one meaning, one name.
const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;

// A place the desk may point at (D127): a file it laid (a relative path), a
// page on the web, or a blob a door materialized. Anything else — javascript:,
// data:, file: — is not a destination, and no card may carry one into a click.
// Control characters are stripped before the test: browsers ignore them inside
// a URL, so `java\nscript:` is `javascript:` to everyone but a naive regex.
export function isPlace(v) {
  if (typeof v !== 'string') return false;
  const bare = v.replace(/[\u0000-\u0020]/g, '');
  if (!bare) return false;
  if (/^(https?:|blob:)/i.test(bare)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(bare); // no scheme at all: ours, relative
}
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
      // A card must carry something readable — but which one is the maker's
      // choice (D116): a title, a caption, or a line of the work itself. A
      // photograph captioned "one phone, six hands · the walk" needs no title.
      if (!isFilled(a.title) && !isFilled(a.caption) && !isFilled(a.excerpt?.text)) {
        reject('a card needs a title, a caption, or a line of its own');
      }
      if (!PROVENANCES.includes(a.provenance)) reject(`unknown provenance "${a.provenance}"`);
      if (!VISIBILITIES.includes(a.visibility)) reject(`unknown visibility "${a.visibility}"`);
      if (!a.excerpt || typeof a.excerpt !== 'object') reject('artifact needs an excerpt — it is the surface');
      if (!FORMS.includes(a.excerpt.form)) reject(`unknown excerpt form "${a.excerpt?.form}"`);
      // excerpt.src / excerpt.text stay optional: withheld is legal (D6), absent excerpt is not.
      if (a.caption !== undefined && !isFilled(a.caption)) reject('caption, if present, must be a non-empty string');
      if (a.people !== undefined && !(Array.isArray(a.people) && a.people.every(isFilled))) reject('people must be strings');
      // Every card says who made it (D118) — any name, the maker's own choice
      // of how to be named. Nothing arrives on this table anonymously.
      if (!(Array.isArray(a.people) && a.people.some(isFilled))) reject('a card needs an author — any name');
      if (a.detail !== undefined) {
        // an array is an object to typeof, and nothing a back is made of
        if (typeof a.detail !== 'object' || a.detail === null || Array.isArray(a.detail)) reject('detail must be an object');
        const ex = a.detail.experience; // D72: one experience per back, depositor-set
        if (ex !== undefined) {
          if (!ex || typeof ex !== 'object') reject('experience must be an object');
          if (!['play', 'visit'].includes(ex.mode)) reject(`unknown experience mode "${ex?.mode}"`);
          if (!isFilled(ex.src)) reject('experience needs a src — the door must lead somewhere');
          if (!isPlace(ex.src)) reject('a door leads to a file or a page — not to a script');
          if (ex.demoSrc !== undefined && !isFilled(ex.demoSrc)) reject('demoSrc, if present, must be a non-empty string');
          if (ex.demoSrc !== undefined && !isPlace(ex.demoSrc)) reject('a door leads to a file or a page — not to a script');
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

    // Where each studio stands tonight. The arrangement is judged elsewhere —
    // by whoever or whatever read the work — and enters here as an ordinary
    // appended fact, so `fold` stays a pure function of the log and replay can
    // still walk the four days. A person the arrangement does not mention keeps
    // whatever place the table already gave them.
    if (event.e === 'arrange') {
      const places = event.places;
      if (!places || typeof places !== 'object' || Array.isArray(places)) reject('an arrangement is a set of places');
      const names = Object.keys(places);
      if (!names.length) reject('an arrangement with nobody in it places nothing');
      for (const name of names) {
        if (!isFilled(name)) reject('a place belongs to a name');
        const at = places[name];
        if (!Array.isArray(at) || at.length !== 2) reject(`${name}'s place is an x and a y`);
        if (!at.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) reject(`${name}'s place lies off the table`);
      }
      if (event.why !== undefined && !isFilled(event.why)) reject('why, if present, must say something');
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
