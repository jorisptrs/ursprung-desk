// The live preview as pure ranges: EditorState runs in node without a DOM, so
// the widget/raw decision — rendered when the cursor is away, raw markdown
// under it (D96) — is machine truth here. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../vendor/codemirror.js';
import { buildPreview } from '../js/editor.js';
import { linkExcerpt } from '../js/deposit.js';

const host = { linkExcerpt, onTap() {}, enterLine() {}, removeLine() {}, dismissLine() {} };
const registry = new Map([['img1', { kind: 'image', name: 'a.png', front: { form: 'crop', src: 'data:x' } }]]);
const DOC = '# the kiln door\nwith @T.\n![the door](piece:img1)\nhttps://x.test/notes\ntail line';

function ranges(deco) {
  const out = [];
  deco.between(0, 1e9, (from, to, value) => { out.push({ from, to, block: value.spec }); });
  return out;
}

test('cursor away: embed lines render as widgets; title and mentions decorate (D96)', () => {
  const state = EditorState.create({ doc: DOC, selection: { anchor: 0 } });
  const deco = buildPreview(state, registry, null, host);
  const rs = ranges(deco);
  const replaces = rs.filter((r) => r.block.widget);
  assert.equal(replaces.length, 2, 'the piece line and the url line render as widgets');
  assert.ok(rs.some((r) => r.block.class === 'desk-title'), 'the first # line wears the title dress');
  assert.ok(rs.some((r) => r.block.class === 'desk-mention'), '@T. is marked');
});

test('cursor on an embed line dissolves exactly that widget — raw markdown under the pen', () => {
  const pieceLineStart = DOC.indexOf('![the door]');
  const state = EditorState.create({ doc: DOC, selection: { anchor: pieceLineStart + 3 } });
  const deco = buildPreview(state, registry, null, host);
  const replaces = ranges(deco).filter((r) => r.block.widget);
  assert.equal(replaces.length, 1, 'only the untouched url line stays rendered');
  assert.ok(replaces[0].from > pieceLineStart, 'the touched piece line shows its raw text');
});

test('unknown refs stay raw text; the front piece wears its rule', () => {
  const doc = '![x](piece:gone)\n![y](piece:img1)\n';
  const state = EditorState.create({ doc, selection: { anchor: doc.length } });
  const deco = buildPreview(state, registry, 'img1', host);
  const replaces = ranges(deco).filter((r) => r.block.widget);
  assert.equal(replaces.length, 1, 'a broken reference never renders as a piece');
  assert.equal(replaces[0].block.widget.spec.isFront, true, 'the fronting piece knows it');
});
