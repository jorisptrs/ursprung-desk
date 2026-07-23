// The MCP door, without the protocol. Two rejectors under test (D107): the
// stream's words for shape, the door's own words for transport. Dev-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, openSync, ftruncateSync, closeSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  depositCard, createDeskSink, readStream, buildArtifact, nextId, highestNight,
  doorRefusal, refuseOwnedFields, refuseKind, refuseExcerpt, refuseAsset, refuseAuthor, peaksFromAudio, ffmpeg, ffprobe,
  Refusal, MAX_ARTIFACT_BYTES, dropFileIn, assetDirIn,
} from '../mcp/core.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEED = {
  events: [
    { e: 'deposit', night: 0, artifact: { id: 'a-001', media: 'note', kind: 'quest', title: 'a fold that will not close', practice: 'origami', people: ['R.'], provenance: 'curator', visibility: 'public', excerpt: { form: 'words', text: 'a fold that will not close' } } },
    { e: 'deposit', night: 2, artifact: { id: 'a-002', media: 'note', kind: 'meta', title: 'the desk, v0', practice: 'cartography', people: ['J.', 'Claude'], provenance: 'curator', visibility: 'public', excerpt: { form: 'words', text: 'the desk, v0' } } },
  ],
};

// A one-pixel PNG — real bytes, so the copy can be byte-compared.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'desk-mcp-'));
  writeFileSync(join(root, 'seed.json'), JSON.stringify(SEED));
  const still = join(root, 'crane.png');
  writeFileSync(still, PNG);
  return { root, still };
}

const lines = (root) => {
  const f = dropFileIn(root);
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};
const words = (fn) => {
  try { fn(); } catch (err) { return err.message; }
  return null;
};

test('a confirmed card lands: m-001, the highest night, one line, the still copied verbatim', () => {
  const { root, still } = fixture();
  const r = depositCard({
    media: 'image', kind: 'work', title: 'the fold, closed',
    caption: 'paper · R. + Claude', people: ['R.', 'Claude'], practice: 'origami',
    excerpt: { path: still },
  }, { root });

  assert.equal(r.id, 'm-001');
  assert.equal(r.night, 2, 'the current highest night (D19)');
  assert.equal(lines(root).length, 1, 'exactly one line appended');

  const ev = JSON.parse(lines(root)[0]);
  assert.equal(ev.e, 'deposit');
  assert.equal(ev.artifact.provenance, 'mcp', 'the door names itself (D65)');
  assert.equal(ev.artifact.visibility, 'public');
  assert.equal(ev.artifact.excerpt.form, 'crop', 'form defaults from the media');
  assert.equal(ev.artifact.excerpt.src, 'drop/assets/m-001.png', 'a served relative url');
  assert.deepEqual(readFileSync(join(assetDirIn(root), 'm-001.png')), PNG, 'copied byte-for-byte (D109)');
});

test('the second card takes the next id; ids and nights come from the log, not a counter', () => {
  const { root, still } = fixture();
  depositCard({ media: 'image', kind: 'work', people: ['R.'], title: 'one', excerpt: { path: still } }, { root });
  const second = depositCard({ media: 'image', kind: 'failure', people: ['R.'], title: 'two', excerpt: { path: still } }, { root });
  assert.equal(second.id, 'm-002');
  assert.equal(lines(root).length, 2);

  // a fresh sink re-reads the file — no in-process state carries the count
  const third = createDeskSink({ root }).deposit(buildArtifact({ media: 'note', kind: 'work', title: 'three', people: ['J.'] }), {});
  assert.equal(third.id, 'm-003');
});

test('server-owned fields are refused, never overwritten (D107)', () => {
  const { root, still } = fixture();
  for (const field of ['id', 'night', 'provenance', 'visibility']) {
    const msg = words(() => depositCard({
      media: 'image', kind: 'work', people: ['R.'], title: 'x', [field]: field === 'night' ? 3 : 'anything', excerpt: { path: still },
    }, { root }));
    assert.match(msg, new RegExp(field), `${field} names itself in the refusal`);
    assert.match(msg, /leave it out|leave them out/);
  }
  assert.equal(lines(root).length, 0, 'a refused card writes nothing');
  assert.equal(refuseOwnedFields({ id: 'x', night: 1 }), 'the desk sets id and night itself — leave them out');
  assert.equal(refuseOwnedFields({ media: 'note' }), null);
});

test('the kind gate: work · failure · quest · fieldnotes; meta is the curator\'s (D108)', () => {
  const { root } = fixture();
  assert.match(refuseKind('meta'), /curator/);
  assert.match(refuseKind('sculpture'), /work, failure, quest, or fieldnotes/);
  for (const kind of ['work', 'failure', 'quest', 'fieldnotes']) assert.equal(refuseKind(kind), null);

  assert.match(words(() => depositCard({ media: 'note', kind: 'meta', people: ['R.'], title: 'the desk' }, { root })), /curator/);
  const notes = depositCard({ media: 'note', kind: 'fieldnotes', people: ['R.'], title: 'the fold and the drone are one problem' }, { root });
  assert.equal(notes.id, 'm-001', 'Claude\'s field notes enter by the same gesture (BRIEF §3)');
});

test('excerpts: the drawn media need a file, the read media need words (D109/D117)', () => {
  const { root, still } = fixture();
  for (const media of ['image', 'audio', 'video', 'fold', 'model']) {
    assert.match(refuseExcerpt(media, {}), /needs a trace/, `${media} has no withheld branch in cards.js`);
    assert.equal(refuseExcerpt(media, { path: '/x.png' }), null);
  }
  for (const media of ['text', 'code', 'note']) {
    assert.equal(refuseExcerpt(media, {}), null, 'withheld is legal (D6)');
    assert.equal(refuseExcerpt(media, { text: 'a line' }), null);
    assert.match(refuseExcerpt(media, { path: '/x.png' }), /a sentence — hand words/);
  }
  assert.equal(refuseExcerpt('hologram', {}), null, 'unknown media is the stream\'s to reject');

  assert.match(words(() => depositCard({ media: 'audio', kind: 'work', people: ['R.'], title: 'kettle drone' }, { root })), /needs a trace/);
  const sentence = depositCard({ media: 'text', kind: 'work', people: ['R.'], title: 'chapter 7', excerpt: { text: 'the door was already open.' } }, { root });
  assert.equal(sentence.id, 'm-001');
  const withheld = depositCard({ media: 'code', kind: 'work', people: ['R.'], title: 'the 1993 system' }, { root });
  assert.equal(JSON.parse(lines(root)[1]).artifact.excerpt.form, 'lines', 'withheld keeps its natural form (D6)');
  assert.equal(withheld.id, 'm-002');
  assert.ok(!existsSync(assetDirIn(root)), 'nothing was copied for word cards');
});

test('path hygiene: a real file, of a kind the desk can draw, under the size bound', () => {
  const { root, still } = fixture();
  assert.match(refuseAsset(join(root, 'nope.png'), 'image'), /nothing to read/);
  assert.match(refuseAsset(root, 'image'), /is not a file/);

  const notATrace = join(root, 'notes.txt');
  writeFileSync(notATrace, 'not a trace of anything');
  assert.match(refuseAsset(notATrace, 'image'), /not an image, a recording, or a take/);
  const mov = join(root, 'take.mov');
  writeFileSync(mov, 'not really a movie');
  assert.match(refuseAsset(mov, 'image'), /image wants a still/, 'a take is not a photograph');
  assert.match(refuseAsset(mov, 'audio'), /is a take, not a recording/);

  const huge = join(root, 'huge.png');
  const fd = openSync(huge, 'w');
  ftruncateSync(fd, 26 * 1024 * 1024); // sparse — instant, and stat sees 26 MB
  closeSync(fd);
  assert.match(refuseAsset(huge, 'image'), /over 25 MB/);
  assert.equal(lines(root).length, 0);
});

test('the stream keeps the last word on shape, verbatim', () => {
  const { root, still } = fixture();
  assert.match(words(() => depositCard({ media: 'hologram', kind: 'work', people: ['R.'], title: 'x' }, { root })), /unknown media "hologram"/);
  assert.match(words(() => createDeskSink({ root }).deposit({ media: 'note', kind: 'work', people: ['J.'], provenance: 'mcp', visibility: 'public', excerpt: { form: 'words' } }, {})), /a card needs a title, a caption, or a line of its own/);
  assert.match(words(() => depositCard({ media: 'image', kind: 'work', people: ['R.'], title: 'x', excerpt: { form: 'engraving', path: still } }, { root })), /unknown excerpt form "engraving"/);
  assert.match(words(() => depositCard({ media: 'note', kind: 'work', title: 'x', people: [1, 2] }, { root })), /people must be strings/);
  assert.match(words(() => depositCard({
    media: 'note', kind: 'work', people: ['R.'], title: 'x', detail: { experience: { mode: 'perform', src: 'a.wav' } },
  }, { root })), /unknown experience mode "perform"/);
  assert.equal(lines(root).length, 0, 'not one refused card reached the file');
  assert.ok(!existsSync(assetDirIn(root)), 'and not one stray asset');
});

test('a card too heavy for a line is refused before the stream sees it', () => {
  const { root } = fixture();
  const msg = words(() => depositCard({
    media: 'note', kind: 'work', people: ['R.'], title: 'x', detail: { note: 'w'.repeat(MAX_ARTIFACT_BYTES) },
  }, { root }));
  assert.match(msg, /too heavy for a line/);
  assert.equal(lines(root).length, 0);
});

test('backs shelving files is August, and says so rather than dropping them', () => {
  const { root, still } = fixture();
  const msg = words(() => createDeskSink({ root }).deposit(
    buildArtifact({ media: 'note', kind: 'work', people: ['R.'], title: 'x' }), { 'piece:0': still },
  ));
  assert.match(msg, /stage→confirm/);
});

test('a torn last line is not yet a line; a damaged one is skipped, not fatal', () => {
  const { root, still } = fixture();
  depositCard({ media: 'image', kind: 'work', people: ['R.'], title: 'one', excerpt: { path: still } }, { root });
  const file = dropFileIn(root);
  const whole = readFileSync(file, 'utf8'); // the server only ever leaves whole lines

  // a reader catching the door mid-write sees an unterminated tail
  writeFileSync(file, `${whole}{"e":"deposit","night":4,"artif`);
  const warned = [];
  const { stream } = readStream({ root, warn: (m) => warned.push(m) });
  assert.equal(stream.all().length, SEED.events.length + 1, 'the torn tail was not read');
  assert.equal(warned.length, 0, 'an unfinished line is not damage');

  // a whole line of nonsense, and a whole line the stream refuses
  writeFileSync(file, `${whole}not json\n{"e":"deposit","night":1,"artifact":{"id":"m-009","media":"ghost","kind":"work","title":"x","provenance":"mcp","visibility":"public","excerpt":{"form":"words"}}}\n`);
  const r = depositCard({ media: 'note', kind: 'work', people: ['R.'], title: 'two' }, { root, warn: (m) => warned.push(m) });
  assert.equal(warned.length, 2, 'both bad lines warned, neither fatal');
  assert.match(warned[0], /skipped/);
  assert.match(warned[1], /unknown media "ghost"/);
  assert.equal(r.id, 'm-002', 'the refused ghost never claimed an id');
});

test('readStream replays seed then drop, and reports what it skipped', () => {
  const { root } = fixture();
  const { stream, skipped } = readStream({ root });
  assert.equal(stream.all().length, 2);
  assert.equal(skipped, 0);
  assert.equal(highestNight(stream.all()), 2);
  assert.equal(nextId(stream.all(), 'm'), 'm-001');
  assert.equal(nextId(stream.all(), 'h'), 'h-001', 'the same walk serves either door');
  assert.equal(nextId([{ e: 'deposit', artifact: { id: 'm-009' } }, { e: 'deposit', artifact: { id: 'm-002' } }], 'm'), 'm-010');
});

test('buildArtifact keeps only what was given; the door fills its own two', () => {
  const a = buildArtifact({ media: 'note', kind: 'work', title: 'x' });
  assert.deepEqual(a, { media: 'note', kind: 'work', title: 'x', provenance: 'mcp', visibility: 'public', excerpt: { form: 'words' } },
    'with no author offered and none inferred, the stream is left to say so');
  const named = buildArtifact({ media: 'note', kind: 'work', title: 'x', people: ['B.'] });
  assert.deepEqual(named.people, ['B.']);
  assert.equal(named.caption, 'B.', 'the author stands on the front (D88)');
  const stated = buildArtifact({ media: 'note', kind: 'work', title: 'x', people: ['B.'], caption: 'audio · B.' });
  assert.equal(stated.caption, 'audio · B.', 'a written caption is never overwritten');
  assert.ok(!('practice' in a), 'practice is optional at the door (D95)');
  assert.ok(!('caption' in a) && !('people' in a) && !('detail' in a));
  const full = buildArtifact({ media: 'text', kind: 'quest', title: 'x', caption: 'c', people: ['E.'], practice: 'manuscript', excerpt: { text: 's' }, detail: { note: 'n' } });
  assert.equal(full.caption, 'c');
  assert.deepEqual(full.people, ['E.']);
  assert.equal(full.practice, 'manuscript');
  assert.deepEqual(full.excerpt, { form: 'sentence', text: 's' });
  assert.deepEqual(full.detail, { note: 'n' });
  assert.equal(buildArtifact({ media: 'note', kind: 'work', people: ['R.'], title: 'x', detail: {} }).detail, undefined, 'an empty back is no back (D5)');
});

test('doorRefusal is the whole door in one call, in refusal order', () => {
  assert.equal(doorRefusal(null), 'a card is an object');
  assert.match(doorRefusal({ id: 'x', kind: 'meta' }), /leave it out/, 'ownership first');
  assert.match(doorRefusal({ kind: 'meta', people: ['R.'], media: 'image' }), /curator/, 'then the kind');
  assert.match(doorRefusal({ kind: 'work', people: ['R.'], media: 'image' }), /needs a trace/, 'then the excerpt');
  assert.equal(doorRefusal({ kind: 'work', people: ['R.'], media: 'note' }), null);
});

test('a refusal is a Refusal — the door\'s words are distinguishable from the stream\'s', () => {
  const { root } = fixture();
  try {
    depositCard({ media: 'note', kind: 'meta', people: ['R.'], title: 'x' }, { root });
    assert.fail('should have refused');
  } catch (err) {
    assert.ok(err instanceof Refusal);
    assert.equal(err.door, true);
  }
  try {
    depositCard({ media: 'hologram', kind: 'work', people: ['R.'], title: 'x' }, { root });
    assert.fail('should have refused');
  } catch (err) {
    assert.ok(!(err instanceof Refusal), 'shape refusals come from the stream itself');
    assert.match(err.message, /stream reject/);
  }
});

test('a recording is cut into its waveform here, as the hand door cuts it there (D117)', () => {
  const { root } = fixture();
  const rec = join(root, 'kettle.m4a');
  copyFileSync(join(REPO, 'assets', 'Test.m4a'), rec); // a real recording, really decoded

  const r = depositCard({ media: 'audio', kind: 'work', people: ['R.'], title: 'kettle drone, take 4', caption: 'audio · B. + Claude', excerpt: { path: rec } }, { root });
  const ev = JSON.parse(lines(root)[0]);
  assert.equal(ev.artifact.excerpt.form, 'waveform');
  assert.equal(ev.artifact.excerpt.src, `drop/assets/${r.id}.svg`, 'the trace is a drawing, not the recording');
  const svg = readFileSync(join(assetDirIn(root), `${r.id}.svg`), 'utf8');
  assert.match(svg, /^<svg xmlns/, 'and it is the house waveform');
  assert.ok(svg.split('M').length > 20, 'with a stroke per bucket');
  assert.ok(!existsSync(join(assetDirIn(root), `${r.id}.m4a`)), 'the recording itself stays where it lives');
});

test('peaks come from the sound, not from the filename', () => {
  const peaks = peaksFromAudio(join(REPO, 'assets', 'Test.m4a'));
  assert.equal(peaks.length, 44);
  assert.ok(peaks.every((p) => p >= 0 && p <= 1), 'normalized');
  assert.ok(Math.max(...peaks) > 0.99, 'the loudest bucket sets the top');
  assert.ok(new Set(peaks.map((p) => p.toFixed(3))).size > 5, 'a real signal, not a flat line');
});

test('a still handed for audio is still used as it is', () => {
  const { root, still } = fixture();
  const r = depositCard({ media: 'audio', kind: 'work', people: ['R.'], title: 'the piece, finished', excerpt: { path: still } }, { root });
  assert.equal(JSON.parse(lines(root)[0]).artifact.excerpt.src, `drop/assets/${r.id}.png`);
  assert.deepEqual(readFileSync(join(assetDirIn(root), `${r.id}.png`)), PNG, 'a pre-drawn waveform is never recut');
});

test('a card needs a title, a caption, or a line — any one of the three (D116)', () => {
  const { root, still } = fixture();
  // caption alone: a photograph that says what it is
  const a = depositCard({ media: 'image', kind: 'work', people: ['R.'], caption: 'one phone, six hands · the walk', excerpt: { path: still } }, { root });
  assert.equal(a.id, 'm-001');
  assert.equal(JSON.parse(lines(root)[0]).artifact.title, undefined, 'no title at all, and the desk took it');

  // a line alone
  const b = depositCard({ media: 'text', kind: 'work', people: ['R.'], excerpt: { text: 'the door was already open.' } }, { root });
  assert.equal(b.id, 'm-002');

  // at this door the author fills the caption, so a card is never wordless;
  // the rule itself is the stream's, and it still bites on a bare artifact
  assert.match(words(() => createDeskSink({ root }).deposit(
    { media: 'note', kind: 'work', people: ['J.'], provenance: 'mcp', visibility: 'public', excerpt: { form: 'words' } }, {})),
    /a card needs a title, a caption, or a line of its own/);
});

test('a take is cut into a three-still strip, side by side (D117)', { skip: !ffmpeg() && 'no ffmpeg here' }, () => {
  const { root } = fixture();
  const take = join(root, 'walk.mp4');
  // a real 2 s clip, made here so the cut has something honest to read
  execFileSync(ffmpeg(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=240x160:rate=10:duration=2',
    '-pix_fmt', 'yuv420p', take], { stdio: 'ignore' });

  const r = depositCard({ media: 'video', kind: 'work', people: ['R.'], title: 'the walk', excerpt: { path: take } }, { root });
  const ev = JSON.parse(lines(root)[0]);
  assert.equal(ev.artifact.excerpt.form, 'frames');
  assert.equal(ev.artifact.excerpt.src, `drop/assets/${r.id}.jpg`);

  const strip = join(assetDirIn(root), `${r.id}.jpg`);
  assert.ok(existsSync(strip));
  const size = execFileSync(ffprobe(), ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', strip], { encoding: 'utf8' }).trim();
  const [w, h] = size.split(',').map(Number);
  assert.equal(w, 960, 'three 320-wide stills side by side');
  // each still keeps the take's 3:2 shape — 320 wide → ~213 tall, rounded even
  assert.ok(Math.abs(h - Math.round((320 * 160) / 240)) <= 2, `the strip keeps the take's shape (got ${w}x${h})`);
  assert.ok(!existsSync(join(assetDirIn(root), `${r.id}.mp4`)), 'the take itself stays where it lives');
});

test('a take offered as audio, and a recording offered as video, are named plainly', () => {
  const { root } = fixture();
  const take = join(root, 'walk.mp4');
  writeFileSync(take, 'x');
  assert.match(words(() => depositCard({ media: 'audio', kind: 'work', people: ['R.'], title: 'x', excerpt: { path: take } }, { root })),
    /is a take, not a recording/);
  const rec = join(root, 'drone.m4a');
  writeFileSync(rec, 'x');
  assert.match(words(() => depositCard({ media: 'video', kind: 'work', people: ['R.'], title: 'x', excerpt: { path: rec } }, { root })),
    /is a recording, not a take/);
  assert.equal(lines(root).length, 0);
});

test('an unreadable recording or take is refused in the desk\'s words, not ffmpeg\'s', () => {
  const { root } = fixture();
  const notReally = join(root, 'drone.m4a');
  writeFileSync(notReally, 'this is not a recording at all');
  const msg = words(() => depositCard({ media: 'audio', kind: 'work', people: ['R.'], title: 'kettle drone', excerpt: { path: notReally } }, { root }));
  assert.match(msg, /could not be read as a recording/);
  assert.ok(!/Command failed|ffmpeg|ENOENT/.test(msg), `no tooling noise in the refusal: ${msg}`);
  assert.equal(lines(root).length, 0, 'and nothing was written');

  const brokenTake = join(root, 'walk.mp4');
  writeFileSync(brokenTake, 'nor is this a take');
  const msg2 = words(() => depositCard({ media: 'video', kind: 'work', people: ['R.'], title: 'the walk', excerpt: { path: brokenTake } }, { root }));
  assert.match(msg2, /could not be read as a take/);
  assert.ok(!/Command failed|ffmpeg/.test(msg2), `no tooling noise: ${msg2}`);
  assert.equal(lines(root).length, 0);
  assert.deepEqual(existsSync(assetDirIn(root)) ? readdirSync(assetDirIn(root)) : [], [], 'and no half-cut trace was left behind');
});

test('the door never signs for anyone: an unnamed card is refused (D121)', () => {
  const { root, still } = fixture();
  const msg = words(() => depositCard({ media: 'image', kind: 'work', title: 'x', excerpt: { path: still } }, { root }));
  assert.match(msg, /a card needs an author: name who made the work in people/);
  assert.match(msg, /this machine belongs to /, 'and it offers the machine\'s own name as a suggestion, not a signature');
  assert.equal(lines(root).length, 0, 'nothing was laid in anyone\'s name');

  assert.match(words(() => depositCard({ media: 'note', kind: 'work', title: 'x', people: [] }, { root })),
    /needs an author/, 'an empty list is the same as saying nothing');

  // stated is enough — even a malformed list travels on for the stream to judge
  assert.equal(refuseAuthor(['B.'], 'Joris Peters'), null);
  assert.equal(refuseAuthor([1, 2], 'Joris Peters'), null, 'shape is the stream\'s business (D107)');
  const bad = buildArtifact({ media: 'note', kind: 'work', title: 'x', people: [1, 2] });
  assert.deepEqual(bad.people, [1, 2], 'never cleaned into something legal');
  assert.equal(bad.caption, undefined, 'and no caption is invented from it');
  assert.match(words(() => depositCard({ media: 'note', kind: 'work', title: 'x', people: [1, 2] }, { root })),
    /people must be strings/);
  assert.equal(lines(root).length, 0);

  // named, it lands
  const r = depositCard({ media: 'image', kind: 'work', title: 'x', people: ['R.'], excerpt: { path: still } }, { root });
  assert.equal(r.id, 'm-001');
});


test('a recording shelves itself behind a play door, so the card can be heard (D119)', () => {
  const { root } = fixture();
  const rec = join(root, 'kettle.m4a');
  copyFileSync(join(REPO, 'assets', 'Test.m4a'), rec);
  const r = depositCard({ media: 'audio', kind: 'work', people: ['R.'], title: 'kettle drone, take 4', excerpt: { path: rec } }, { root });

  const a = JSON.parse(lines(root)[0]).artifact;
  assert.equal(a.excerpt.src, `drop/assets/${r.id}.svg`, 'the front is the drawing');
  assert.deepEqual(a.detail.experience, { mode: 'play', src: `drop/assets/${r.id}-source.m4a` }, 'the back carries the work itself');
  assert.deepEqual(readFileSync(join(assetDirIn(root), `${r.id}-source.m4a`)), readFileSync(rec), 'shelved byte-for-byte (D80)');
});

test('a still brings no play door — there is nothing to summon', () => {
  const { root, still } = fixture();
  depositCard({ media: 'image', kind: 'work', people: ['R.'], title: 'the fold, closed', excerpt: { path: still } }, { root });
  const d = JSON.parse(lines(root)[0]).artifact.detail;
  assert.equal(d.experience, undefined, 'nothing plays');
  assert.equal(d.composition.length, 1, 'but the still itself is on the back to be read (D120)');
});

test('a still card turns, and its back holds the work whole (D120)', () => {
  const { root, still } = fixture();
  const r = depositCard({ media: 'image', kind: 'work', people: ['R.'], title: 'the yard, at first light', excerpt: { path: still } }, { root });
  const a = JSON.parse(lines(root)[0]).artifact;
  assert.deepEqual(a.detail.composition, [{
    t: 'image', src: `drop/assets/${r.id}.png`, name: 'crane.png', orig: `drop/assets/${r.id}.png`,
  }], 'the same bytes, shown whole and offered by name');
  assert.equal(a.detail.experience, undefined, 'a still summons nothing — there is nothing to play');
});

test('a card with no file at all stays closed (D11)', () => {
  const { root } = fixture();
  depositCard({ media: 'text', kind: 'work', people: ['R.'], title: 'chapter 7', excerpt: { text: 'the door was already open.' } }, { root });
  assert.equal(JSON.parse(lines(root)[0]).artifact.detail, undefined);
});

test('the strip is cut from the take, at the moments it claims (D117)', { skip: !ffmpeg() && 'no ffmpeg here' }, () => {
  const { root } = fixture();
  const take = join(root, 'three-colours.mp4');
  // three flat, unmistakable seconds: the strip must show red, then green, then blue
  execFileSync(ffmpeg(), ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:size=120x120:duration=1',
    '-f', 'lavfi', '-i', 'color=c=lime:size=120x120:duration=1',
    '-f', 'lavfi', '-i', 'color=c=blue:size=120x120:duration=1',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', take], { stdio: 'ignore' });

  const r = depositCard({ media: 'video', kind: 'work', people: ['R.'], title: 'three colours', excerpt: { path: take } }, { root });
  const strip = join(assetDirIn(root), `${r.id}.jpg`);
  // read the middle pixel of each third back out of the strip
  const raw = execFileSync(ffmpeg(), ['-v', 'error', '-i', strip, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const w = 960, h = raw.length / 3 / w;
  const at = (x) => { const i = (Math.floor(h / 2) * w + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
  const dominant = ([rr, gg, bb]) => (rr > gg && rr > bb ? 'red' : gg > bb ? 'green' : 'blue');
  assert.deepEqual([dominant(at(160)), dominant(at(480)), dominant(at(800))], ['red', 'green', 'blue'],
    'left third is 15% in, middle is halfway, right third is 85% — in order, from this take');
});

test('the back the person arranged is kept whole — the door only adds (D126)', () => {
  const { root, still } = fixture();
  const r = depositCard({
    media: 'image', kind: 'work', title: 'the kiln door', people: ['R.'],
    excerpt: { path: still },
    detail: { composition: [{ t: 'text', text: 'fired at nine hundred, held four hours.' }], note: 'a note the maker wrote' },
  }, { root });
  const d = JSON.parse(lines(root)[0]).artifact.detail;
  assert.equal(d.composition.length, 2, 'the still was added, not substituted');
  assert.equal(d.composition[0].t, 'image', 'the work stands first');
  assert.equal(d.composition[0].src, `drop/assets/${r.id}.png`);
  assert.deepEqual(d.composition[1], { t: 'text', text: 'fired at nine hundred, held four hours.' }, 'their words, untouched');
  assert.equal(d.note, 'a note the maker wrote');
});

test('a door the depositor chose is never overridden by the door\'s own (D72/D126)', () => {
  const { root } = fixture();
  const rec = join(root, 'kettle.m4a');
  copyFileSync(join(REPO, 'assets', 'Test.m4a'), rec);
  const r = depositCard({
    media: 'audio', kind: 'work', title: 'kettle drone', people: ['B.'],
    excerpt: { path: rec },
    detail: { experience: { mode: 'visit', src: 'https://example.test/the-piece' } },
  }, { root });
  const d = JSON.parse(lines(root)[0]).artifact.detail;
  assert.deepEqual(d.experience, { mode: 'visit', src: 'https://example.test/the-piece' }, 'theirs stands');
  // and the recording is still shelved beside it, for whoever wants the file
  assert.ok(existsSync(join(assetDirIn(root), `${r.id}-source.m4a`)));
});

test('a blank title is not a title — the log never carries whitespace (D128)', () => {
  const { root, still } = fixture();
  depositCard({ media: 'image', kind: 'work', title: '   ', people: ['R.'], excerpt: { path: still } }, { root });
  const a = JSON.parse(lines(root)[0]).artifact;
  assert.equal(a.title, undefined, 'dropped rather than stored');
  assert.equal(a.caption, 'R.', 'and the author still carries the front (D118)');
});
