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

test('backModel (D180): every card opens — its front, its makers, its detail', () => {
  const seed = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));
  const byId = new Map(seed.events.filter((e) => e.e === 'deposit').map((e) => [e.artifact.id, e.artifact]));

  // a recording: the door plays it, the waveform is the one front not repeated
  // (§5), and the makers ride along on the back too
  const kettle = backModel(byId.get('a-007'));
  assert.equal(kettle.door.mode, 'play');
  assert.equal(kettle.door.src, 'assets/audio-drone.m4a');
  assert.equal(kettle.front, null, 'a waveform is a drawing of the sound the player holds');
  assert.deepEqual(kettle.people, ['B.', 'Claude']);

  const synthetic = backModel({
    title: 'x', media: 'video', people: ['E.'],
    detail: { experience: { mode: 'play', src: 'assets/full.mp4', demoSrc: 'assets/full-demo.mp4' } },
  });
  assert.equal(synthetic.door.demoSrc, 'assets/full-demo.mp4', 'the deployed link plays the derivative (D75)');

  const meta = backModel(byId.get('a-017'));
  assert.match(meta.note, /seeded demonstration/, 'the disclosure lives on the meta back (D70)');
  assert.equal(meta.front.t, 'words', 'and the note carries its own words');

  // a photograph with no detail still opens: the image IS the front, nothing else,
  // and it names who made it
  const bare = backModel(byId.get('a-014'));
  assert.deepEqual(bare.front, { t: 'image', src: 'assets/placeholder-photo.svg' });
  assert.deepEqual([bare.composition, bare.files, bare.links, bare.note, bare.door], [[], [], [], null, null]);
  assert.deepEqual(bare.people, ['R.'], 'nothing that was not on the front, and the makers');

  // a card is never refused a back — even an empty detail opens, to its face and name
  const spare = backModel({ media: 'note', title: 'x', people: ['Q.'], excerpt: { form: 'words', text: 'x' }, detail: {} });
  assert.ok(spare, 'no card stays shut (D180 retires D5/D11)');
  assert.deepEqual(spare.people, ['Q.']);
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

test('the front carried onto the back (D177): every real surface, never the waveform', () => {
  const card = (over) => ({ media: 'note', kind: 'work', title: 'x', people: ['E.'], excerpt: { form: 'words', text: 'x' }, ...over });
  const front = (over) => backModel(card(over)).front;
  // a photograph, a drawing, a rendering: the image is the head of the back
  assert.deepEqual(front({ media: 'image', excerpt: { form: 'crop', src: 'a.png' } }), { t: 'image', src: 'a.png' });
  assert.deepEqual(front({ media: 'fold', excerpt: { form: 'linework', src: 'a.svg' } }), { t: 'image', src: 'a.svg' });
  assert.deepEqual(front({ media: 'video', excerpt: { form: 'frames', src: 'a.svg' } }), { t: 'image', src: 'a.svg' });
  // code keeps its own hand; a note's words their own; prose is text
  assert.equal(front({ media: 'code', excerpt: { form: 'lines', text: 'x()' } }).t, 'code');
  assert.equal(front({ media: 'note', excerpt: { form: 'words', text: 'a fold that will not close' } }).t, 'words');
  assert.equal(front({ media: 'text', excerpt: { form: 'sentence', text: 'a line' } }).t, 'text');
  // a waveform is the one src the back does not repeat (§5)
  assert.equal(front({ media: 'audio', excerpt: { form: 'waveform', src: 'a.svg' } }), null);
  // withheld is legal: no surface to carry
  assert.equal(front({ media: 'image', excerpt: { form: 'crop' } }), null);
  // and a line a maker's own composition already carries is not said twice
  const dup = backModel(card({ media: 'text', excerpt: { form: 'sentence', text: 'drop the stone' },
    detail: { composition: [{ t: 'text', text: 'drop the stone.\ndo not count.' }] } }));
  assert.equal(dup.front, null, 'the composition already opens with it');
  // an image front stays the head of the back even when the maker set more stills
  // beneath it — the picture you tapped is never lost on the turn (a-012, the
  // watercolour with three studies behind it)
  const gallery = backModel(card({ media: 'image', excerpt: { form: 'crop', src: 'w0.jpg' },
    detail: { composition: [{ t: 'image', src: 'w1.jpg' }, { t: 'image', src: 'w2.jpg' }] } }));
  assert.deepEqual(gallery.front, { t: 'image', src: 'w0.jpg' }, 'the front photo leads, the others follow');
  // shown once: a front the arrangement already holds is not repeated
  const echoed = backModel(card({ media: 'image', excerpt: { form: 'crop', src: 'w0.jpg' },
    detail: { composition: [{ t: 'image', src: 'w0.jpg' }, { t: 'image', src: 'w1.jpg' }] } }));
  assert.equal(echoed.front, null, 'the composition already carries that still');
});

test('a model turns to its 3D on the back (D190): the render is a poster, not carried above it', () => {
  // with a model to turn, the flat render is not repeated — the 3D is the back
  const m = backModel({ media: 'model', kind: 'work', title: 'the zither', people: ['Y.'],
    excerpt: { form: 'render', src: 'assets/r.svg' },
    detail: { experience: { mode: 'play', src: 'assets/fold.obj' } } });
  assert.equal(m.front, null, 'the flat render is suppressed — the turning model is the surface');
  assert.equal(m.poster, 'assets/r.svg', 'the render rides as the poster, shown until the viewer draws');
  assert.equal(m.door.mode, 'play');
  assert.equal(m.media, 'model');

  // with no model attached there is nothing fuller — the render carries as before
  const still = backModel({ media: 'model', kind: 'work', title: 'x', people: ['Y.'],
    excerpt: { form: 'render', src: 'assets/r.svg' } });
  assert.deepEqual(still.front, { t: 'image', src: 'assets/r.svg' }, 'no 3D: the render is the head of the back');
  assert.equal(still.poster, 'assets/r.svg');

  // the same rule already holds for a playable take: the frames are its poster, not carried (D177/D190)
  const vid = backModel({ media: 'video', kind: 'work', title: 'v', people: ['T.'],
    excerpt: { form: 'frames', src: 'a.svg' },
    detail: { experience: { mode: 'play', src: 'assets/take.mp4' } } });
  assert.equal(vid.front, null, 'the take plays; its frames are not carried above the player');

  // a note, an image — never a model — carries no poster
  assert.equal(backModel({ media: 'image', kind: 'work', title: 'i', people: ['E.'], excerpt: { form: 'crop', src: 'a.png' } }).poster, null);
});

test('the generated model asset is a well-formed mesh (D190)', () => {
  const obj = readFileSync(new URL('../assets/model-fold.obj', import.meta.url), 'utf8');
  const vs = [...obj.matchAll(/^v .+$/gm)];
  const fs = [...obj.matchAll(/^f .+$/gm)];
  assert.ok(vs.length >= 3, 'the model has vertices');
  assert.ok(fs.length >= 1, 'the model has faces');
  for (const f of fs) {
    for (const tok of f[0].slice(2).trim().split(/\s+/)) {
      const i = parseInt(tok.split('/')[0], 10);
      assert.ok(i >= 1 && i <= vs.length, `every face index is a real vertex (${i} of ${vs.length})`);
    }
  }
});
