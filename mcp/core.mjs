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
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createStream } from '../js/stream.js';
import { parseJsonl } from '../js/live.js';
// The waveform's house style is the hand door's — one drawing, both doors, so
// a card cut here and a card cut on a phone are the same card (D117).
import { peaksToSvg } from '../js/deposit.js';

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

export function refuseOwnedFields(input) {
  const named = OWNED_FIELDS.filter((f) => input?.[f] !== undefined);
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
  if (isFilled(input.practice)) a.practice = input.practice; // optional at the door (D95)

  const ex = input.excerpt ?? {};
  a.excerpt = { form: ex.form ?? FORM_FOR[input.media] };
  if (isFilled(ex.text)) a.excerpt.text = ex.text;

  if (input.detail && typeof input.detail === 'object' && Object.keys(input.detail).length) {
    a.detail = input.detail;
  }
  return a;
}

// ---- the sink: the tray's face, and nothing stricter than the stream ----

export function createDeskSink({ root = ROOT, warn = () => {} } = {}) {
  return {
    // blobs: { excerpt: '<path to a still> ' } — node-side blobs are file paths.
    // Back-shelved files arrive with stage→confirm (§7 step 5); anything else here
    // is refused rather than silently dropped.
    deposit(artifact, blobs = {}) {
      const extra = Object.keys(blobs).filter((k) => k !== 'excerpt');
      if (extra.length) throw new Refusal('shelving files on a back arrives with stage→confirm — v0 backs carry text and links');

      const { stream } = readStream({ root, warn });
      const events = stream.all();
      const id = nextId(events, 'm');
      const night = highestNight(events);

      const finished = { ...artifact, id, excerpt: { ...artifact.excerpt } };
      let trace = null; // what lands in drop/assets, once the stream has agreed
      if (blobs.excerpt) {
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

      const event = { e: 'deposit', night, artifact: finished };
      stream.append(event); // the stream's words, verbatim, if this throws

      // Validated before anything touches the disk: a refused card leaves no
      // stray asset and no half-written line.
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

// ---- the whole door, in one call ----

export function depositCard(input, { root = ROOT, warn = () => {}, sink = null } = {}) {
  const refused = doorRefusal(input, { localName: localAuthor(root) });
  if (refused) throw new Refusal(refused);

  const path = input.excerpt?.path;
  if (isFilled(path)) {
    const bad = refuseAsset(path, input.media);
    if (bad) throw new Refusal(bad);
  }

  const artifact = buildArtifact(input);
  if (JSON.stringify(artifact).length > MAX_ARTIFACT_BYTES) {
    throw new Refusal('this card is too heavy for a line — an excerpt travels as a path or a sentence, not as bytes');
  }

  const door = sink ?? createDeskSink({ root, warn });
  return door.deposit(artifact, isFilled(path) ? { excerpt: realpathSync(path) } : {});
}
