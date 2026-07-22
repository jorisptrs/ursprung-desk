// The hand door (D65): one quiet surface for every manual deposit — an editor,
// like a page of notes (D88). What you write and drop IS the back of the card,
// in the order you arrange it: text stays text, a file or link becomes a piece
// with its caption, `/` offers the few fields there are, `@` names people. The
// front generates itself — title first, one chosen text, one chosen piece, the
// author always — and both faces preview live; tapping a block moves the
// front's highlight. Excerpts are cut here, on the depositor's device (D81);
// originals ride behind, byte-for-byte (D80). "push to table" is the one
// moment of consent, per card (D84 amended by D99); "set aside" keeps a card
// in a literal visible deck across sessions — the tray is its store. Pushes
// reach a table directly (same tab) or over a BroadcastChannel (same
// browser); the castle's LAN store later stands behind the same sink seam
// (D85).

import { renderCard } from './cards.js';
import { createStream } from './stream.js';
import { createTray, createBrowserBackend } from './tray.js';

// ---- pure helpers (node-tested; no DOM) ----

export const FORM_FOR = {
  image: 'crop', audio: 'waveform', video: 'frames', text: 'sentence',
  code: 'lines', fold: 'linework', model: 'render', note: 'words',
};

const EXT = {
  image: /\.(png|jpe?g|gif|webp|avif|heic|svg)$/i,
  audio: /\.(m4a|mp3|wav|ogg|oga|flac|aac|aiff?)$/i,
  video: /\.(mp4|mov|webm|m4v|mkv)$/i,
};

// MIME first, extension as fallback (files off some systems arrive typeless);
// anything else is null — shelved on the back, excerpt withheld.
export function inferMedia(name = '', type = '') {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  for (const [media, re] of Object.entries(EXT)) if (re.test(name)) return media;
  return null;
}

// A typed door takes its own kind and nothing else (D103): /audio refuses a
// film, /image refuses a recording — the picker's filter is the OS's courtesy,
// this is the rule. `/file` and every drop stay universal, so nothing is ever
// stuck outside. Returns the dry line to say, or null when the file belongs.
export function doorRefusal(name, type, expect) {
  if (!expect) return null;
  return inferMedia(name, type) === expect ? null : `${name} is not ${expect} · / file shelves anything`;
}

// Typed words: multi-line with code furniture reads as code; otherwise the
// line is a sentence of the manuscript.
export function inferWordsMedia(text) {
  const t = String(text ?? '');
  return /\n/.test(t) && /[;{}()=<>]/.test(t) ? 'code' : 'text';
}

// @-mentions name people (D88): parsed from the text as written, kept in the
// text — the mention is the authorship note. Order of appearance, deduped.
export function parseMentions(texts) {
  const people = [];
  for (const t of Array.isArray(texts) ? texts : [texts]) {
    for (const m of String(t ?? '').matchAll(/@([\p{L}][\p{L}\d._'-]*)/gu)) {
      let name = m[1];
      // a sentence's full stop is not part of the name — initials keep theirs
      if (name.endsWith('.') && !/^(\p{L}\.)+$/u.test(name)) name = name.slice(0, -1);
      if (name && !people.includes(name)) people.push(name);
    }
  }
  return people;
}

// Waveform in the house style (assets/waveform-*.svg): vertical strokes about
// a mid line, a quiet floor so silence still leaves a mark. Fixed peaks →
// fixed string; the renderer itself never synthesizes (D7, narrowly amended:
// the cut happens at deposit time, on the depositor's device).
export function peaksToSvg(peaks) {
  const n = Math.max(1, peaks.length);
  const width = 36 + (n - 1) * 14;
  const d = peaks.map((p, i) => {
    const half = 3 + Math.min(1, Math.max(0, p)) * 53;
    return `M${18 + i * 14} ${(100 - half).toFixed(1)} V${(100 + half).toFixed(1)}`;
  }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 200">\n  <g stroke="#3a332a" stroke-width="7" stroke-linecap="round" opacity="0.85">\n    <path d="${d}"/>\n  </g>\n</svg>`;
}

export const svgDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The typographic site-card: domain large, path small, ink on the parchment
// the card itself provides. Drawn here — the desk doesn't phone strangers.
export function siteCardSvg(url) {
  const u = url instanceof URL ? url : new URL(url);
  let path = u.pathname === '/' && !u.search ? '' : u.pathname + u.search;
  try { path = decodeURIComponent(path); } catch { /* malformed escapes stay as typed */ }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">\n  <text x="46" y="200" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="44" fill="#2b2418">${escXml(clip(u.hostname.replace(/^www\./, ''), 24))}</text>\n  <text x="46" y="252" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="22" fill="#6f6350">${escXml(clip(path, 42))}</text>\n</svg>`;
}

function youtubeId(u) {
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
  }
  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

// Link → front preview, built without asking any third-party service (D82):
// a direct image URL is the excerpt itself; a YouTube link has a constructable
// thumbnail; anything else becomes the quiet typographic site-card.
export function linkExcerpt(url) {
  let u;
  try { u = new URL(String(url ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(u.pathname)) {
    return { media: 'image', excerpt: { form: 'crop', src: u.href } };
  }
  const yt = youtubeId(u);
  if (yt) return { media: 'video', excerpt: { form: 'frames', src: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` } };
  return { media: 'image', excerpt: { form: 'render', src: svgDataUrl(siteCardSvg(u)) } };
}

// A URL alone on the clipboard or dropped in is a link intake.
export function soleUrl(text) {
  const t = String(text ?? '').trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

// The link prompt is forgiving (D94): a bare domain reads as https. Scoped to
// the prompt — pasted prose is never linkified beyond whole URLs.
export function normalizeUrl(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const direct = soleUrl(t);
  if (direct) return direct;
  if (/\s/.test(t)) return null;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(t)) return soleUrl(`https://${t}`);
  return null;
}

// A caption starts as the filename without its extension (D94); the shelf
// lines keep the full name — the file is the file.
export function stripExt(name) {
  const s = String(name ?? '').replace(/\.[^./]+$/, '');
  return s || String(name ?? '');
}

// A fetched page's own metadata, read from its html (D98): og/twitter image
// and title, resolved against the page URL. The desk asks the page itself,
// never a third-party service.
export function pageMeta(html, baseUrl) {
  const pick = (re) => re.exec(String(html ?? ''))?.[1]?.trim() || null;
  const attr = (prop) => pick(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
    ?? pick(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  let image = attr('og:image') ?? attr('twitter:image');
  const title = attr('og:title') ?? pick(/<title[^>]*>([^<]+)<\/title>/i);
  if (image) {
    try { image = new URL(image, baseUrl).href; } catch { image = null; }
  }
  return { image, title };
}

// A '/' token immediately before the caret opens the menu — at the start of a
// word only, so `https://`, `and/or`, and `3/4` never trigger (D90).
export function slashTokenAt(text, caret) {
  const m = /(^|\s)\/([a-z]*)$/i.exec(String(text ?? '').slice(0, Math.max(0, caret ?? 0)));
  return m ? { start: m.index + m[1].length, query: m[2].toLowerCase() } : null;
}

// Insert a reference line into the doc so it stands alone on its own line —
// no ghost blank lines, the cursor landing on the line after (D96).
export function refLineChange(docText, pos, lineText) {
  const text = String(docText ?? '');
  const p = Math.max(0, Math.min(text.length, Number.isFinite(pos) ? pos : text.length));
  const before = text.slice(0, p);
  const after = text.slice(p);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  const suffix = after.startsWith('\n') ? '' : '\n';
  const insert = prefix + lineText + suffix;
  return { from: p, to: p, insert, cursor: p + prefix.length + lineText.length + 1 };
}

// One line of the doc, classified (D96). Whole-line matches only; everything
// else is prose. `soleUrl` guards the bare-address line — pasted prose and
// lone filenames never embed.
const PIECE_LINE = /^!\[([^\]]*)\]\(piece:([\w-]+)\)$/;
const CAPTIONED_LINK = /^\[([^\]]*)\]\((https?:\/\/\S+)\)$/;
const DISMISSED_LINK = /^<(https?:\/\/\S+)>$/;

export function classifyLine(line) {
  const t = String(line ?? '').trimEnd();
  let m = PIECE_LINE.exec(t);
  if (m) return { t: 'piece', caption: m[1], ref: m[2] };
  m = DISMISSED_LINK.exec(t);
  if (m && soleUrl(m[1])) return { t: 'dismissed', href: soleUrl(m[1]) };
  m = CAPTIONED_LINK.exec(t);
  if (m && soleUrl(m[2])) return { t: 'link', href: soleUrl(m[2]), caption: m[1] };
  const bare = soleUrl(t);
  if (bare) return { t: 'link', href: bare };
  return { t: 'text' };
}

// The doc → the composition's block shape, so everything downstream —
// composeArtifact, the doors, the blob slots, the stream — stays untouched
// (D96). Unknown piece refs stay visible in the doc but never reach a card
// back; they come back for one dry line.
export function parseDoc(docText, pieces = new Map(), linkMeta = new Map()) {
  const blocks = [];
  const unknownRefs = [];
  let para = [];
  let seq = 0;
  const flush = () => {
    const joined = para.join('\n');
    para = [];
    for (const chunk of joined.split(/\n{2,}/)) {
      const text = chunk.replace(/^\n+|\n+$/g, '');
      if (text.trim()) blocks.push({ id: `t${++seq}`, t: 'text', text });
    }
  };
  for (const line of String(docText ?? '').split('\n')) {
    const c = classifyLine(line);
    if (c.t === 'text') {
      para.push(line);
      continue;
    }
    flush();
    if (c.t === 'piece') {
      const p = pieces.get(c.ref);
      if (!p) {
        unknownRefs.push(c.ref);
        continue;
      }
      const caption = p.kind === 'file' ? undefined : (c.caption.trim() || undefined);
      blocks.push({ id: c.ref, t: 'piece', p: { ...p, caption } });
    } else {
      const p = linkToPiece(c.href);
      if (!p) continue;
      const meta = linkMeta.get?.(c.href) ?? linkMeta[c.href];
      if (meta?.image) { // the page's own picture fronts the link (D98)
        p.media = 'image';
        p.front = { form: 'crop', src: meta.image };
      }
      if (c.t === 'dismissed') p.dismissed = true;
      else if (c.caption?.trim()) p.caption = c.caption.trim();
      else if (meta?.title) p.caption = meta.title;
      blocks.push({ id: c.href, t: 'piece', p });
    }
  }
  flush();
  return { blocks, unknownRefs };
}

// The whole sheet → one artifact: parse, then the untouched composition.
export function composeDoc({ docText = '', pieces = new Map(), linkMeta = new Map(), kind = 'work', practice = '', frontPieceId = null }) {
  const { blocks, unknownRefs } = parseDoc(docText, pieces, linkMeta);
  const out = composeArtifact({ kind, practice, blocks, frontPieceId, frontTextId: null });
  return { ...out, unknownRefs };
}

// One title only (D99): while any '# ' line stands — a bare '# ' still being
// written counts — the title door leaves the slash menu; deleting the line
// brings it back.
export const hasTitleLine = (docText) => String(docText ?? '').split('\n').some((l) => l.startsWith('# '));

// The title is md (D90): the first `# something` line anywhere in the text is
// the title and leaves the body; `#x`, `## x`, later `#` lines, and a bare
// `# ` all stay literal text.
export function extractTitle(blocks) {
  let title = '';
  const out = blocks.map((b) => {
    if (title || b.t !== 'text') return b;
    const lines = b.text.split('\n');
    const at = lines.findIndex((l) => /^# .*\S/.test(l));
    if (at < 0) return b;
    title = lines[at].slice(2).trim();
    return { ...b, text: [...lines.slice(0, at), ...lines.slice(at + 1)].join('\n') };
  });
  return { title, blocks: out };
}

// Serialized tray sheets, any age, → the v3 doc shape. Three generations live
// in trays: v1 (separate title + blocks), v2 (blocks with '# ' lines), v3
// (docText + pieces). One pure, idempotent mapping; blobKey strings copy
// verbatim — recomputing them against old blobs would orphan originals (D96).
export function migrateSheet(s = {}) {
  if (s.v === 3) {
    return {
      v: 3,
      docText: String(s.docText ?? ''),
      kind: s.kind ?? 'work',
      practice: s.practice ?? '',
      frontPieceId: s.frontPieceId ?? null,
      pieces: (s.pieces ?? []).map((p) => ({ ...p })),
      linkMeta: { ...(s.linkMeta ?? {}) },
    };
  }
  const host = (href) => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const sane = (t) => String(t ?? '').replace(/[\]\n]/g, ' ').trim();
  const parts = [];
  const pieces = [];
  if (s.title) parts.push(`# ${s.title}`);
  for (const b of s.blocks ?? []) {
    if (b.t === 'text') {
      if (b.text?.trim()) parts.push(b.text);
      continue;
    }
    const p = b.p ?? {};
    if (p.kind === 'link') {
      if (p.dismissed) parts.push(`<${p.href}>`);
      else if (p.caption && p.caption !== host(p.href)) parts.push(`[${sane(p.caption)}](${p.href})`);
      else parts.push(p.href);
      continue;
    }
    pieces.push({ id: b.id, kind: p.kind, name: p.name, front: p.front, blobKey: p.blobKey ?? null });
    parts.push(`![${p.kind === 'file' ? '' : sane(p.caption ?? '')}](piece:${b.id})`);
  }
  return {
    v: 3,
    docText: parts.join('\n\n'),
    kind: s.kind ?? 'work',
    practice: s.practice ?? '',
    frontPieceId: s.frontPieceId ?? null,
    pieces,
    linkMeta: {},
  };
}

// ---- the composition: editor blocks → one artifact (D88) ----
//
// block: { id, t: 'text', text }
//      | { id, t: 'piece', p: {
//            kind: 'image'|'audio'|'video'|'file'|'link',
//            name?, href?, caption?,
//            front?: { form, src },   // the cut shown when this piece fronts the card
//            media?,                  // link pieces: media the front claims (D82)
//            dismissed?,              // link only: plain line, not front-selectable
//            blob?,                   // the untouched original (image/audio/video/file)
//          } }
//
// The front prefers the title plus one chosen piece; with no title it takes the
// chosen text; the author (every @) is always on it. Exactly one text and one
// piece front the card at a time — frontTextId ('title' or a block id) and
// frontPieceId choose, absent means the first that fits.

export const frontable = (b) => b.t === 'piece' && b.p.kind !== 'file' && !b.p.dismissed;

// title here is the DERIVED title (extractTitle) and blocks the stripped body;
// frontTextId null → the title fronts when present, else the first text.
export function resolveFront({ title = '', blocks = [], frontPieceId = null, frontTextId = null }) {
  const pieces = blocks.filter(frontable);
  const piece = pieces.find((b) => b.id === frontPieceId) ?? pieces[0] ?? null;
  const texts = blocks.filter((b) => b.t === 'text' && b.text.trim());
  let textBlock = frontTextId ? texts.find((b) => b.id === frontTextId) ?? null : null;
  if (!textBlock && !title.trim()) textBlock = texts[0] ?? null;
  return { piece, textBlock }; // textBlock null → the title (if any) is the front's text
}

export function composeArtifact({ practice = '', kind = 'work', blocks: rawBlocks = [], frontPieceId = null, frontTextId = null }) {
  const { title, blocks } = extractTitle(rawBlocks);
  const { piece, textBlock } = resolveFront({ title, blocks, frontPieceId, frontTextId });
  const frontText = textBlock ? textBlock.text.trim() : title.trim();
  const people = parseMentions(blocks.filter((b) => b.t === 'text').map((b) => b.text));

  const artifact = {
    kind,
    provenance: 'hand',
    visibility: 'public',
  };
  const craft = practice.trim();
  if (craft) artifact.practice = craft; // optional at the door (D17 amended)

  if (piece) {
    artifact.media = piece.p.kind === 'link' ? (piece.p.media ?? 'image') : piece.p.kind;
    artifact.excerpt = piece.p.front;
    artifact.title = title.trim() || frontText || piece.p.caption || piece.p.name || '';
  } else if (frontText) {
    artifact.media = textBlock ? inferWordsMedia(frontText) : 'note';
    artifact.excerpt = { form: FORM_FOR[artifact.media], text: frontText };
    artifact.title = title.trim() || clip(frontText, 80);
  } else {
    artifact.media = null; // nothing brought yet — the stream will say so
    artifact.excerpt = { form: 'words' };
    artifact.title = '';
  }
  if (people.length) {
    artifact.people = people;
    artifact.caption = people.join(' + '); // the author is always on the front (D88)
  }

  // The back is the arrangement itself. Blob slots are keyed by composition
  // index; the first audio/video holds the play door, else the first link the
  // visit door (D72: one experience per back).
  const blobs = {};
  const blobKeys = new Map(); // block id → blob key, for faithful re-editing
  const composition = [];
  let experience = null;
  for (const b of blocks) {
    if (b.t === 'text') {
      if (b.text.trim()) composition.push({ t: 'text', text: b.text });
      continue;
    }
    const p = b.p;
    const i = composition.length;
    if (p.kind === 'image') {
      composition.push({ t: 'image', src: null, ...(p.caption ? { caption: p.caption } : {}), name: p.name });
      blobs[`piece:${i}`] = p.blob;
      blobKeys.set(b.id, `piece:${i}`);
    } else if (p.kind === 'audio' || p.kind === 'video') {
      composition.push({ t: p.kind, src: p.front.src, orig: null, ...(p.caption ? { caption: p.caption } : {}), name: p.name });
      blobs[`piece:${i}`] = p.blob;
      blobKeys.set(b.id, `piece:${i}`);
      if (!experience) {
        experience = { mode: 'play', src: null };
        blobs.experience = p.blob; // the same File — clones dedupe within one entry
      }
    } else if (p.kind === 'file') {
      composition.push({ t: 'file', name: p.name, src: null });
      blobs[`piece:${i}`] = p.blob;
      blobKeys.set(b.id, `piece:${i}`);
    } else if (p.kind === 'link') {
      composition.push({ t: 'link', href: p.href, ...(p.dismissed ? {} : { embed: p.front.src, ...(p.caption ? { caption: p.caption } : {}) }) });
      if (!experience) experience = { mode: 'visit', src: p.href };
    }
  }

  const detail = {};
  // a back that is exactly the front's own text adds nothing — the card stays closed (D5/D88)
  const redundant = composition.length === 1 && composition[0].t === 'text'
    && composition[0].text.trim() === frontText && !experience;
  if (composition.length && !redundant) detail.composition = composition;
  if (experience && detail.composition) detail.experience = experience;
  if (Object.keys(detail).length) artifact.detail = detail;

  return { artifact, blobs: detail.composition ? blobs : {}, blobKeys };
}

// The stream's own validation is the contract — probe a scratch stream and
// hand back its words for the one dry line, or null when the artifact holds.
export function validateArtifact(artifact) {
  try {
    createStream().append({ e: 'deposit', night: 0, artifact: { ...artifact, id: artifact.id ?? 'h-000' } });
    return null;
  } catch (err) {
    return String(err?.message ?? err).replace(/^stream reject: /, '');
  }
}

// Hand deposits take the next h-### and the stream's current highest night
// (D19); every fork numbers its own.
export function allocate(events) {
  let night = 0;
  let top = 0;
  for (const ev of events) {
    if (ev.night > night) night = ev.night;
    if (ev.e === 'deposit') {
      const m = /^h-(\d+)$/.exec(ev.artifact.id);
      if (m) top = Math.max(top, Number(m[1]));
    }
  }
  return { id: `h-${String(top + 1).padStart(3, '0')}`, night };
}

// Blob slots (src/orig: null) become object URLs at the receiving table —
// originals travel as blobs, untouched, and only turn into URLs where shown.
export function materialize(artifact, blobs = {}, urlFor = (b) => URL.createObjectURL(b)) {
  const a = structuredClone(artifact);
  const d = a.detail;
  if (d?.experience?.src === null && blobs.experience) d.experience = { ...d.experience, src: urlFor(blobs.experience) };
  if (Array.isArray(d?.composition)) {
    d.composition = d.composition.map((entry, i) => {
      const blob = blobs[`piece:${i}`];
      if (!entry || typeof entry !== 'object' || !blob) return entry;
      if (entry.src === null) return { ...entry, src: urlFor(blob) };
      if (entry.orig === null) return { ...entry, orig: urlFor(blob) };
      return entry;
    });
  }
  if (Array.isArray(d?.assets)) { // legacy shelf entries stay materializable
    d.assets = d.assets.map((entry, i) =>
      entry && typeof entry === 'object' && entry.src === null && blobs[`asset:${i}`]
        ? { ...entry, src: urlFor(blobs[`asset:${i}`]) }
        : entry);
  }
  return a;
}

// ---- sinks: where a lay goes (D85). The seam the LAN store later fills. ----

const CHANNEL = 'desk:hand';

export function directSink(stream) {
  return {
    deposit(artifact, blobs = {}) {
      const finished = materialize(artifact, blobs);
      const { id, night } = allocate(stream.all());
      stream.append({ e: 'deposit', night, artifact: { ...finished, id } });
    },
  };
}

// deposit.html → any table tab in the same browser. Shape-checked before
// sending; the table answers laid or refused, and silence means no table is
// open — the tray keeps the cards either way.
export function broadcastSink() {
  const channel = new BroadcastChannel(CHANNEL);
  let seq = 0;
  return {
    deposit(artifact, blobs = {}) {
      const probe = validateArtifact(materialize(artifact, blobs, () => 'blob:probe'));
      if (probe) return Promise.reject(new Error(probe));
      const mid = `${Date.now()}-${(seq += 1)}`;
      return new Promise((resolve, reject) => {
        const done = (fn, arg) => { clearTimeout(timer); channel.removeEventListener('message', onMsg); fn(arg); };
        const timer = setTimeout(() => done(reject, new Error('no table is open in this browser')), 900);
        const onMsg = (e) => {
          if (e.data?.mid !== mid) return;
          if (e.data.kind === 'laid') done(resolve);
          else if (e.data.kind === 'refused') done(reject, new Error(e.data.reason));
        };
        channel.addEventListener('message', onMsg);
        channel.postMessage({ kind: 'deposit', mid, artifact, blobs });
      });
    },
  };
}

export function attachBroadcastReceiver(stream) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.addEventListener('message', (e) => {
    if (e.data?.kind !== 'deposit') return;
    try {
      directSink(stream).deposit(e.data.artifact, e.data.blobs ?? {});
      channel.postMessage({ kind: 'laid', mid: e.data.mid });
    } catch (err) {
      channel.postMessage({ kind: 'refused', mid: e.data.mid, reason: String(err?.message ?? err) });
    }
  });
}

// ---- excerpt cutting (browser-only) ----

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('unreadable file'));
  r.readAsDataURL(file);
});

const eventOrError = (el, ev) => new Promise((resolve, reject) => {
  const ok = () => { off(); resolve(); };
  const bad = () => { off(); reject(new Error('unreadable file')); };
  const off = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
  el.addEventListener(ev, ok, { once: true });
  el.addEventListener('error', bad, { once: true });
});

const RAW_IMAGE_LIMIT = 1_500_000; // below this the front carries the exact bytes

async function imageDataUrl(file) {
  if (file.size <= RAW_IMAGE_LIMIT) return readDataUrl(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function audioPeaks(file, buckets = 44) {
  const raw = await file.arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(raw);
  const data = decoded.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / buckets));
  const peaks = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    for (let i = b * per, end = Math.min(data.length, (b + 1) * per); i < end; i += 32) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / top);
}

async function videoStrip(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await eventOrError(video, 'loadedmetadata');
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    const w = 320;
    const h = Math.max(2, Math.round((w * video.videoHeight) / video.videoWidth) || 180);
    const canvas = document.createElement('canvas');
    canvas.width = w * 3;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 3; i++) { // 15% · 50% · 85% — the excerpt spans the take
      video.currentTime = dur ? dur * (0.15 + 0.35 * i) : i;
      await eventOrError(video, 'seeked');
      ctx.drawImage(video, i * w, 0, w, h);
    }
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// File → piece: the front cut and the untouched original together. A file the
// device cannot read shelves whole — a quiet line, honest about what it holds.
async function fileToPiece(file) {
  const media = inferMedia(file.name, file.type);
  try {
    if (media === 'image') {
      return { kind: 'image', name: file.name, caption: stripExt(file.name), blob: file, front: { form: 'crop', src: await imageDataUrl(file) } };
    }
    if (media === 'audio') {
      return { kind: 'audio', name: file.name, caption: stripExt(file.name), blob: file, front: { form: 'waveform', src: svgDataUrl(peaksToSvg(await audioPeaks(file))) } };
    }
    if (media === 'video') {
      return { kind: 'video', name: file.name, caption: stripExt(file.name), blob: file, front: { form: 'frames', src: await videoStrip(file) } };
    }
  } catch { /* fall through: shelve what we cannot read */ }
  return { kind: 'file', name: file.name, blob: file };
}

export function linkToPiece(href) {
  const cut = linkExcerpt(href);
  if (!cut) return null;
  const host = new URL(href).hostname.replace(/^www\./, '');
  return { kind: 'link', href, media: cut.media, front: cut.excerpt, caption: host };
}

// ---- the sheet: one page, one editor, one front (D96) ----

const KIND_LABELS = { work: 'work', failure: "Claude's failure", quest: 'quest' };

const h = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const mintId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 8);

let editorModule = null;
export const warmEditor = () => { editorModule ??= import('./editor.js'); return editorModule; };

export function openSheet({ mode = 'overlay', container = document.body, sink, prefill = null, tray = null, autofocus = true } = {}) {
  tray = tray ?? createTray(createBrowserBackend());

  const state = {
    kind: 'work',
    docText: '',
    registry: new Map(), // id → { kind, name, blob, front } — append-only for the sheet's life (D96)
    linkMeta: new Map(), // href → { status, image, title } — the page asked once, itself (D98)
    frontPieceId: null,
    editingId: null,
    previewUrls: [],
    unknownRefs: [],
  };
  let ed = null; // the CodeMirror handle, once mounted

  const sheet = h('section', mode === 'page' ? 'sheet sheet--page' : 'sheet');
  const panel = h('div', 'sheet__panel');
  sheet.append(panel);

  const head = h('div', 'sheet__head');
  head.append(h('div', 'sheet__heading', 'add your work'));
  if (mode === 'overlay') {
    const closeBtn = h('span', 'sheet__action', 'close');
    closeBtn.addEventListener('click', () => close());
    head.append(closeBtn);
  }
  panel.append(head);

  // The register is its own field (D90): work · quest — and at the line's far
  // right, the one flag there is (D98). Flagging Claude's failure is the only
  // moment practice exists, and there it is required: the honest record is
  // kept by craft.
  const kindRow = h('div', 'sheet__row sheet__meta');
  kindRow.append(h('span', 'sheet__label', 'enters as'));
  const kindEls = new Map();
  for (const k of ['work', 'quest']) {
    const opt = h('span', 'sheet__opt', KIND_LABELS[k]);
    opt.addEventListener('click', () => { state.kind = k; syncMeta(); refreshPreviews(); });
    kindEls.set(k, opt);
    kindRow.append(opt);
  }
  const flag = h('span', 'sheet__opt sheet__flag', "flag Claude's failure");
  flag.addEventListener('click', () => {
    state.kind = state.kind === 'failure' ? 'work' : 'failure';
    syncMeta();
    refreshPreviews();
    if (state.kind === 'failure') practice.focus();
  });
  kindRow.append(flag);
  const practiceRow = h('div', 'sheet__row sheet__meta');
  practiceRow.style.display = 'none';
  const practice = h('input', 'sheet__field');
  practice.placeholder = 'origami, composition, writing...';
  practiceRow.append(h('span', 'sheet__label', 'practice'), practice);
  const editorBox = h('div', 'editor');
  panel.append(kindRow, practiceRow, editorBox);

  const previews = h('div', 'sheet__previews');
  const frontBox = h('figure', 'sheet__face');
  previews.append(frontBox);
  const status = h('div', 'sheet__status');
  // push is the door, set aside the drawer (D99): one tap lays the card now;
  // the other keeps it in the deck below, in person, for later
  const actions = h('div', 'sheet__actions');
  const push = h('span', 'sheet__action sheet__push', 'push to table');
  const aside = h('span', 'sheet__action sheet__aside', 'set aside');
  actions.append(push, aside);
  const deckBox = h('div', 'sheet__deck');
  deckBox.style.display = 'none';
  const deckFan = h('div', 'sheet__deckfan');
  const deckHead = h('div', 'sheet__row sheet__deckhead');
  const pushAll = h('span', 'sheet__action sheet__pushall', ''); // only when the deck holds more than one (D101)
  pushAll.style.display = 'none';
  deckHead.append(h('span', 'sheet__label', 'the deck'), pushAll);
  deckBox.append(deckHead, deckFan);
  panel.append(previews, status, actions, deckBox);

  const say = (msg) => { status.textContent = msg ?? ''; };

  // one hidden picker serves /image /audio /video /file — clicked inside the
  // gesture (iOS insists); what it yields lands where the slash was typed
  const picker = h('input');
  picker.type = 'file';
  picker.multiple = true;
  picker.hidden = true;
  sheet.append(picker);
  let pendingInsert = null; // doc offset captured at pick time
  let pendingMedia = null; // which door was opened — it takes its own kind only (D103)

  function syncMeta() {
    for (const [k, opt] of kindEls) opt.classList.toggle('sheet__opt--on', state.kind === k);
    flag.classList.toggle('sheet__opt--on', state.kind === 'failure');
    practiceRow.style.display = state.kind === 'failure' ? '' : 'none';
  }

  // -- the composition → the one front face --

  const current = () => composeDoc({
    docText: state.docText,
    pieces: state.registry,
    linkMeta: state.linkMeta,
    kind: state.kind,
    practice: practice.value,
    frontPieceId: state.frontPieceId,
  });

  function face(card, label, hint) {
    frontBox.replaceChildren();
    if (card) frontBox.append(card);
    else frontBox.append(h('div', 'sheet__hintcard', hint));
    frontBox.append(h('figcaption', 'sheet__facelabel', label));
  }

  function refreshPreviews() {
    for (const u of state.previewUrls) URL.revokeObjectURL(u);
    state.previewUrls = [];
    const { artifact, blobs, unknownRefs } = current();
    state.unknownRefs = unknownRefs;
    if (unknownRefs.length) say(`a reference points at nothing · ${unknownRefs.join(', ')}`);
    else if (status.textContent.startsWith('a reference points')) say('');
    if (!artifact.media) {
      face(null, 'front', 'the card appears here');
      return;
    }
    const urlFor = (b) => { const u = URL.createObjectURL(b); state.previewUrls.push(u); return u; };
    const front = renderCard({ ...materialize(artifact, blobs, urlFor), id: 'h-preview' });
    front.classList.add('sheet__card');
    face(front, front.classList.contains('card--backed') ? 'front · the page above is its back' : 'front · the card stays closed', '');
  }

  // The link preview asks the page itself, once — og/twitter image and title;
  // a page that will not answer leaves just the inline link (D98).
  function requestMeta(href) {
    if (state.linkMeta.has(href)) return;
    state.linkMeta.set(href, { status: 'loading' });
    (async () => {
      try {
        const res = await fetch(href, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(String(res.status));
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('html')) throw new Error('not a page');
        const { image, title } = pageMeta(await res.text(), href);
        state.linkMeta.set(href, { status: 'done', image, title });
      } catch {
        state.linkMeta.set(href, { status: 'failed' });
      }
      ed?.refreshMeta();
      refreshPreviews();
    })();
  }

  // -- intakes: one path for slash picker, drop, and paste (D96) --

  async function intakeFiles(files, pos = null, expect = null) {
    let captionSpan = null;
    let refused = null;
    const taken = [];
    for (const file of files) {
      const no = doorRefusal(file.name, file.type, expect);
      if (no) refused ??= no;
      else taken.push(file);
    }
    if (!taken.length) { say(refused ?? ''); return; }
    for (const file of taken) {
      const piece = await fileToPiece(file);
      const id = mintId();
      state.registry.set(id, piece);
      const caption = (piece.kind === 'file' ? '' : stripExt(file.name)).replace(/[\]\n]/g, ' ');
      const line = `![${caption}](piece:${id})`;
      const at = pos ?? ed?.cursor() ?? state.docText.length;
      const change = refLineChange(state.docText, at, line);
      if (ed) ed.applyChange(change);
      else state.docText = state.docText.slice(0, change.from) + change.insert + state.docText.slice(change.to);
      const lineStart = change.from + (change.insert.startsWith('\n') ? 1 : 0);
      captionSpan = caption ? [lineStart + 2, lineStart + 2 + caption.length] : null;
      pos = null; // later files follow the cursor
    }
    // the pen lands in the last caption, ready to be rewritten (D98)
    if (ed && captionSpan) ed.select(captionSpan[0], captionSpan[1]);
    if (!ed) refreshPreviews();
    say(refused ?? ''); // what came through came through; what did not, says why
  }

  picker.addEventListener('change', async () => {
    const files = [...(picker.files ?? [])];
    const at = pendingInsert;
    const expect = pendingMedia;
    pendingInsert = null;
    pendingMedia = null;
    if (files.length) await intakeFiles(files, at, expect);
  });

  // drops land where the pointer says; the sheet outside the editor still takes them
  sheet.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  sheet.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = [...(e.dataTransfer?.files ?? [])];
    const pos = ed?.posAtCoords(e.clientX, e.clientY) ?? null;
    if (files.length) { intakeFiles(files, pos); return; }
    const url = soleUrl(e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text'));
    if (url) {
      const change = refLineChange(state.docText, pos ?? state.docText.length, url);
      if (ed) ed.applyChange(change);
      else { state.docText = state.docText.slice(0, change.from) + change.insert + state.docText.slice(change.to); refreshPreviews(); }
    }
  });

  // -- the slash options: everything on offer, label and quiet detail (D97) --

  const slashItems = [
    { label: 'image', detail: 'a photograph from your device', run: (v, pos) => openPicker('image/*', pos, 'image') },
    { label: 'audio', detail: 'a recording from your device', run: (v, pos) => openPicker('audio/*', pos, 'audio') },
    { label: 'video', detail: 'footage from your device', run: (v, pos) => openPicker('video/*', pos, 'video') },
    { label: 'file', detail: 'anything, shelved whole', run: (v, pos) => openPicker('', pos, null) },
    { label: 'link', detail: 'an address, typed or pasted', run: (v, pos) => {
      v.dispatch({ changes: { from: pos, to: pos, insert: 'https://' }, selection: { anchor: pos + 8 } });
    } },
    { label: 'title', detail: "a '# ' line", when: (s) => !hasTitleLine(s.doc.toString()), run: (v, pos) => {
      const line = v.state.doc.lineAt(pos);
      if (line.text.startsWith('# ')) return;
      // the pen lands behind the marks, ready to write the title (D99)
      v.dispatch({ changes: { from: line.from, to: line.from, insert: '# ' }, selection: { anchor: pos + 2 } });
    } },
    { label: 'people', detail: '@name in the text', run: (v, pos) => {
      v.dispatch({ changes: { from: pos, to: pos, insert: '@' }, selection: { anchor: pos + 1 } });
    } },
  ];

  function openPicker(accept, pos, expect = null) {
    pendingInsert = pos;
    pendingMedia = expect;
    picker.accept = accept;
    picker.value = '';
    picker.click(); // synchronously, inside the gesture
  }

  // -- mount the editor (the vendored module arrives once, then is cached) --

  warmEditor().then(({ createDeskEditor }) => {
    if (!sheet.isConnected) return;
    ed = createDeskEditor({
      parent: editorBox,
      doc: state.docText,
      registry: state.registry,
      linkMeta: state.linkMeta,
      requestMeta,
      autofocus,
      teach: 'write · / for anything · @ for people', // short: the hint sits on the line the pen starts on (D99)
      slashItems,
      onDocChanged: (text) => { state.docText = text; refreshPreviews(); },
      onFrontTap: (key) => {
        state.frontPieceId = key;
        ed.setFrontPiece(key);
        refreshPreviews();
      },
    });
    if (state.frontPieceId) ed.setFrontPiece(state.frontPieceId);
  });

  // -- the push, the deck, and what never gets lost (D99) --

  const hasAnything = () => current().artifact.media != null;

  function serializedSheet(blobKeys) {
    const { blocks } = parseDoc(state.docText, state.registry);
    const linkMeta = {};
    for (const b of blocks) {
      if (b.t !== 'piece' || b.p.kind !== 'link') continue;
      const m = state.linkMeta.get(b.p.href);
      if (m?.status === 'done' && (m.image || m.title)) linkMeta[b.p.href] = { image: m.image ?? null, title: m.title ?? null };
    }
    const referenced = blocks.filter((b) => b.t === 'piece' && state.registry.has(b.id));
    return {
      v: 3,
      docText: state.docText,
      kind: state.kind,
      practice: practice.value,
      frontPieceId: state.frontPieceId,
      linkMeta,
      pieces: referenced.map((b) => {
        const p = state.registry.get(b.id);
        return { id: b.id, kind: p.kind, name: p.name, front: p.front, blobKey: blobKeys.get(b.id) ?? null };
      }),
    };
  }

  function clearForm() {
    state.kind = 'work';
    state.docText = '';
    // emptied in place, never replaced (D99): the editor holds these two maps
    // by reference — a new Map here leaves it looking at the old one, and every
    // piece added afterwards renders as raw text with no preview ever arriving
    state.registry.clear(); // orphans go with it — pruned only at the boundary (D96)
    state.linkMeta.clear();
    state.frontPieceId = null;
    state.editingId = null;
    practice.value = '';
    if (ed) ed.setText('');
    syncMeta();
    refreshPreviews();
  }

  function loadEntry(entry) {
    clearForm();
    const mapped = migrateSheet(entry.sheet);
    state.editingId = entry.id;
    state.kind = mapped.kind;
    state.frontPieceId = mapped.frontPieceId;
    practice.value = mapped.practice;
    for (const [href, m] of Object.entries(mapped.linkMeta ?? {})) state.linkMeta.set(href, { status: 'done', ...m });
    state.docText = mapped.docText;
    for (const sp of mapped.pieces) {
      state.registry.set(sp.id, {
        kind: sp.kind,
        name: sp.name,
        front: sp.front,
        blob: sp.blobKey ? entry.blobs?.[sp.blobKey] : undefined,
      });
    }
    if (ed) {
      ed.setText(state.docText, { focusEnd: true });
      if (state.frontPieceId) ed.setFrontPiece(state.frontPieceId);
      ed.focus(); // picked up means in hand — the pen waits at the end (D99)
    }
    syncMeta();
    refreshPreviews();
    say('picked up from the deck · push it or set it aside again');
  }

  // The deck (D99): every set-aside card in person — small, fanned, waiting.
  // Tap one to pick it up; × removes it; pushing a picked-up card leaves it.
  let deckUrls = [];
  async function refreshDeck() {
    const entries = await tray.list();
    for (const u of deckUrls) URL.revokeObjectURL(u);
    deckUrls = [];
    deckFan.replaceChildren();
    entries.forEach((entry, i) => {
      const slot = h('div', 'deck-card');
      slot.style.setProperty('--tilt', `${(((i % 5) - 2) * 2.2).toFixed(1)}deg`);
      slot.title = entry.artifact.title || '(untitled)';
      const urlFor = (b) => { const u = URL.createObjectURL(b); deckUrls.push(u); return u; };
      try {
        slot.append(renderCard({ ...materialize(entry.artifact, entry.blobs ?? {}, urlFor), id: entry.id }));
      } catch {
        slot.append(h('div', 'card')); // a broken entry still shows its blank — and its ×
      }
      const x = h('span', 'deck-card__x', '×');
      x.title = 'remove';
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        await tray.unstage(entry.id);
        if (state.editingId === entry.id) state.editingId = null;
        refreshDeck();
      });
      slot.append(x);
      slot.addEventListener('click', () => pickUp(entry));
      deckFan.append(slot);
    });
    deckBox.style.display = entries.length ? '' : 'none';
    pushAll.style.display = entries.length > 1 ? '' : 'none';
    pushAll.textContent = `push all ${entries.length} to table`;
  }

  // The door's own rule, applied to a card nobody is holding (D99/D101).
  const namelessFailure = (entry) =>
    (entry.artifact?.kind === 'failure' && !entry.artifact.practice
      ? 'a flagged failure names its practice'
      : null);

  async function pickUp(entry) {
    if (entry.sheet) { loadEntry(entry); return; }
    // staged before this editor: it cannot reopen — one tap pushes it as it is
    try {
      await sink.deposit(entry.artifact, entry.blobs ?? {});
      await tray.unstage(entry.id);
      await refreshDeck();
      say('staged before this editor · pushed as it was');
    } catch (err) {
      say(String(err?.message ?? err));
    }
  }

  async function stash({ quiet = false } = {}) {
    const { artifact, blobs, blobKeys } = current();
    const probe = validateArtifact(materialize(artifact, blobs, () => 'blob:probe'));
    if (probe) { if (!quiet) say(probe); return false; }
    const editing = state.editingId;
    const entry = { artifact, blobs, sheet: serializedSheet(blobKeys) };
    if (editing) await tray.update(editing, entry);
    else await tray.stage(entry);
    clearForm();
    await refreshDeck();
    if (!quiet) say(editing ? 'kept' : 'set aside · in the deck');
    return true;
  }

  // the drawer holds unfinished work without questions — the practice guard
  // stands at the push, where a card actually reaches the table (D99)
  aside.addEventListener('click', async () => {
    if (!hasAnything()) { say('write, drop, or paste something first'); return; }
    await stash();
  });

  push.addEventListener('click', async () => {
    if (!hasAnything()) { say('write, drop, or paste something first'); return; }
    if (state.kind === 'failure' && !practice.value.trim()) {
      say('a flagged failure names its practice · origami, composition, writing...');
      practice.focus();
      return;
    }
    const { artifact, blobs } = current();
    const probe = validateArtifact(materialize(artifact, blobs, () => 'blob:probe'));
    if (probe) { say(probe); return; }
    push.classList.add('sheet__push--busy');
    try {
      await sink.deposit(artifact, blobs);
      if (state.editingId) await tray.unstage(state.editingId);
      clearForm();
      await refreshDeck();
      if (mode === 'overlay') close(); // the table is right behind — watch it arrive
      else say('pushed · a table open in this browser took it');
    } catch (err) {
      const m = String(err?.message ?? err);
      if (m.includes('no table')) { // silence is not refusal — the deck keeps it (D99)
        await stash({ quiet: true });
        say('no table is open in this browser · kept in the deck');
      } else {
        say(m);
      }
    } finally {
      push.classList.remove('sheet__push--busy');
    }
  });

  // capture, not bubble (D99): CM closes its menu on the same Escape before a
  // bubbled listener could ask menuOpen() — seen too late, Esc-with-menu would
  // close the whole sheet instead of just the menu
  // The deck at once (D101): whatever is in hand joins them, then the lot goes.
  pushAll.addEventListener('click', async () => {
    if (hasAnything()) await stash({ quiet: true });
    const entries = await tray.list();
    if (!entries.length) { say('the deck is empty'); return; }
    pushAll.classList.add('sheet__push--busy');
    const { laid, rejected } = await tray.commit(sink, namelessFailure);
    pushAll.classList.remove('sheet__push--busy');
    await refreshDeck();
    if (rejected.length) {
      say(`${laid.length} pushed · ${rejected.length} kept · ${rejected[0].reason}`);
    } else if (mode === 'overlay') {
      close(); // the table is right behind — watch them arrive
    } else {
      say(`${laid.length} pushed · a table open in this browser took them`);
    }
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && mode === 'overlay' && !(ed?.menuOpen())) close();
  };
  addEventListener('keydown', onKey, true);

  function finish() {
    for (const u of [...state.previewUrls, ...deckUrls]) URL.revokeObjectURL(u);
    removeEventListener('keydown', onKey, true);
    ed?.destroy();
    sheet.remove();
  }

  // closing never discards (D99): whatever is on the page goes to the deck first
  function close() {
    if (hasAnything()) stash({ quiet: true }).finally(finish);
    else finish();
  }

  container.append(sheet);
  syncMeta();
  refreshPreviews();
  refreshDeck();
  if (prefill?.file) intakeFiles([prefill.file]);

  return { el: sheet, close };
}
