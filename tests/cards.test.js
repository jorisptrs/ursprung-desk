// Corner geometry is presentation, but its determinism is machine-checkable;
// the back model is pure data. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cornerRadii, backModel } from '../js/cards.js';

test('corner radii are deterministic per id and distinct across ids (D24)', () => {
  assert.equal(cornerRadii('a-001'), cornerRadii('a-001'));
  assert.notEqual(cornerRadii('a-001'), cornerRadii('a-002'));
});

test('corner radii stay in the subtle range — hand-cut, never melted', () => {
  for (const id of ['a-001', 'a-002', 'a-003', 'live-001', 'x-99']) {
    const css = cornerRadii(id);
    const matches = css.match(/\d+\.\d+em/g);
    assert.equal(matches.length, 8, `expected 8 radii in "${css}"`);
    const values = matches.map(parseFloat);
    const horizontal = values.slice(0, 4);
    const vertical = values.slice(4);
    for (const r of horizontal) assert.ok(r >= 0.09 && r <= 0.56, `h radius ${r} out of range`);
    vertical.forEach((r, i) => {
      const ratio = r / horizontal[i];
      assert.ok(r >= 0.03 && r <= 0.56, `v radius ${r} out of range`);
      assert.ok(ratio >= 0.36 && ratio <= 2.6, `v/h lean ${ratio.toFixed(2)} out of range`);
    });
  }
});

test('backModel (D5/D74): doors, files, notes as pure data; empty ≡ absent', () => {
  const seed = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));
  const byId = new Map(seed.events.filter((e) => e.e === 'deposit').map((e) => [e.artifact.id, e.artifact]));

  const kettle = backModel(byId.get('a-007'));
  assert.equal(kettle.door.mode, 'play');
  assert.equal(kettle.door.src, 'assets/Test.m4a');

  assert.equal(backModel(byId.get('a-010')), null, 'the dish went backless with its footage withdrawn');
  const synthetic = backModel({
    title: 'x', media: 'video',
    detail: { experience: { mode: 'play', src: 'assets/full.mp4', demoSrc: 'assets/full-demo.mp4' } },
  });
  assert.equal(synthetic.door.demoSrc, 'assets/full-demo.mp4', 'the deployed link plays the derivative (D75)');

  const meta = backModel(byId.get('a-017'));
  assert.match(meta.note, /seeded demonstration/, 'the disclosure lives on the meta back (D70)');

  assert.equal(backModel(byId.get('a-014')), null, 'the backless card stays backless');
  assert.equal(backModel({ title: 'x', detail: {} }), null, 'empty detail ≡ absent (D5)');
});
