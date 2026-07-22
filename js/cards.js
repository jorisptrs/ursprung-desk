// Artifact → card. The only module that knows what an artifact looks like (invariant 4).
// The desk attests; it never performs: every trace is a still, text is textContent, never markup.

import { fnv1a, mulberry32 } from './fold.js';

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
  el.alt = artifact.title;
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
  el.textContent = artifact.excerpt.text ?? artifact.title;
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
export function backModel(artifact) {
  const d = artifact.detail;
  if (!d || typeof d !== 'object') return null;
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
  return { title: artifact.media === 'note' ? null : artifact.title, door, composition, files, links, note };
}

// The back renders the maker's arrangement: quiet text, stills of the pieces
// (§5 sanctions the full image on a back), links and files as plain outward
// lines — never embedded players (D30); the door alone summons (D72).
function line(text, href, download = null) {
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

function buildBack(model) {
  const back = document.createElement('div');
  back.className = 'card__back';
  // the arrangement lives in a flow the card can slide a page at a time; the
  // back itself is the window, and the player (D75) covers it whole
  const flow = document.createElement('div');
  flow.className = 'back__flow';
  const append = (node) => flow.append(node);

  if (model.title) {
    const title = document.createElement('div');
    title.className = 'back__title';
    title.textContent = model.title;
    append(title);
  }

  if (model.door) {
    const door = document.createElement('div');
    door.className = 'back__door';
    door.dataset.door = model.door.mode;
    door.textContent = model.door.mode === 'play' ? 'play' : 'visit ↗';
    append(door);
  }

  for (const entry of model.composition) {
    if (entry.t === 'text') {
      const p = document.createElement('div');
      p.className = 'back__text';
      p.textContent = entry.text ?? '';
      append(p);
    } else if (entry.t === 'file') {
      if (entry.src) append(line(entry.name ?? basename(entry.src), entry.src, entry.name));
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
      else if (entry.orig) append(line(fileLine, entry.orig, entry.name));
    }
  }

  for (const f of model.files) append(line(f.name, f.src, f.name));
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

export function renderCard(artifact) {
  const el = document.createElement('article');
  el.className = `card card--${artifact.media} kind--${artifact.kind}`;
  el.style.borderRadius = cornerRadii(artifact.id);

  const front = document.createElement('div');
  front.className = 'card__front';

  if (artifact.kind === 'failure') {
    // the stamp that says whose reject this is (D9 amended): a small diagonal
    // "Claude" with "failure" beside it — about Claude's usefulness, never a
    // judgment of the person's work
    const stamp = document.createElement('div');
    stamp.className = 'failure-stamp';
    const who = document.createElement('span');
    who.className = 'failure-stamp__who';
    who.textContent = 'Claude';
    const what = document.createElement('span');
    what.textContent = 'failure';
    stamp.append(who, what);
    front.append(stamp);
  }

  const trace = document.createElement('div');
  trace.className = 'card__trace';
  trace.append((TRACES[artifact.media] ?? img)(artifact));
  front.append(trace);

  // Words shown whole never repeat as a title (D40, generalized): a note whose
  // words are the title, or a text/code excerpt identical to it, carries the
  // line once — a quest is its own title, a lone sentence its own card.
  const wordsAreTitle =
    (artifact.media === 'note' && (artifact.excerpt.text ?? artifact.title).trim() === artifact.title.trim())
    || ((artifact.media === 'text' || artifact.media === 'code')
      && (artifact.excerpt.text ?? '').trim() === artifact.title.trim());
  if (!wordsAreTitle) {
    const title = document.createElement('div');
    title.className = 'card__title';
    title.textContent = artifact.title;
    front.append(title);
  }

  if (artifact.caption) {
    const caption = document.createElement('div');
    caption.className = 'card__caption';
    caption.textContent = artifact.caption;
    front.append(caption);
  }

  // The pivot is the part that turns: opacity and shadow live on the card
  // outside it, or they'd flatten the 3D context and mirror the front.
  const pivot = document.createElement('div');
  pivot.className = 'card__pivot';
  pivot.append(front);

  const model = backModel(artifact);
  if (model) {
    el.classList.add('card--backed');
    pivot.append(buildBack(model));
  }

  el.append(pivot);
  return el;
}
