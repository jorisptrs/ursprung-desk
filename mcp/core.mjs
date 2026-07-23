// The MCP door's core: everything the deposit tool does, minus the protocol.
// Kept apart from server.mjs so all of it is node-testable without the SDK.
//
// Two rejectors, and they do different work (D107): the STREAM decides whether
// an artifact has a legal shape — replayed over seed + drop, its words come
// back verbatim — and the DOOR adds transport guards the stream has no opinion
// on: fields the desk owns, the kinds this door takes, what a path may be, how
// big a line may get. Neither ever coerces; both refuse with words.
//
// The write path is a tray-shaped sink (D106): deposit(artifact, blobs), the
// same face js/tray.js commits against, so the room server's stage→confirm
// (BRIEF §7 step 5) reuses it unchanged. The sink itself refuses nothing the stream would take — the door
// bounds live in depositCard, above it.

import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createStream } from '../js/stream.js';
import { parseJsonl } from '../js/live.js';
// The waveform's house style is the hand door's — one drawing, both doors, so
// a card cut here and a card cut on a phone are the same card (D117).
// materialize is the hand door's own slot-filler, and it already takes the
// urlFor that decides where a blob lands — so the server fills the sheet's
// null slots with exactly the code the browser fills them with (D85).
import { materialize, peaksToSvg } from '../js/deposit.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const dropFileIn = (root) => join(root, 'drop', 'stream.jsonl');
export const assetDirIn = (root) => join(root, 'drop', 'assets');

// Copied rather than imported — eight entries, and the stream owns the enum
// either way. (The waveform above is imported instead: a drawing must not be
// allowed to drift between the two doors, a map of names may.)
export const FORM_FOR = {
  image: 'crop', audio: 'waveform', video: 'frames', text: 'sentence',
  code: 'lines', fold: 'linework', model: 'render', note: 'words',
};

// js/cards.js draws image·audio·video·fold·model through one <img>: no withheld
// branch exists for them, so a missing src would be a broken glyph on the
// table. Those media must hand a file — the desk cuts the trace from it.
// text·code·note have real fallbacks and may withhold (D6).
export const NEEDS_TRACE = ['image', 'audio', 'video', 'fold', 'model'];
export const WORDS_MEDIA = ['text', 'code', 'note'];

export const DOOR_KINDS = ['work', 'failure', 'quest', 'fieldnotes']; // meta is the curator's (D108)
export const OWNED_FIELDS = ['id', 'night', 'provenance', 'visibility']; // the door names itself (D65)
// The hand door's page composes provenance and visibility itself, because it
// IS the hand door and has always said so — refusing it for saying something
// true would be friction with nothing behind it. What no client may choose is
// where its card sits in the log, so id and night are still refused in words.
// The distinction is who is on the other side: a session is a model, and a
// model reaching for `provenance` has misunderstood something worth hearing
// about (D107); the sheet is the desk's own page, and the door simply signs
// over whatever it claimed.
export const HAND_OWNED = ['id', 'night'];

const STILL_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const AUDIO_EXT = /\.(m4a|mp3|wav|ogg|oga|flac|aac|aiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv)$/i;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 512 * 1024;

// ffmpeg does the reading, as the browser's decoder does at the hand door —
// the cut still happens at deposit time, on the depositor's own machine (D81).
const FFMPEG_PLACES = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
const FFPROBE_PLACES = ['ffprobe', '/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'];

function toolAt(places) {
  for (const bin of places) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
      return bin;
    } catch { /* next */ }
  }
  return null;
}
let ffmpegBin;
let ffprobeBin;
export const ffmpeg = () => (ffmpegBin ??= toolAt(FFMPEG_PLACES));
export const ffprobe = () => (ffprobeBin ??= toolAt(FFPROBE_PLACES));

// What the desk can draw from a file: a still is already one; a recording or a
// take it cuts itself. Anything else is not a trace.
export function cutKind(path) {
  if (STILL_EXT.test(path)) return 'still';
  if (AUDIO_EXT.test(path)) return 'audio';
  if (VIDEO_EXT.test(path)) return 'video';
  return null;
}

// The whole file → 44 peaks, as the hand door takes them (deposit.js).
export function peaksFromAudio(path, buckets = 44) {
  const bin = ffmpeg();
  if (!bin) return null;
  let raw;
  try {
    raw = execFileSync(bin, ['-v', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
      { maxBuffer: 1 << 28 });
  } catch {
    return null; // unreadable: the caller says so in the desk's own words, not ffmpeg's
  }
  const n = Math.floor(raw.length / 2);
  if (!n) return null;
  const per = Math.max(1, Math.floor(n / buckets));
  const peaks = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    for (let i = b * per, end = Math.min(n, (b + 1) * per); i < end; i += 4) {
      const v = Math.abs(raw.readInt16LE(i * 2)) / 32768;
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / top);
}

// Three stills at 15 / 50 / 85 % laid side by side — the strip attests to the
// span of the take, exactly as the hand door cuts it (D81).
export function stripFromVideo(path, out) {
  const bin = ffmpeg();
  const probe = ffprobe();
  if (!bin) return false;
  let dur = 0;
  if (probe) {
    try {
      dur = parseFloat(execFileSync(probe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim()) || 0;
    } catch { dur = 0; }
  }
  const dir = join(tmpdir(), `desk-strip-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    const frames = [];
    for (let i = 0; i < 3; i++) {
      const at = dur ? dur * (0.15 + 0.35 * i) : i;
      const f = join(dir, `f${i}.jpg`);
      execFileSync(bin, ['-v', 'error', '-y', '-ss', String(at), '-i', path, '-frames:v', '1', '-vf', 'scale=320:-2', f], { stdio: 'ignore' });
      if (!existsSync(f)) return false;
      frames.push(f);
    }
    execFileSync(bin, ['-v', 'error', '-y', ...frames.flatMap((f) => ['-i', f]),
      '-filter_complex', 'hstack=inputs=3', '-frames:v', '1', out], { stdio: 'ignore' });
    return existsSync(out);
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;

// Every card names its author (D118/D121). The door never signs on anyone's
// behalf: an unnamed card is refused. This only reads the machine's own name
// so the refusal can suggest it — the session proposes it, the person agrees,
// and the naming stays a deliberate act like the deposit itself.
export function localAuthor(root = ROOT) {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim();
    if (name) return name;
  } catch { /* no git, or no name set */ }
  return process.env.USER || process.env.LOGNAME || null;
}

// "Was this file run directly?" is fiddlier than it looks, and getting it
// wrong is silent both ways: a door that never starts and answers nothing
// (D122), or a module that starts a server merely because something imported
// it. Two spellings of one path diverge in practice — import.meta.url
// percent-encodes the spaces in this repo's own name, and a path under a
// symlink (macOS /tmp → /private/tmp) resolves differently on each side — so
// compare real paths, and never widen the test to "somewhere near here".
export function isMainModule(importMetaUrl) {
  if (!process.argv[1]) return false;
  const here = fileURLToPath(importMetaUrl);
  const invoked = resolve(process.argv[1]);
  if (here === invoked) return true;
  try {
    return realpathSync(here) === realpathSync(invoked);
  } catch {
    return false;
  }
}

// A refusal the door raised (as opposed to the stream's own words).
export class Refusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'Refusal';
    this.door = true;
  }
}

// ---- reading the log ----

export function nextId(events, prefix = 'm') {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let top = 0;
  for (const ev of events) {
    if (ev.e !== 'deposit') continue;
    const m = re.exec(ev.artifact.id);
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `${prefix}-${String(top + 1).padStart(3, '0')}`;
}

export function highestNight(events) {
  let night = 0;
  for (const ev of events) if (Number.isInteger(ev.night) && ev.night > night) night = ev.night;
  return night;
}

// seed.json then the drop file, replayed through the real stream — the same
// validation the page runs. A damaged drop line is skipped with a warn, never
// fatal: one bad line must not lock the door for the rest of the retreat.
export function readStream({ root = ROOT, warn = () => {} } = {}) {
  const stream = createStream();
  const seed = JSON.parse(readFileSync(join(root, 'seed.json'), 'utf8'));
  for (const ev of seed.events ?? []) stream.append(ev);

  const file = dropFileIn(root);
  let skipped = 0;
  if (existsSync(file)) {
    const { lines } = parseJsonl(readFileSync(file, 'utf8'));
    lines.forEach((line, i) => {
      try {
        stream.append(JSON.parse(line));
      } catch (err) {
        skipped += 1;
        warn(`drop line ${i + 1} skipped — ${err?.message ?? err}`);
      }
    });
  }
  return { stream, skipped };
}

// ---- the door's own guards (never the stream's business) ----

export function refuseOwnedFields(input, fields = OWNED_FIELDS) {
  const named = fields.filter((f) => input?.[f] !== undefined);
  if (!named.length) return null;
  return `the desk sets ${named.join(' and ')} itself — leave ${named.length > 1 ? 'them' : 'it'} out`;
}

export function refuseKind(kind) {
  if (kind === 'meta') return 'the meta card is the curator\'s — this door takes work, failure, quest, or fieldnotes';
  if (!DOOR_KINDS.includes(kind)) return `this door takes work, failure, quest, or fieldnotes — not "${kind}"`;
  return null;
}

// Stated or not — that is all this asks. A malformed list travels on to the
// stream, which knows how to say what is wrong with it (D107).
export function refuseAuthor(people, localName = null) {
  const unstated = people === undefined || (Array.isArray(people) && people.length === 0);
  if (!unstated) return null;
  const hint = isFilled(localName) ? ` — this machine belongs to ${localName}, if that is who made it` : '';
  return `a card needs an author: name who made the work in people${hint}`;
}

export function refuseExcerpt(media, excerpt = {}) {
  const hasPath = isFilled(excerpt?.path);
  if (WORDS_MEDIA.includes(media)) {
    if (hasPath) return `the trace for ${media} is a sentence — hand words, not a file`;
    return null; // a sentence, or withheld: both legal (D6)
  }
  if (NEEDS_TRACE.includes(media) && !hasPath) {
    return `${media} needs a trace — hand the file itself (a recording, a take, or a still) and the desk cuts it`;
  }
  return null; // unknown media: the stream says so, in its own words
}

// What a given medium may be handed (D117): audio and video may arrive as the
// work itself, and the door cuts the trace; everything drawn otherwise is
// already a still.
export function refuseKindOfFile(media, path) {
  const cut = cutKind(path);
  if (!cut) return `the desk draws stills — ${path} is not an image, a recording, or a take`;
  if (media === 'audio' && cut === 'video') return `${path} is a take, not a recording`;
  if (media === 'video' && cut === 'audio') return `${path} is a recording, not a take`;
  if ((media === 'image' || media === 'fold' || media === 'model') && cut !== 'still') {
    return `${media} wants a still — ${path} is a ${cut === 'audio' ? 'recording' : 'take'}`;
  }
  if (cut === 'audio' && !ffmpeg()) return 'no ffmpeg here to read the recording — hand a waveform still instead';
  if (cut === 'video' && !ffmpeg()) return 'no ffmpeg here to read the take — hand a still instead';
  return null;
}

// The read side is deliberately open — the human go is the bound (D109).
// These are hygiene: a real file, a still, a sane size.
export function refuseAsset(path, media = null) {
  let real;
  try {
    real = realpathSync(path);
  } catch {
    return `nothing to read at ${path}`;
  }
  const st = statSync(real);
  if (!st.isFile()) return `${path} is not a file`;
  const wrong = refuseKindOfFile(media, real);
  if (wrong) return wrong;
  if (st.size > MAX_ASSET_BYTES) return `${path} is over 25 MB`;
  return null;
}

export function doorRefusal(input, { localName = null } = {}) {
  if (!input || typeof input !== 'object') return 'a card is an object';
  return refuseOwnedFields(input)
    ?? refuseKind(input.kind)
    ?? refuseAuthor(input.people, localName)
    ?? refuseExcerpt(input.media, input.excerpt ?? {});
}

// ---- input → artifact ----

export function buildArtifact(input) {
  const a = {
    media: input.media,
    kind: input.kind,
    provenance: 'mcp', // the door names itself (D65)
    visibility: 'public', // consent tiers arrive with the room server (§7 step 5)
  };
  // blank is not a title: it would sit in the log as junk and render as nothing
  if (isFilled(input.title)) a.title = input.title;
  // Passed through exactly as stated — a malformed list included, so the
  // stream can say what is wrong with it rather than the door tidying it (D107).
  if (input.people !== undefined) a.people = input.people;

  // the author is always on the front (D88's rule, kept at this door too)
  if (isFilled(input.caption)) a.caption = input.caption;
  else if (a.people?.length && a.people.every(isFilled)) a.caption = a.people.join(' + ');

  const ex = input.excerpt ?? {};
  a.excerpt = { form: ex.form ?? FORM_FOR[input.media] };
  if (isFilled(ex.text)) a.excerpt.text = ex.text;

  if (input.detail && typeof input.detail === 'object' && Object.keys(input.detail).length) {
    a.detail = input.detail;
  }
  return a;
}

// ---- payloads: heavy things live beside the log, never inside it ----

// BRIEF §9's one amendment to append-only is that facts are append-only and
// payloads are deletable: heavy media lives as files the log points at, so a
// withdrawal can delete the bytes while the history stays honest. A data: URL
// baked into a line cannot be deleted without rewriting that line — so every
// one the depositor's device cut on its way here is written out to
// drop/assets/ before the line is written.
const DATA_HEAD = /^data:([^,]*),/i;

const EXT_FOR_TYPE = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/avif': '.avif', 'image/svg+xml': '.svg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
  'audio/wav': '.wav', 'audio/ogg': '.ogg', 'video/mp4': '.mp4', 'video/quicktime': '.mov',
  'video/webm': '.webm',
};

// A blob at this door is a File's three parts minus the browser:
// { name, type, bytes }. The extension comes from the depositor's own filename
// first and the declared type second — an unnamed, untyped blob shelves bare.
export function blobExt(blob) {
  const named = extname(blob?.name ?? '').toLowerCase();
  if (named) return named;
  return EXT_FOR_TYPE[String(blob?.type ?? '').toLowerCase()] ?? '';
}

export function dataUrlParts(url) {
  const m = DATA_HEAD.exec(String(url ?? ''));
  if (!m) return null;
  const head = m[1];
  const body = String(url).slice(m[0].length);
  try {
    return {
      type: head.split(';')[0] || 'text/plain',
      bytes: /;base64/i.test(head) ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8'),
    };
  } catch {
    return null; // malformed: left exactly as it came, for the stream to judge
  }
}

// Plans every file this card puts beside the log and rewrites the artifact to
// point at them — but writes nothing. The writing happens only after the
// stream has agreed, so a refused card leaves no stray asset behind.
export function planPayloads(artifact, blobs, id, root) {
  const writes = [];
  const seen = new Map(); // one blob, one file: composeArtifact hands the same
  // File to a piece and to the experience door that summons it
  const place = (bytes, ext) => {
    const name = `${id}-${writes.length}${ext}`;
    writes.push({ bytes, to: join(assetDirIn(root), name) });
    return `drop/assets/${name}`;
  };
  const forBlob = (blob) => {
    if (seen.has(blob)) return seen.get(blob);
    const at = place(blob.bytes, blobExt(blob));
    seen.set(blob, at);
    return at;
  };
  const finished = materialize(artifact, blobs, forBlob);

  const external = (v) => {
    if (typeof v !== 'string' || !v.startsWith('data:')) return v;
    const parts = dataUrlParts(v);
    return parts ? place(parts.bytes, EXT_FOR_TYPE[parts.type] ?? '') : v;
  };
  if (finished.excerpt?.src) finished.excerpt = { ...finished.excerpt, src: external(finished.excerpt.src) };
  const comp = finished.detail?.composition;
  if (Array.isArray(comp)) {
    finished.detail = {
      ...finished.detail,
      composition: comp.map((e) => (e && typeof e === 'object'
        ? { ...e, ...(e.src ? { src: external(e.src) } : {}), ...(e.embed ? { embed: external(e.embed) } : {}) }
        : e)),
    };
  }
  return { finished, writes };
}

// ---- the sink: the tray's face, and nothing stricter than the stream ----

// One sink, both doors (D106). What differs is only what a blob IS: the MCP
// door hands a path on this machine and the desk cuts the trace from it (D117),
// while the hand door hands the bytes themselves, already cut on the
// depositor's own device (D81), to fill the slots the sheet left null (D85).
// The prefix is whose numbering this is — m-### at the terminal, h-### at the
// hand door; every fork numbers its own (D19).
export function createDeskSink({ root = ROOT, prefix = 'm', warn = () => {} } = {}) {
  return {
    // blobs — MCP: { excerpt: '<path on this machine>' }.
    //         hand: { 'piece:N': blob, experience: blob }, blob = { name, type, bytes }.
    deposit(artifact, blobs = {}) {
      const { stream } = readStream({ root, warn });
      const events = stream.all();
      const id = nextId(events, prefix);
      const night = highestNight(events);

      let finished = { ...artifact, id, excerpt: { ...artifact.excerpt } };
      let trace = null; // what lands in drop/assets, once the stream has agreed
      if (typeof blobs.excerpt === 'string') { // the MCP door's path on this machine
        const from = blobs.excerpt;
        const kind = cutKind(from);
        const ext = kind === 'audio' ? '.svg' : kind === 'video' ? '.jpg' : extname(from).toLowerCase();
        trace = { from, kind, to: join(assetDirIn(root), `${id}${ext}`) };
        finished.excerpt.src = `drop/assets/${id}${ext}`; // relative to the served root
        // A recording or a take also shelves itself, so the card can be heard
        // and seen on its back — one experience, summoned by its door (D72/D119).
        // Whatever the person arranged on the back is theirs and survives
        // whole: the door only fills what they left empty, and adds the work
        // itself in front of their arrangement (D126). It never replaces a
        // door they chose or words they wrote — a card laid must be the card
        // they confirmed.
        const arranged = finished.detail ?? {};
        const priorPieces = Array.isArray(arranged.composition) ? arranged.composition : [];
        if (kind === 'audio' || kind === 'video') {
          const srcExt = extname(from).toLowerCase();
          trace.source = { to: join(assetDirIn(root), `${id}-source${srcExt}`) };
          finished.detail = {
            ...arranged,
            // one experience per back, depositor-set (D72): theirs wins
            experience: arranged.experience ?? { mode: 'play', src: `drop/assets/${id}-source${srcExt}` },
          };
        } else {
          // A still's front is only as big as the card. The back shelves the
          // same bytes whole, so the card turns and the work can be read in
          // full — and the file is there under its own name (D80/D120).
          finished.detail = {
            ...arranged,
            composition: [{
              t: 'image',
              src: `drop/assets/${id}${ext}`,
              name: basename(from),
              orig: `drop/assets/${id}${ext}`,
            }, ...priorPieces],
          };
        }
      }

      // The hand door's blobs fill their null slots, and any data: URL the
      // device cut becomes a file — both planned, neither written yet.
      const handBlobs = Object.fromEntries(Object.entries(blobs).filter(([k]) => k !== 'excerpt'));
      const planned = planPayloads(finished, handBlobs, id, root);
      finished = planned.finished;

      const event = { e: 'deposit', night, artifact: finished };
      stream.append(event); // the stream's words, verbatim, if this throws

      // Validated before anything touches the disk: a refused card leaves no
      // stray asset and no half-written line.
      if (planned.writes.length) {
        mkdirSync(assetDirIn(root), { recursive: true });
        for (const w of planned.writes) writeFileSync(w.to, w.bytes);
      }
      if (trace) {
        mkdirSync(assetDirIn(root), { recursive: true });
        if (trace.kind === 'audio') { // the recording attests through its own shape (D117)
          const peaks = peaksFromAudio(trace.from);
          if (!peaks) throw new Refusal(`${trace.from} could not be read as a recording`);
          writeFileSync(trace.to, peaksToSvg(peaks));
        } else if (trace.kind === 'video') {
          if (!stripFromVideo(trace.from, trace.to)) {
            rmSync(trace.to, { force: true }); // a half-written strip is not a trace
            throw new Refusal(`${trace.from} could not be read as a take`);
          }
        } else {
          copyFileSync(trace.from, trace.to); // a still travels verbatim — never recut (D109)
        }
        if (trace.source) copyFileSync(trace.from, trace.source.to); // the work itself, untouched (D80)
      }
      const file = dropFileIn(root);
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${JSON.stringify(event)}\n`); // one line, append-only (§9)

      return { id, night, event };
    },
  };
}

// ---- an uploaded file, made local ----

// Over HTTP the work sits on the depositor's laptop, not on this machine, so
// it arrives as bytes. Written under the depositor's own filename, it becomes
// exactly what the stdio door has always been handed — a path — and every
// guard below applies unchanged: the kind gate, the size bound, the ffmpeg
// cut, the refusals and their wording. The name is the person's, so a refusal
// still speaks about the file they handed over and not about a temp path.
export function bytesToFile(bytes, name = 'upload') {
  const dir = mkdtempSync(join(tmpdir(), 'desk-upload-'));
  const safe = basename(String(name)).replace(/[/\\]/g, '') || 'upload';
  const at = join(dir, safe);
  writeFileSync(at, bytes);
  return { path: at, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---- the whole door, in one call ----

// `author` is the participant the room server recognised from their token — a
// name registered once, deliberately, rather than one the machine invented
// (D121's principle kept, its mechanism moved to registration by the room
// server). It fills `people` only when nothing was stated; a stated list always
// travels exactly as stated, for the stream to judge (D107).
export function depositCard(input, { root = ROOT, warn = () => {}, sink = null, author = null } = {}) {
  const named = input?.people === undefined || (Array.isArray(input?.people) && input.people.length === 0);
  const signed = named && isFilled(author) ? { ...input, people: [author] } : input;

  const refused = doorRefusal(signed, { localName: author ?? localAuthor(root) });
  if (refused) throw new Refusal(refused);

  const path = signed.excerpt?.path;
  if (isFilled(path)) {
    const bad = refuseAsset(path, signed.media);
    if (bad) throw new Refusal(bad);
  }

  const artifact = buildArtifact(signed);
  if (JSON.stringify(artifact).length > MAX_ARTIFACT_BYTES) {
    throw new Refusal('this card is too heavy for a line — an excerpt travels as a path or a sentence, not as bytes');
  }

  const door = sink ?? createDeskSink({ root, warn });
  return door.deposit(artifact, isFilled(path) ? { excerpt: realpathSync(path) } : {});
}

// ---- the hand door, over the LAN ----

// The sheet composes a whole artifact on the depositor's device, so unlike the
// MCP door there is nothing to build here — only to refuse. The client is
// never trusted: the fields the desk owns are refused rather than honoured,
// the door names itself, and the stream remains the sole judge of shape (D107).
export function depositHand(artifact, blobs = {}, { root = ROOT, warn = () => {}, sink = null, author = null } = {}) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) throw new Refusal('a card is an object');
  const owned = refuseOwnedFields(artifact, HAND_OWNED);
  if (owned) throw new Refusal(owned);

  const stated = Array.isArray(artifact.people) && artifact.people.length > 0;
  const signed = {
    ...artifact,
    ...(stated ? {} : isFilled(author) ? { people: [author] } : {}),
    // signed over, whatever the client claimed: the door knows which door it is
    provenance: 'hand', // (D65)
    visibility: 'public', // consent tiers arrive with their own step
  };
  if (!Array.isArray(signed.people) || !signed.people.some(isFilled)) {
    throw new Refusal('a card needs an author — an @name in the text');
  }
  // The author is always on the front, at both doors (D88), and only where the
  // maker wrote no caption of their own.
  if (!isFilled(signed.caption) && signed.people.every(isFilled)) signed.caption = signed.people.join(' + ');

  const door = sink ?? createDeskSink({ root, prefix: 'h', warn });
  return door.deposit(signed, blobs);
}
