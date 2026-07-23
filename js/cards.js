// Artifact → card. The only module that knows what an artifact looks like (invariant 4).
// The desk attests; it never performs: every trace is a still, text is textContent, never markup.

import { fnv1a, mulberry32 } from './geom.js';
import { isPlace } from './stream.js';

// Every sheet's corners are cut a little differently. Deterministic per card (D24):
// elliptical per-corner radii hashed from the id — salted so the corner draw can
// never shift the placement draw. Range kept tight: worn paper, not melted UI.
export function cornerRadii(id) {
  const rng = mulberry32(fnv1a(id + ':corners'));
  const h = [];
  const v = [];
  for (let i = 0; i < 4; i++) {
    const hr = 0.1 + rng() * 0.45; // 0.10–0.55em against the card's own type size
    // Drawn independently, so a curve may lean into one edge — clamped to a
    // 0.4–2.5× lean: sometimes clearly one-sided, never a degenerate sliver.
    const vr = Math.min(Math.max(0.1 + rng() * 0.45, hr * 0.4), hr * 2.5);
    h.push(`${hr.toFixed(2)}em`);
    v.push(`${vr.toFixed(2)}em`);
  }
  return `${h.join(' ')} / ${v.join(' ')}`;
}

function img(artifact, className = '') {
  const el = document.createElement('img');
  el.src = artifact.excerpt.src;
  el.alt = artifact.title ?? artifact.caption ?? '';
  el.draggable = false;
  if (className) el.className = className;
  return el;
}

function textTrace(artifact) {
  if (!artifact.excerpt.text) { // withheld: faint ruled lines, the title carries what's known (D6)
    const el = document.createElement('div');
    el.className = 'trace--ruled';
    return el;
  }
  const el = document.createElement('div');
  el.className = 'trace--sentence';
  el.textContent = artifact.excerpt.text;
  return el;
}

function codeTrace(artifact) {
  if (!artifact.excerpt.text) { // withheld: faint monospace dashes (D6)
    const el = document.createElement('div');
    el.className = 'trace--dashes';
    el.textContent = '–– ––– ––\n––– –– ––––\n–– ––––';
    return el;
  }
  const el = document.createElement('pre');
  el.className = 'trace--lines';
  el.textContent = artifact.excerpt.text;
  return el;
}

function wordsTrace(artifact) {
  const el = document.createElement('div');
  el.className = 'trace--words';
  el.textContent = artifact.excerpt.text ?? artifact.title ?? '';
  return el;
}

// video and model draw through the image path — frames and renders are stills (D29)
const TRACES = {
  image: img,
  video: img,
  model: img,
  fold: img,
  audio: img, // pre-rendered waveform asset (D7)
  text: textTrace,
  code: codeTrace,
  note: wordsTrace,
};

const basename = (path) => path.split('/').pop();

// The back as pure data — what the maker curated, nothing else. Null when the
// detail is empty or absent: those cards have no back at all (D5/D11). Hand
// deposits carry an ordered `composition` (D88): text, stills, links, files as
// they were arranged; the legacy fields (assets/links/note) stay legal for the
// seed. A shelved file is a path string or { name, src } — blob originals
// carry no name of their own.
// A card turns if there is more to see than the table can show at pile size —
// a still you want to look at properly, words that were clipped to fit
// (keeper's ruling). That is not a disclosure: it is the card's own surface at
// reading size, and what stays private is `detail`, which is still what carries
// the originals, the files and the links (D5/D11 unchanged in substance).
// A quest or a note on Claude that is nothing but its own sentence has nothing
// more to give, and stays shut.
// A photograph, a crease pattern, a rendering: things where looking closer
// tells you more. Not a waveform or a frame strip — those are summaries of a
// work, and blowing up a summary shows nothing the front did not. Keeping them
// out also keeps a withdrawal a withdrawal: the seed's dish lost its footage,
// and its strip standing larger would have been a card that opens on nothing.
const SHOWS_BIGGER = ['crop', 'linework', 'render'];
const CLIPPED_AT = 180; // characters a pile-sized card can carry without cutting

export function opensOnItsOwn(artifact) {
  const form = artifact?.excerpt?.form;
  if (SHOWS_BIGGER.includes(form) && artifact.excerpt?.src) return true;
  return (artifact?.excerpt?.text ?? '').trim().length > CLIPPED_AT;
}

export function backModel(artifact) {
  const d = artifact?.detail;
  if (!d || typeof d !== 'object') {
    if (!opensOnItsOwn(artifact)) return null;
    // the surface itself, at reading size — nothing the front was not already
    // showing, only large enough to read or to look at
    return {
      title: artifact.media === 'note' ? null : artifact.title,
      media: artifact.media,
      door: null,
      composition: artifact.excerpt.src
        ? [{ t: 'image', src: artifact.excerpt.src, caption: artifact.caption ?? '' }]
        : [{ t: 'text', text: artifact.excerpt.text }],
      files: [],
      links: [],
      note: null,
    };
  }
  const door = d.experience
    ? { mode: d.experience.mode, src: d.experience.src, demoSrc: d.experience.demoSrc ?? null }
    : null;
  const composition = (Array.isArray(d.composition) ? d.composition : [])
    .filter((e) => e && typeof e === 'object' && typeof e.t === 'string');
  const files = (Array.isArray(d.assets) ? d.assets : [])
    .map((x) => (typeof x === 'string' ? { src: x, name: basename(x) } : { src: x?.src, name: x?.name ?? basename(x?.src ?? '') }))
    .filter((x) => x.src);
  const links = Array.isArray(d.links) ? d.links : [];
  const note = typeof d.note === 'string' && d.note.length > 0 ? d.note : null;
  if (!door && !composition.length && !files.length && !links.length && !note) return null;
  // a note card's words are already its face — the back doesn't repeat them (D40)
  return { title: artifact.media === 'note' ? null : artifact.title, media: artifact.media, door, composition, files, links, note };
}

// The back renders the maker's arrangement: quiet text, stills of the pieces
// (§5 sanctions the full image on a back), links as plain outward lines — and
// **a sound or a take plays where it lies** (keeper's ruling, amends D30/D75).
// A recording reached by a link is a download, which is not what a card is for:
// it leaves the table for a file manager. So the back carries the player, ready
// the moment the card turns, and the one word that used to summon it is gone.
// The stream refuses a door that is not a place (D127); the renderer refuses
// it a second time, because a back is built from whatever a maker arranged and
// this is the one spot where that arrangement becomes a click.
const AUDIO = /\.(m4a|mp3|wav|ogg|oga|aac|flac|opus)(\?|#|$)/i;
const VIDEO = /\.(mp4|mov|webm|m4v|ogv)(\?|#|$)/i;

// What kind of thing this is, asked of the arrangement first and the address
// second. A hand deposit's recording is a `blob:` URL with no extension at all —
// only the piece's own type, or the filename it was dropped under, knows.
export function playsAs(src, { kind = null, name = null } = {}) {
  if (kind === 'audio' || kind === 'video') return kind;
  for (const s of [src, name]) {
    if (typeof s !== 'string') continue;
    if (AUDIO.test(s)) return 'audio';
    if (VIDEO.test(s)) return 'video';
  }
  return null;
}
export const playable = (src, hints) => playsAs(src, hints) !== null;

// A player on the parchment, in the desk's own hand: a mark to press and a
// thin line to travel, the same amber a thread is drawn in. The browser's
// transport is a white pill with three dots on candlelight — the one place the
// desk builds its own control rather than borrowing one, because there is no
// borrowed one that belongs here. Nothing autoplays: the table makes no sound
// nobody asked for. The wiring lives in view.js; this only lays it out.
function playerFor(src, { rig = false, demoSrc = null, kind = null, name = null } = {}) {
  const use = !rig && demoSrc ? demoSrc : src; // the deployed page plays the derivative (D75)
  const as = playsAs(use, { kind, name });
  if (!isPlace(use) || !as) return null;

  const media = document.createElement(as);
  media.src = use;
  media.preload = 'metadata';
  if (as === 'video') media.playsInline = true;

  const wrap = document.createElement('div');
  wrap.className = `back__play back__play--${as}`;
  wrap.dataset.plays = ''; // the tap that works a player is not the tap that lays the card down

  // drawn rather than typed: ▶ and ▮▮ are different weights and sit on
  // different baselines, so the bar twitched every time it was pressed
  const mark = document.createElement('span');
  mark.className = 'play__mark';
  mark.dataset.mark = 'play';

  const line = document.createElement('span');
  line.className = 'play__line';
  line.dataset.seek = '';
  const run = document.createElement('span');
  run.className = 'play__run';
  line.append(run);

  const at = document.createElement('span');
  at.className = 'play__at';
  at.dataset.at = '';

  if (as === 'video') { // the take shows; the transport sits under it
    const frame = document.createElement('div');
    frame.className = 'play__frame';
    frame.append(media);
    wrap.append(frame);
  } else {
    wrap.append(media);
  }
  const bar = document.createElement('div');
  bar.className = 'play__bar';
  bar.append(mark, line, at);
  wrap.append(bar);
  return wrap;
}

function line(text, href, download = null) {
  if (!isPlace(href)) return null;
  const a = document.createElement('a');
  a.className = 'back__line';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  if (download && href.startsWith('blob:')) a.download = download; // a shelved original keeps its own name
  a.textContent = text;
  return a;
}

// The leaves of a long back (D100): a card in hand shows one page at a time,
// and the bar names where you are. Two words wide, the desk's tap grammar.
function buildNav() {
  const nav = document.createElement('div');
  nav.className = 'back__nav';
  const prev = document.createElement('span');
  prev.className = 'back__page';
  prev.dataset.page = 'prev';
  prev.textContent = '‹';
  const count = document.createElement('span');
  count.className = 'back__count';
  const next = document.createElement('span');
  next.className = 'back__page';
  next.dataset.page = 'next';
  next.textContent = '›';
  nav.append(prev, count, next);
  return nav;
}

function buildBack(model, opts = {}) {
  const back = document.createElement('div');
  back.className = 'card__back';
  // the arrangement lives in a flow the card can slide a page at a time; the
  // back itself is the window, and the player (D75) covers it whole
  const flow = document.createElement('div');
  flow.className = 'back__flow';
  const append = (node) => { if (node) flow.append(node); }; // a refused line is simply absent (D127)

  if (model.title) {
    const title = document.createElement('div');
    title.className = 'back__title';
    title.textContent = model.title;
    append(title);
  }

  const played = new Set(); // one player per recording, however many ways the back names it
  const play = (src, hints = {}) => {
    if (!src || played.has(src)) return null;
    const el = playerFor(src, { ...opts, ...hints });
    if (el) played.add(src);
    return el;
  };

  if (model.door) {
    // a 'play' door IS a recording — the card's own media says which sort, which
    // is the only thing that knows when the address is a blob (D147)
    if (model.door.mode === 'play') {
      append(play(model.door.src, { demoSrc: model.door.demoSrc, kind: model.media === 'video' ? 'video' : 'audio' }));
    }
    else {
      const door = document.createElement('div');
      door.className = 'back__door';
      door.dataset.door = model.door.mode;
      door.textContent = 'visit ↗';
      append(door);
    }
  }

  for (const entry of model.composition) {
    if (entry.t === 'text') {
      const p = document.createElement('div');
      p.className = 'back__text';
      p.textContent = entry.text ?? '';
      append(p);
    } else if (entry.t === 'file') {
      if (!entry.src) continue;
      if (playable(entry.src, { name: entry.name })) append(play(entry.src, { name: entry.name }));
      else append(line(entry.name ?? basename(entry.src), entry.src, entry.name));
    } else if (entry.t === 'link' && !entry.embed) {
      if (entry.href) append(line(entry.href, entry.href));
    } else { // image · audio · video · embedded link — a still of the piece
      const src = entry.t === 'link' ? entry.embed : entry.src;
      if (!src) continue;
      const fig = document.createElement('figure');
      fig.className = `back__piece back__piece--${entry.t}`;
      const img = document.createElement('img');
      img.src = src;
      img.alt = entry.caption ?? '';
      img.draggable = false;
      fig.append(img);
      const fileLine = entry.orig ? (entry.name ?? 'original') : null;
      if (entry.caption && entry.caption !== fileLine) { // never say the filename twice
        const cap = document.createElement('figcaption');
        cap.className = 'back__caption';
        cap.textContent = entry.caption;
        fig.append(cap);
      }
      append(fig);
      if (entry.t === 'link' && entry.href) append(line(entry.href, entry.href));
      else if (entry.orig && playable(entry.orig, { kind: entry.t, name: entry.name })) {
        append(play(entry.orig, { kind: entry.t, name: entry.name }));
      } else if (entry.orig) append(line(fileLine, entry.orig, entry.name));
    }
  }

  for (const f of model.files) {
    append(playable(f.src, { name: f.name }) ? play(f.src, { name: f.name }) : line(f.name, f.src, f.name));
  }
  for (const href of model.links) append(line(href, href));
  if (model.note) {
    const note = document.createElement('div');
    note.className = 'back__note';
    note.textContent = model.note;
    append(note);
  }
  back.append(flow, buildNav());
  return back;
}

export function makersLine(people) {
  const named = (Array.isArray(people) ? people : []).filter((n) => typeof n === 'string' && n.trim());
  const humans = named.filter((n) => n.trim() !== 'Claude');
  const withClaude = humans.length !== named.length;
  if (!humans.length) return withClaude ? 'Claude' : '';
  return `${humans.map((n) => `@${n.trim()}`).join(' ')}${withClaude ? ' + Claude' : ''}`;
}

export function renderCard(artifact, opts = {}) {
  const el = document.createElement('article');
  el.className = `card card--${artifact.media} kind--${artifact.kind}`;
  el.style.borderRadius = cornerRadii(artifact.id);

  const front = document.createElement('div');
  front.className = 'card__front';

  if (artifact.kind === 'failure') {
    // the stamp that says what register this is (D9, amended again with the
    // rename): a small diagonal "Claude" with "note" beside it. It is about
    // working with Claude — a let-down or a surprise — and never a judgment of
    // the person's work.
    const stamp = document.createElement('div');
    stamp.className = 'failure-stamp';
    const who = document.createElement('span');
    who.className = 'failure-stamp__who';
    who.textContent = 'Claude';
    const what = document.createElement('span');
    what.textContent = 'note';
    stamp.append(who, what);
    front.append(stamp);
  }

  // A card is its work and one line naming it (keeper's ruling, D163 amended):
  // the trace is the work — a still, a waveform, the words themselves — and
  // above it stands ONE label, the title if there is one and the caption
  // otherwise. Three stacked texts per card was most of the noise on a full
  // table; the work itself was never the noise.
  const label = [artifact.title, artifact.caption]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean) ?? '';
  const words = (artifact.excerpt?.text ?? '').trim();
  // …and where the label would only say the work back to you, the work stands
  // alone: a note whose words ARE its title carries the line once (D40).
  const sayItTwice = words && label && (words === label || words.startsWith(label));

  const trace = document.createElement('div');
  trace.className = 'card__trace';
  trace.append((TRACES[artifact.media] ?? img)(artifact));
  // A take says it is a take (D119): the strip alone reads as three photographs.
  // A mark, not a control — the gesture is still the turn, and the door on the
  // back is what summons it (D72/D75).
  if (artifact.media === 'video') {
    const mark = document.createElement('div');
    mark.className = 'trace__play';
    trace.append(mark);
  }
  front.append(trace);

  if (label && !sayItTwice) {
    const line = document.createElement('div');
    line.className = 'card__title';
    line.textContent = label;
    front.append(line);
  }

  // Whose card this is, in the room's own grammar (D137): the makers as they
  // would be mentioned. The table is a map of studios now, so the top of a pile
  // has to say whose pile it is — the name is not decoration, it is the address.
  // Claude reads "+ Claude" beside the humans and alone only for its own work:
  // a card credited "E. + Claude" is E.'s (§3), and the front must not suggest
  // otherwise.
  const by = makersLine(artifact.people);
  if (by) {
    const line = document.createElement('div');
    line.className = 'card__by';
    line.textContent = by;
    front.append(line);
  }

  // The pivot is the part that turns: opacity and shadow live on the card
  // outside it, or they'd flatten the 3D context and mirror the front.
  const pivot = document.createElement('div');
  pivot.className = 'card__pivot';
  pivot.append(front);

  const model = backModel(artifact);
  if (model) {
    el.classList.add('card--backed');
    pivot.append(buildBack(model, opts));
  }

  el.append(pivot);
  return el;
}
