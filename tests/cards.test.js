// Corner geometry is presentation, but its determinism is machine-checkable;
// the back model is pure data. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cornerRadii, backModel, makersLine, playable, playsAs } from '../js/cards.js';

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

test('the card says whose it is, in the room’s own grammar (D148)', () => {
  assert.equal(makersLine(['E.']), '@E.');
  assert.equal(makersLine(['E.', 'M.']), '@E. @M.');
  assert.equal(makersLine(['Joris Peters']), '@Joris Peters', 'a name may hold a space (D139)');
  // §3 made typographic: Claude in service is a credit, never an address
  assert.equal(makersLine(['E.', 'Claude']), '@E. + Claude');
  assert.equal(makersLine(['E.', 'M.', 'Claude']), '@E. @M. + Claude');
  assert.equal(makersLine(['Claude']), 'Claude', 'and Claude’s own work is Claude’s');
  assert.equal(makersLine([]), '');
  assert.equal(makersLine(['  ', 'E.']), '@E.', 'a blank is not a person');
  assert.equal(makersLine(undefined), '');
});

test('a recording is played, not fetched (D147)', () => {
  for (const src of ['assets/Test.m4a', 'a.mp3', 'a.WAV', 'x/y.ogg', 'take.mp4', 'take.mov', 'clip.webm']) {
    assert.ok(playable(src), `${src} plays`);
  }
  for (const src of ['notes.pdf', 'sheet.png', 'https://example.org/thing', 'x.m4a.zip', '', null]) {
    assert.ok(!playable(src), `${src} is a file, not a recording`);
  }
  assert.ok(playable('assets/Test.m4a?v=2'), 'a query does not stop it being a sound');
});

test('a hand-dropped recording has no extension to read — the arrangement says what it is', () => {
  // every hand deposit's original is a blob: URL (D88's materialize), so
  // deciding by address alone silently turned every phone recording into a
  // download line. Found by the two-device drive and by nothing else.
  assert.equal(playsAs('blob:http://localhost/uuid'), null, 'the address knows nothing');
  assert.equal(playsAs('blob:http://localhost/uuid', { kind: 'audio' }), 'audio');
  assert.equal(playsAs('blob:http://localhost/uuid', { kind: 'video' }), 'video');
  assert.equal(playsAs('blob:http://localhost/uuid', { name: 'kettle drone.m4a' }), 'audio',
    'and the name it was dropped under is the next best witness');
  assert.equal(playsAs('assets/Test.m4a', { kind: 'image' }), 'audio', 'a kind that is not a recording defers to the address');
  assert.equal(playsAs(null), null);
});
