// Append rejections — the log refuses malformed truth. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStream, isPlace } from '../js/stream.js';

function artifact(overrides = {}) {
  return {
    id: 'a-100',
    media: 'text',
    kind: 'work',
    title: 'a placeholder',
        people: ['E.'],
    provenance: 'curator',
    visibility: 'public',
    excerpt: { form: 'sentence', text: 'one line' },
    ...overrides,
  };
}

const deposit = (overrides = {}, night = 1) => ({ e: 'deposit', night, artifact: artifact(overrides) });

test('rejects a thread referencing a not-yet-deposited artifact (D16)', () => {
  const s = createStream();
  s.append(deposit());
  assert.throws(
    () => s.append({ e: 'thread', night: 1, from: 'a-100', to: 'a-999', why: 'forward ref' }),
    /stream reject/,
  );
});

test('rejects unknown media', () => {
  const s = createStream();
  assert.throws(() => s.append(deposit({ media: 'hologram' })), /unknown media/);
});

test('rejects the retired door name — provenance names doors, and door 2 is hand (D65)', () => {
  const s = createStream();
  assert.throws(() => s.append(deposit({ provenance: 'photo' })), /unknown provenance/);
  s.append(deposit({ provenance: 'hand' }));
  assert.equal(s.all().length, 1);
});

test('experience (D72): play and visit accepted, demoSrc optional, malformed rejected', () => {
  const s = createStream();
  s.append(deposit({ id: 'x-1', detail: { experience: { mode: 'play', src: 'assets/a.m4a' } } }));
  s.append(deposit({ id: 'x-2', detail: { experience: { mode: 'play', src: 'assets/v.mp4', demoSrc: 'assets/v-demo.mp4' } } }));
  s.append(deposit({ id: 'x-3', detail: { experience: { mode: 'visit', src: 'https://example.org/work' } } }));
  assert.equal(s.all().length, 3);
  assert.throws(
    () => s.append(deposit({ id: 'x-4', detail: { experience: { mode: 'embed', src: 'x' } } })),
    /unknown experience mode/, // the table never embeds another app's UI
  );
  assert.throws(
    () => s.append(deposit({ id: 'x-5', detail: { experience: { mode: 'visit' } } })),
    /experience needs a src/,
  );
  assert.throws(
    () => s.append(deposit({ id: 'x-6', detail: { experience: { mode: 'play', src: 'a', demoSrc: '' } } })),
    /demoSrc/,
  );
});

test('rejects a deposit with no excerpt — the surface is not optional', () => {
  const s = createStream();
  assert.throws(() => s.append(deposit({ excerpt: undefined })), /excerpt/);
});

test('rejects an excerpt with an unknown form', () => {
  const s = createStream();
  assert.throws(() => s.append(deposit({ excerpt: { form: 'thumbnail' } })), /unknown excerpt form/);
});

test('accepts a withheld excerpt: form present, text and src absent (D6)', () => {
  const s = createStream();
  s.append(deposit({ excerpt: { form: 'sentence' } }));
  assert.equal(s.all().length, 1);
});

test('rejects a duplicate id', () => {
  const s = createStream();
  s.append(deposit());
  assert.throws(() => s.append(deposit()), /duplicate id/);
});

test('rejects retirement of an unknown artifact', () => {
  const s = createStream();
  assert.throws(() => s.append({ e: 'retire', night: 1, id: 'a-404' }), /unknown artifact/);
});

test('rejects unknown event types — no fourth kind of truth', () => {
  const s = createStream();
  assert.throws(() => s.append({ e: 'like', night: 1 }), /unknown event type/);
});

test('a door leads to a file or a page — never to a script (D127)', () => {
  const withDoor = (src, id) => ({
    e: 'deposit', night: 0,
    artifact: { ...artifact({ id }), detail: { experience: { mode: 'visit', src } } },
  });

  // the places a real door leads: a file the desk laid, a page, a materialized blob
  const places = ['assets/Test.m4a', 'drop/assets/m-001.mp4', 'https://a.test/x', 'http://a.test', 'blob:http://localhost/abc'];
  places.forEach((good, i) => {
    assert.doesNotThrow(() => createStream().append(withDoor(good, `p-${i}`)), `${good} is a place`);
  });

  // and the ones that are not destinations at all
  const notPlaces = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd'];
  notPlaces.forEach((bad, i) => {
    assert.throws(() => createStream().append(withDoor(bad, `b-${i}`)), /not to a script/, JSON.stringify(bad));
  });

  // demoSrc is a door too (D75: the deployed page plays that one)
  assert.throws(() => createStream().append({
    e: 'deposit', night: 0,
    artifact: { ...artifact(), detail: { experience: { mode: 'play', src: 'a.wav', demoSrc: 'javascript:alert(1)' } } },
  }), /not to a script/);
});

test('isPlace: control characters are stripped before the scheme is read (D127)', () => {
  // browsers ignore them inside a URL, so a naive regex is the only thing fooled
  assert.equal(isPlace('java\tscript:alert(1)'), false);
  assert.equal(isPlace('\tjavascript:alert(1)'), false);
  assert.equal(isPlace('//cdn.test/x'), true, 'protocol-relative is still the web');
  assert.equal(isPlace('assets/x.svg'), true);
  assert.equal(isPlace(''), false);
  assert.equal(isPlace(null), false);
});

test('blank is not filled: whitespace never stands in for a word (D128)', () => {
  const s = createStream();
  // a title of one space is not something a reader can read
  assert.throws(() => s.append({ e: 'deposit', night: 0, artifact: artifact({ title: '   ', caption: undefined, excerpt: { form: 'sentence' } }) }),
    /a card needs a title, a caption, or a line of its own/);
  // nor is an author of one space an author
  assert.throws(() => s.append({ e: 'deposit', night: 0, artifact: artifact({ people: ['  '] }) }), /people must be strings/);
});

test('a back is an object — an array is not one (D128)', () => {
  const s = createStream();
  assert.throws(() => s.append({ e: 'deposit', night: 0, artifact: artifact({ detail: [1, 2, 3] }) }), /detail must be an object/);
  assert.throws(() => s.append({ e: 'deposit', night: 0, artifact: artifact({ detail: null }) }), /detail must be an object/);
  assert.doesNotThrow(() => s.append({ e: 'deposit', night: 0, artifact: artifact({ detail: { note: 'a line' } }) }));
});

test('an arrangement is a set of places, and every place lies on the table', () => {
  const s = createStream();
  const arrange = (over = {}) => ({ e: 'arrange', night: 2, places: { 'E.': [0.3, 0.4] }, ...over });

  s.append(arrange());
  s.append(arrange({ places: { 'E.': [0, 0], 'M.': [1, 1], Claude: [0.5, 0.5] }, why: 'the fold and the drone are one problem' }));
  assert.equal(s.all().length, 2, 'the edges of the light are still on it');

  assert.throws(() => s.append(arrange({ places: undefined })), /a set of places/);
  assert.throws(() => s.append(arrange({ places: [] })), /a set of places/);
  assert.throws(() => s.append(arrange({ places: {} })), /nobody in it/);
  assert.throws(() => s.append(arrange({ places: { ' ': [0.1, 0.1] } })), /belongs to a name/);
  assert.throws(() => s.append(arrange({ places: { 'E.': [0.1] } })), /an x and a y/);
  assert.throws(() => s.append(arrange({ places: { 'E.': 0.1 } })), /an x and a y/);
  assert.throws(() => s.append(arrange({ places: { 'E.': [1.4, 0.2] } })), /off the table/);
  assert.throws(() => s.append(arrange({ places: { 'E.': [-0.1, 0.2] } })), /off the table/);
  assert.throws(() => s.append(arrange({ places: { 'E.': ['a', 'b'] } })), /off the table/);
  assert.throws(() => s.append(arrange({ why: '   ' })), /must say something/);
  assert.throws(() => s.append({ e: 'arrange', places: { 'E.': [0.1, 0.1] } }), /night must be/);
});

test('the roster: the cohort is a fact in the log, and it only ever adds', () => {
  const s = createStream();
  assert.ok(s.append({ e: 'roster', night: 0, people: ['R.', 'Joris Peters'] }));
  assert.throws(() => s.append({ e: 'roster', night: 0, people: [] }), /nobody in it/);
  assert.throws(() => s.append({ e: 'roster', night: 0, people: ['R.', '  '] }), /belongs to a name/);
  assert.throws(() => s.append({ e: 'roster', night: 0, people: 'R.' }), /nobody in it/);
});

test('the night is said, never worked out — and only ever moves forward (D175)', () => {
  const s = createStream();
  assert.ok(s.append({ e: 'night', night: 1 }));
  assert.throws(() => s.append({ e: 'night', night: 1 }), /already night 1/);
  assert.throws(() => s.append({ e: 'night', night: 0 }), /already night 1/);
  assert.ok(s.append({ e: 'night', night: 2 }), 'and a night may skip one, if a day passed unrecorded');

  // a deposit raises it too: the night is the log's, not one event type's
  const fresh = createStream();
  fresh.append({ e: 'deposit', night: 3, artifact: artifact({ id: 'x-1' }) });
  assert.throws(() => fresh.append({ e: 'night', night: 2 }), /already night 3/);
  assert.ok(fresh.append({ e: 'night', night: 4 }));

  // the first night to begin is 1: night 0 is where the log starts
  const opening = createStream();
  assert.throws(() => opening.append({ e: 'night', night: 0 }), /the first night to begin is night 1/);
});
