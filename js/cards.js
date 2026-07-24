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

// The two registers that wear a stamp on their face: a quest (a question set to
// the room) and a "Note on Claude" (a candid note on working with Claude).
// Works and the rest carry none — the stamp marks the exception, not the norm.
const STAMPS = { quest: 'Quest', failure: 'Note on Claude' };

// The back as pure data — what the maker curated, nothing else. Null when the
// detail is empty or absent: those cards have no back at all (D5/D11). Hand
// deposits carry an ordered `composition` (D88): text, stills, links, files as
// they were arranged; the legacy fields (assets/links/note) stay legal for the
// seed. A shelved file is a path string or { name, src } — blob originals
// carry no name of their own.
// Every card turns (D180, retires D5/D11's "no back ≡ no open"): a
// card is a token you can pick up and read, even when all it carries is its own
// face and a name. People need to be able to click on every card, so a turn is
// never refused — what it shows is everything the card is: its surface at reading
// size, whatever the maker attached, and, always, who made it. What stays private
// is still `detail`; a card with none opens to its own front and its makers,
// which is no disclosure — it is what the table was already showing.

// The front is the head of the back: a card you turn shows the surface you
// tapped — the image, the take, the lines, the words — at reading size, then
// whatever the maker attached beneath it. The one surface not repeated is a
// waveform: it is a drawing OF the sound the player already holds (§5), and
// carrying it over would only push the play control down and show nothing new.
function frontPiece(artifact) {
  const ex = artifact?.excerpt;
  if (!ex) return null;
  if (ex.src) return ex.form === 'waveform' ? null : { t: 'image', src: ex.src };
  const text = (ex.text ?? '').trim();
  if (!text) return null;
  return { t: artifact.media === 'code' ? 'code' : artifact.media === 'note' ? 'words' : 'text', text };
}
const norm = (s) => (typeof s === 'string' ? s : '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function backModel(artifact) {
  const raw = artifact?.detail;
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
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
  // the surface the card was showing, carried onto the back so turning it never
  // loses the front. A line the maker's own words already carry is not said twice.
  let front = frontPiece(artifact);
  if (front && front.t !== 'image') {
    const carried = norm(front.text);
    const shown = [...composition.filter((e) => e.t === 'text').map((e) => e.text), note].map(norm);
    if (carried && shown.some((s) => s.includes(carried))) front = null;
  }
  // an image front is the head of the back too (D177): a turned card leads with
  // the surface you tapped, then whatever stills the maker set beneath it — the
  // picture you were looking at is never lost on the turn. Shown once: if that
  // same still is already in the arrangement, the composition carries it and the
  // head steps aside (the image twin of the not-said-twice rule above).
  if (front && front.t === 'image' && composition.some((e) => (e.t === 'image' || e.t === 'video') && e.src === front.src)) front = null;
  // a video's frames are a still of the take the player already holds; like the
  // waveform, carrying them onto the back only pushes the play control down and
  // shows nothing new (D177 extended to a playable take). A model's flat render
  // is the same kind of summary of the 3D the back now turns (D190): the front
  // keeps the excerpt, the back shows the work.
  if (front && door?.mode === 'play' && (artifact.media === 'video' || artifact.media === 'model')) front = null;
  // and always the makers: a card names who made it on both faces now (D148/D180)
  const people = (Array.isArray(artifact?.people) ? artifact.people : []).filter((n) => typeof n === 'string' && n.trim());
  const caption = typeof artifact?.caption === 'string' && artifact.caption.trim() ? artifact.caption.trim() : null;
  // a model turns to its 3D (D190); the render still is its poster — shown until
  // the viewer mounts, and wherever there is no WebGL to draw with
  const poster = artifact.media === 'model' ? (artifact.excerpt?.src ?? null) : null;
  return {
    title: artifact.media === 'note' ? null : (artifact.title ?? null),
    media: artifact.media,
    people,
    caption,
    poster,
    front,
    door,
    composition,
    files,
    links,
    note,
  };
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

// A model turns to its 3D where it lies (D190): the back carries a mount the
// viewer fills when the card opens (js/model3d.js, one live context at a time,
// wired in view.js) and, inside it, the render still as a poster — the card
// reads before WebGL draws and wherever there is none. The address is a place
// or nothing, refused a second time here as the players are (D127).
const MODEL_SRC = /\.(obj|glb|gltf)(\?|#|$)/i;
function modelMount(src, poster) {
  if (!isPlace(src)) return null;
  const wrap = document.createElement('div');
  wrap.className = 'back__model';
  wrap.dataset.model = src;
  if (poster) {
    const img = document.createElement('img');
    img.className = 'back__model-poster';
    img.src = poster;
    img.alt = '';
    img.draggable = false;
    wrap.append(img);
  }
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

  // the front, at the head of the back: the surface you tapped, before the more
  if (model.front) {
    if (model.front.t === 'image') {
      const fig = document.createElement('figure');
      fig.className = 'back__piece back__piece--image back__front';
      const im = document.createElement('img');
      im.src = model.front.src;
      im.alt = '';
      im.draggable = false;
      fig.append(im);
      append(fig);
    } else {
      const cls = model.front.t === 'code' ? 'back__code' : model.front.t === 'words' ? 'back__words' : 'back__text';
      const el = document.createElement(model.front.t === 'code' ? 'pre' : 'div');
      el.className = `${cls} back__front`;
      el.textContent = model.front.text;
      append(el);
    }
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
    // is the only thing that knows when the address is a blob (D147) — unless it
    // is a model, whose play is a turning 3D, not a sound (D190)
    if (model.door.mode === 'play' && (model.media === 'model' || MODEL_SRC.test(model.door.src ?? ''))) {
      append(modelMount(model.door.src, model.poster));
    }
    else if (model.door.mode === 'play') {
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
  // the caption's facts, quiet at the foot — the front carries them small, the
  // back gives them room (kept off a note, whose words are already the whole of it)
  if (model.caption && model.media !== 'note') {
    const cap = document.createElement('div');
    cap.className = 'back__cap';
    cap.textContent = model.caption;
    append(cap);
  }
  back.append(flow, buildNav());
  // who made it, pinned at the foot of the turned card in the same tag the face
  // wears (D185): whose work this is stays legible on both sides, and in the same
  // amber, so a flipped card is never anonymous.
  const by = makersLine(model.people);
  if (by) {
    const byline = document.createElement('div');
    byline.className = 'back__by';
    byline.textContent = by;
    back.append(byline);
  }
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

  // the stamp that names the register (D9, amended): a quest is a question set to
  // the room, a "Note on Claude" a candid note on working with Claude — each
  // marked as what it is and pressed on like a stamp so it stands out from the
  // works, on the page and never through the words it carries (D191). A "Note
  // about Claude" is about working with Claude, never a judgment of the person.
  const register = STAMPS[artifact.kind];
  if (register) {
    const stamp = document.createElement('div');
    stamp.className = `card-stamp card-stamp--${artifact.kind}`;
    stamp.textContent = register;
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
