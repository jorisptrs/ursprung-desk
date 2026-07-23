// The room server's own rules, without the network (BRIEF §7 step 5). The hand
// door's refusals, the payloads that must land beside the log rather than
// inside it, and who the room lets write at all. Dev-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  depositHand, createDeskSink, planPayloads, blobExt, dataUrlParts, bytesToFile,
  dropFileIn, assetDirIn,
} from '../mcp/core.mjs';
import { whoIs, knownHosts, sameOrigin, decodeBlobs, peopleFileIn, readPeople, roster } from '../mcp/room.mjs';
import { signedPage, onlySignature, composeArtifact } from '../js/deposit.js';

const SEED = {
  events: [
    { e: 'deposit', night: 2, artifact: { id: 'a-001', media: 'note', kind: 'quest', title: 'a fold that will not close', people: ['R.'], provenance: 'curator', visibility: 'public', excerpt: { form: 'words', text: 'a fold that will not close' } } },
  ],
};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

function fixture({ people = { tok: { name: 'E.' } } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'desk-room-'));
  writeFileSync(join(root, 'seed.json'), JSON.stringify(SEED));
  mkdirSync(join(root, 'drop'), { recursive: true });
  writeFileSync(peopleFileIn(root), JSON.stringify(people));
  return { root };
}

const lines = (root) => {
  const f = dropFileIn(root);
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};
const words = (fn) => {
  try { fn(); } catch (err) { return err.message; }
  return null;
};

// what the sheet composes for "a photograph, and a line about it"
const sheetCard = () => ({
  media: 'image', kind: 'work', title: 'the fold, closed', people: ['R.'],
  excerpt: { form: 'crop', src: `data:image/png;base64,${PNG.toString('base64')}` },
  detail: { composition: [{ t: 'image', src: null, name: 'crane.png', caption: 'crane' }] },
});
const blob = (name = 'crane.png', type = 'image/png', bytes = PNG) => ({ name, type, bytes });

// ---- the hand door ----

test('a card from a phone lands as h-001, signed by its token, with nothing heavy in the line', () => {
  const { root } = fixture();
  const r = depositHand(sheetCard(), { 'piece:0': blob() }, { root, author: 'E.' });

  assert.equal(r.id, 'h-001', 'the hand door numbers its own (D19)');
  assert.equal(r.night, 2, 'the current highest night');
  assert.equal(lines(root).length, 1);

  const a = JSON.parse(lines(root)[0]).artifact;
  assert.equal(a.provenance, 'hand', 'the door names itself (D65)');
  assert.equal(a.visibility, 'public');
  assert.ok(!lines(root)[0].includes('data:'), 'no payload is ever written into the log (§9)');
  assert.match(a.excerpt.src, /^drop\/assets\/h-001-\d+\.png$/);
  assert.match(a.detail.composition[0].src, /^drop\/assets\/h-001-\d+\.png$/);
  assert.deepEqual(readFileSync(join(root, a.excerpt.src)), PNG, 'the bytes are on disk, deletable');
});

test('the token signs a card nobody named, and never overrules one they did', () => {
  const { root } = fixture();
  const bare = { ...sheetCard() };
  delete bare.people;
  const mine = depositHand(bare, {}, { root, author: 'E.' });
  assert.deepEqual(mine.event.artifact.people, ['E.']);
  assert.equal(mine.event.artifact.caption, 'E.', 'the author is on the front where no caption was written (D88)');

  const ours = depositHand({ ...sheetCard(), people: ['R.', 'Claude'] }, {}, { root, author: 'E.' });
  assert.deepEqual(ours.event.artifact.people, ['R.', 'Claude'], 'a stated list travels exactly as stated (D107)');
});

test('an unsigned card at a door that knows nobody is refused, never laid anonymously (D121)', () => {
  const { root } = fixture();
  const bare = { ...sheetCard() };
  delete bare.people;
  assert.match(words(() => depositHand(bare, {}, { root, author: null })), /needs an author/);
  assert.equal(lines(root).length, 0);
});

test('where a card sits in the log is not the client’s to choose', () => {
  const { root } = fixture();
  for (const owned of [{ id: 'h-999' }, { night: 9 }]) {
    const msg = words(() => depositHand({ ...sheetCard(), ...owned }, {}, { root, author: 'E.' }));
    assert.match(msg, /the desk sets/, `${Object.keys(owned)[0]} was not refused`);
  }
  assert.equal(lines(root).length, 0, 'nothing was written on the way to any refusal');
});

test('a claimed door is signed over, not argued with — the door knows which door it is', () => {
  const { root } = fixture();
  // the sheet composes provenance itself, because it IS the hand door; and a
  // client claiming to be the curator simply does not become one
  const r = depositHand({ ...sheetCard(), provenance: 'curator', visibility: 'room' }, {}, { root, author: 'E.' });
  assert.equal(r.event.artifact.provenance, 'hand');
  assert.equal(r.event.artifact.visibility, 'public');
  assert.equal(lines(root).length, 1, 'and the card was laid, not refused for saying something true');
});

test('a card the stream will not take leaves no asset behind', () => {
  const { root } = fixture();
  const broken = { ...sheetCard(), media: 'hologram' };
  assert.match(words(() => depositHand(broken, { 'piece:0': blob() }, { root, author: 'E.' })), /unknown media/);
  assert.equal(lines(root).length, 0);
  assert.equal(existsSync(assetDirIn(root)) ? readFileSync : true, true, 'no half-written deposit');
});

// ---- payloads beside the log, never inside it ----

test('one blob used twice becomes one file — a piece and the door that summons it', () => {
  const { root } = fixture();
  const shared = blob('drone.m4a', 'audio/mp4', Buffer.from('not really audio'));
  const artifact = {
    media: 'audio', kind: 'work', title: 'kettle drone', people: ['B.'],
    excerpt: { form: 'waveform', src: 'data:image/svg+xml;utf8,%3Csvg%2F%3E' },
    detail: {
      composition: [{ t: 'audio', src: 'data:image/svg+xml;utf8,%3Csvg%2F%3E', orig: null, name: 'drone.m4a' }],
      experience: { mode: 'play', src: null },
    },
  };
  const { event } = depositHand(artifact, { 'piece:0': shared, experience: shared }, { root, author: 'B.' });
  const d = event.artifact.detail;
  assert.equal(d.composition[0].orig, d.experience.src, 'the same bytes, one file');
  assert.match(d.experience.src, /\.m4a$/, "the depositor's own extension is kept");
});

test('blobExt prefers the filename, falls back to the declared type, then gives up bare', () => {
  assert.equal(blobExt({ name: 'crane.PNG', type: 'image/jpeg' }), '.png');
  assert.equal(blobExt({ name: 'noextension', type: 'image/jpeg' }), '.jpg');
  assert.equal(blobExt({ name: '', type: 'application/x-unknown' }), '');
  assert.equal(blobExt(null), '');
});

test('dataUrlParts reads base64 and plain, and hands back nothing it cannot read', () => {
  assert.equal(dataUrlParts('data:text/plain;base64,aGk=').bytes.toString(), 'hi');
  assert.equal(dataUrlParts('data:image/svg+xml;utf8,%3Csvg%2F%3E').bytes.toString(), '<svg/>');
  assert.equal(dataUrlParts('https://a.test/x.png'), null);
  assert.equal(dataUrlParts(null), null);
});

test('planPayloads writes nothing — it only says what would be written', () => {
  const { root } = fixture();
  const before = existsSync(assetDirIn(root));
  const { finished, writes } = planPayloads(sheetCard(), { 'piece:0': blob() }, 'h-007', root);
  assert.equal(writes.length, 2, 'the excerpt data URL and the piece');
  assert.match(finished.excerpt.src, /^drop\/assets\/h-007-/);
  assert.equal(existsSync(assetDirIn(root)), before, 'planning touched no disk');
});

// ---- an upload made local ----

test('bytes become a file under the depositor’s own name, then go away again', () => {
  const up = bytesToFile(PNG, 'the walk.png');
  assert.match(up.path, /the walk\.png$/, 'a refusal can still name the file they handed over');
  assert.deepEqual(readFileSync(up.path), PNG);
  up.dispose();
  assert.equal(existsSync(up.path), false, 'the copy was only ever a way in');
});

test('an uploaded name cannot climb out of its own directory', () => {
  const up = bytesToFile(PNG, '../../escaped.png');
  assert.match(up.path, /escaped\.png$/);
  assert.ok(!up.path.includes('..'), 'traversal is stripped, not honoured');
  up.dispose();
});

// ---- who the room lets write ----

test('a token is a person; anything else is nobody', () => {
  const { root } = fixture({ people: { tok: { name: 'E.' }, old: 'M.' } });
  assert.deepEqual(whoIs(root, 'tok'), { token: 'tok', name: 'E.' });
  assert.deepEqual(whoIs(root, 'old'), { token: 'old', name: 'M.' }, 'a bare name is still a name');
  assert.equal(whoIs(root, 'nope'), null);
  assert.equal(whoIs(root, ''), null);
  assert.equal(whoIs(root, undefined), null);
  assert.equal(whoIs(root, { name: 'E.' }), null, 'an object is not a token');
});

test('a registry that is missing or damaged means nobody, not everybody', () => {
  const root = mkdtempSync(join(tmpdir(), 'desk-room-'));
  assert.deepEqual(readPeople(root), {}, 'no file: nobody');
  mkdirSync(join(root, 'drop'), { recursive: true });
  writeFileSync(peopleFileIn(root), '{ not json');
  assert.deepEqual(readPeople(root), {}, 'damaged: still nobody');
  writeFileSync(peopleFileIn(root), '["E."]');
  assert.deepEqual(readPeople(root), {}, 'a list is not a registry');
});

test('the desk answers to its own name and its own addresses, and no other', () => {
  const hosts = knownHosts(8080);
  assert.ok(hosts.has('desk.local:8080'));
  assert.ok(hosts.has('localhost:8080'));
  assert.ok(!hosts.has('desk.example.com:8080'));
  assert.ok(!hosts.has('evil.test'));
});

test('a write from somewhere else is not a write from here', () => {
  const at = (headers) => sameOrigin({ headers });
  assert.equal(at({ host: 'desk.local:8080' }), true, 'a session sends no Origin, and carries a token instead');
  assert.equal(at({ host: 'desk.local:8080', origin: 'http://desk.local:8080' }), true);
  assert.equal(at({ host: 'desk.local:8080', origin: 'https://evil.test' }), false);
  assert.equal(at({ host: 'desk.local:8080', origin: 'null' }), false, 'a sandboxed frame is not the desk');
});

// ---- the page opens signed ----

test('a page opens with its own signature, and the signature alone is not a card', () => {
  assert.equal(signedPage('E.'), '\n\n@E.', 'the name sits at the foot, the pen waits above it');
  assert.equal(signedPage('  M.  '), '\n\n@M.');
  assert.equal(signedPage(null), '', 'a desk that cannot say who is holding the sheet opens it blank');
  assert.equal(signedPage('   '), '');

  assert.equal(onlySignature('\n\n@E.', 'E.'), true);
  assert.equal(onlySignature('@E.', 'E.'), true);
  assert.equal(onlySignature('# the zither\n\n@E.', 'E.'), false, 'a card with words is a card');
  assert.equal(onlySignature('\n\n@Y.', 'E.'), false, 'someone else’s name is a statement, not a default');
  assert.equal(onlySignature('', null), false);
});

test('the signature makes the card yours, and replacing it hands it over', () => {
  const { root } = fixture();
  // as the sheet composes it: the pre-filled name is just text, and mentions are people
  const mine = composeArtifact({ blocks: [{ id: 't1', t: 'text', text: 'the zither, restrung\n\n@E.' }] });
  assert.deepEqual(mine.artifact.people, ['E.']);

  // the depositor deletes their own name and writes another: the card is theirs
  const theirs = composeArtifact({ blocks: [{ id: 't1', t: 'text', text: 'the zither, restrung\n\n@Y.' }] });
  assert.deepEqual(theirs.artifact.people, ['Y.'], 'a deliberate edit, not a silence');

  // and both may stand — adding is just typing another
  const both = composeArtifact({ blocks: [{ id: 't1', t: 'text', text: 'the zither, restrung\n\n@E. @Y.' }] });
  assert.deepEqual(both.artifact.people, ['E.', 'Y.']);
  assert.equal(both.artifact.caption, 'E. + Y.', 'and the front says who, in order');

  const laid = depositHand({ ...both.artifact, title: 'the zither, restrung' }, {}, { root, author: 'E.' });
  assert.deepEqual(laid.event.artifact.people, ['E.', 'Y.']);
});

test('the roster is names, in order, and never a token', () => {
  const { root } = fixture({ people: { t1: { name: 'E.' }, t2: { name: 'M.' }, t3: 'B.', t4: { name: 'E.' } } });
  assert.deepEqual(roster(root), ['E.', 'M.', 'B.'], 'one entry per name, registration order');
  assert.equal(JSON.stringify(roster(root)).includes('t1'), false, 'the way in is not a fact about anyone');
  assert.deepEqual(roster(mkdtempSync(join(tmpdir(), 'empty-'))), []);
});

test('blobs over the wire are decoded, bounded, and never silently empty', () => {
  const packed = decodeBlobs({ 'piece:0': { name: 'crane.png', type: 'image/png', b64: PNG.toString('base64') } });
  assert.deepEqual(packed['piece:0'].bytes, PNG);
  assert.deepEqual(decodeBlobs(null), {});
  assert.deepEqual(decodeBlobs({ 'piece:0': 'not a blob' }), {}, 'a string is not a file');
  assert.match(words(() => decodeBlobs({ x: { name: 'e.png', b64: '' } })), /did not decode/);
});
