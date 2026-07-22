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

// The back as pure data — what the maker shelved, nothing else. Null when the
// detail is empty or absent: those cards have no back at all (D5/D11).
export function backModel(artifact) {
  const d = artifact.detail;
  if (!d || typeof d !== 'object') return null;
  const door = d.experience
    ? { mode: d.experience.mode, src: d.experience.src, demoSrc: d.experience.demoSrc ?? null }
    : null;
  const files = Array.isArray(d.assets) ? d.assets : [];
  const links = Array.isArray(d.links) ? d.links : [];
  const note = typeof d.note === 'string' && d.note.length > 0 ? d.note : null;
  if (!door && !files.length && !links.length && !note) return null;
  // a note card's words are already its face — the back doesn't repeat them (D40)
  return { title: artifact.media === 'note' ? null : artifact.title, door, files, links, note };
}

const basename = (path) => path.split('/').pop();

// Quiet text only: the door as a word, files and links as plain outward links
// (never embedded players, D30), the note in the same dry register.
function buildBack(model) {
  const back = document.createElement('div');
  back.className = 'card__back';

  if (model.title) {
    const title = document.createElement('div');
    title.className = 'back__title';
    title.textContent = model.title;
    back.append(title);
  }

  if (model.door) {
    const door = document.createElement('div');
    door.className = 'back__door';
    door.dataset.door = model.door.mode;
    door.textContent = model.door.mode === 'play' ? 'play' : 'visit ↗';
    back.append(door);
  }
  for (const href of [...model.files, ...model.links]) {
    const a = document.createElement('a');
    a.className = 'back__line';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = model.files.includes(href) ? basename(href) : href;
    back.append(a);
  }
  if (model.note) {
    const note = document.createElement('div');
    note.className = 'back__note';
    note.textContent = model.note;
    back.append(note);
  }
  return back;
}

export function renderCard(artifact) {
  const el = document.createElement('article');
  el.className = `card card--${artifact.media} kind--${artifact.kind}`;
  el.style.borderRadius = cornerRadii(artifact.id);

  const front = document.createElement('div');
  front.className = 'card__front';

  const trace = document.createElement('div');
  trace.className = 'card__trace';
  trace.append((TRACES[artifact.media] ?? img)(artifact));
  front.append(trace);

  // A note's words are its content shown whole; when they'd repeat the title
  // verbatim, the title line is suppressed — a quest is its own title (D40).
  const wordsAreTitle =
    artifact.media === 'note' && (artifact.excerpt.text ?? artifact.title).trim() === artifact.title.trim();
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
