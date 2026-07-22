// Append rejections — the log refuses malformed truth. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStream } from '../js/stream.js';

function artifact(overrides = {}) {
  return {
    id: 'a-100',
    media: 'text',
    kind: 'work',
    title: 'a placeholder',
    practice: 'manuscript',
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

test('rejects a deposit without practice (D17)', () => {
  const s = createStream();
  assert.throws(() => s.append(deposit({ practice: undefined })), /practice/);
});

test('rejects retirement of an unknown artifact', () => {
  const s = createStream();
  assert.throws(() => s.append({ e: 'retire', night: 1, id: 'a-404' }), /unknown artifact/);
});

test('rejects unknown event types — no fourth kind of truth', () => {
  const s = createStream();
  assert.throws(() => s.append({ e: 'like', night: 1 }), /unknown event type/);
});
