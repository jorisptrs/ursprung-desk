// The legibility floor (D43): no card's title/caption strip is ever covered by a
// newer card — checked on the real seed and on the crowded specimen field.
// Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStream } from '../js/stream.js';
import { fold, pastEnd, eventTime, cardRect, captionStrip } from '../js/fold.js';
import { specimenEvents } from '../js/specimens.js';

const seed = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));

function loaded(events) {
  const s = createStream();
  for (const ev of events) s.append(ev);
  return s.all();
}

const intersects = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

function captionViolations(state) {
  const out = [];
  const cards = state.cards; // stream order = z-order: later lies atop earlier
  for (let j = 1; j < cards.length; j++) {
    for (let i = 0; i < j; i++) {
      // the fieldnotes pile may cover its own older notes — that is the register (§9)
      if (cards[i].artifact.kind === 'fieldnotes' && cards[j].artifact.kind === 'fieldnotes') continue;
      if (intersects(cardRect(cards[j]), captionStrip(cards[i]))) out.push(`${cards[j].id} covers ${cards[i].id}`);
    }
  }
  return out;
}

test('legibility floor holds on the seed at every boundary, post-drift', () => {
  const events = loaded(seed.events);
  for (let k = 0; k < events.length; k++) {
    assert.deepEqual(captionViolations(fold(events, eventTime(k))), [], `violated at boundary ${k}`);
  }
});

test('legibility floor holds on the crowded specimen field at every boundary, post-drift', () => {
  const events = loaded(specimenEvents);
  for (let k = 0; k < events.length; k++) {
    assert.deepEqual(captionViolations(fold(events, eventTime(k))), [], `violated at boundary ${k}`);
  }
});

test('continuity bound holds on the crowded specimen field too', () => {
  const events = loaded(specimenEvents);
  let maxDelta = 0;
  for (let k = 1; k < events.length; k++) {
    const prev = new Map(fold(events, eventTime(k - 1)).cards.map((c) => [c.id, c]));
    for (const c of fold(events, eventTime(k)).cards) {
      const p = prev.get(c.id);
      if (!p) continue;
      maxDelta = Math.max(maxDelta, Math.abs(c.x - p.x), Math.abs(c.y - p.y));
    }
  }
  assert.ok(maxDelta < 0.03, `laid card moved ${maxDelta} between boundaries`);
});

test('specimens validate and cover every media, every kind, threads, both withheld fallbacks', () => {
  const events = loaded(specimenEvents);
  assert.ok(events.some((ev) => ev.e === 'thread'), 'missing thread specimen — the draw-on path needs one');
  const artifacts = events.filter((ev) => ev.e === 'deposit').map((ev) => ev.artifact);
  const media = new Set(artifacts.map((a) => a.media));
  const kinds = new Set(artifacts.map((a) => a.kind));
  for (const m of ['image', 'audio', 'video', 'text', 'code', 'fold', 'model', 'note']) {
    assert.ok(media.has(m), `missing media specimen: ${m}`);
  }
  for (const k of ['quest', 'work', 'failure', 'fieldnotes', 'meta']) {
    assert.ok(kinds.has(k), `missing kind specimen: ${k}`);
  }
  assert.ok(artifacts.some((a) => a.media === 'text' && !a.excerpt.text), 'missing withheld text specimen');
  assert.ok(artifacts.some((a) => a.media === 'code' && !a.excerpt.text), 'missing withheld code specimen');
  assert.ok(artifacts.some((a) => a.detail?.experience?.mode === 'play'), 'missing play-experience specimen (D72)');
  assert.ok(artifacts.some((a) => a.detail?.experience?.mode === 'visit'), 'missing visit-experience specimen (D72)');
});

test('specimen fold is deterministic too', () => {
  const events = loaded(specimenEvents);
  const t = pastEnd(events);
  assert.equal(JSON.stringify(fold(events, t)), JSON.stringify(fold(events, t)));
});
