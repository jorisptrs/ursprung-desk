// The hand door's pure half: inference, link tiers, waveform drawing, the
// editor's composition → artifact, allocation, materialization, and the sinks
// against a real stream. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferMedia, inferWordsMedia, parseMentions, soleUrl, peaksToSvg, svgDataUrl,
  siteCardSvg, linkExcerpt, normalizeUrl, stripExt, slashTokenAt, refLineChange,
  classifyLine, parseDoc, composeDoc, migrateSheet, extractTitle, resolveFront,
  composeArtifact, validateArtifact, allocate, materialize, directSink, pageMeta,
  hasTitleLine, doorRefusal, deckSpread, withoutSignature,
} from '../js/deposit.js';
import { createStream } from '../js/stream.js';

const tb = (id, text) => ({ id, t: 'text', text });
const pb = (id, p) => ({ id, t: 'piece', p });
const imgPiece = (over = {}) => ({ kind: 'image', name: 'kiln.png', caption: 'kiln.png', blob: 'IMG', front: { form: 'crop', src: 'data:image/png;base64,x' }, ...over });
const audioPiece = (over = {}) => ({ kind: 'audio', name: 'drone.wav', caption: 'drone.wav', blob: 'AUD', front: { form: 'waveform', src: 'data:image/svg+xml;utf8,w' }, ...over });

test('inferMedia: MIME first, extension fallback, unknown → null (shelved)', () => {
  assert.equal(inferMedia('x.bin', 'image/heic'), 'image');
  assert.equal(inferMedia('take4.m4a', 'audio/mp4'), 'audio');
  assert.equal(inferMedia('walk.mov', 'video/quicktime'), 'video');
  assert.equal(inferMedia('crane.JPG', ''), 'image');
  assert.equal(inferMedia('drone.flac', ''), 'audio');
  assert.equal(inferMedia('dish.webm', ''), 'video');
  assert.equal(inferMedia('score.pdf', 'application/pdf'), null);
  assert.equal(inferMedia('', ''), null);
});

test('doorRefusal (D103): a typed door takes its own kind, and says so plainly', () => {
  assert.equal(doorRefusal('take4.m4a', 'audio/mp4', 'audio'), null, 'audio through the audio door');
  assert.equal(doorRefusal('walk.mov', 'video/quicktime', 'audio'),
    'walk.mov is not audio · / file shelves anything', 'a film is refused at the audio door — the bug he found');
  assert.equal(doorRefusal('crane.JPG', '', 'image'), null, 'extension alone is enough');
  assert.equal(doorRefusal('crane.JPG', '', 'video'), 'crane.JPG is not video · / file shelves anything');
  assert.equal(doorRefusal('score.pdf', 'application/pdf', 'image'), 'score.pdf is not image · / file shelves anything');
  assert.equal(doorRefusal('score.pdf', 'application/pdf', null), null, '/ file and every drop stay universal');
  assert.equal(doorRefusal('drone.wav', '', 'audio'), null);
});

test('inferWordsMedia: a line is manuscript; braces over lines are code', () => {
  assert.equal(inferWordsMedia('The river had been rehearsing this bend.'), 'text');
  assert.equal(inferWordsMedia('while (alive) {\n  listen();\n}'), 'code');
  assert.equal(inferWordsMedia('one line with (parens) only'), 'text', 'code needs more than one line');
});

test('parseMentions: @names read from the text as written, in order, deduped', () => {
  assert.deepEqual(parseMentions(['with @E. and @Claude', 'again @Claude, then @R.']), ['E.', 'Claude', 'R.']);
  assert.deepEqual(parseMentions('no one here'), []);
  assert.deepEqual(parseMentions('mail@example.com is not a person… but @Ana is'), ['example.com', 'Ana'], 'the parser is simple on purpose — the preview shows what it read');
});

test('soleUrl: a lone http(s) URL and nothing else', () => {
  assert.equal(soleUrl('https://x.test/a'), 'https://x.test/a');
  assert.equal(soleUrl('  https://x.test  '), 'https://x.test/');
  assert.equal(soleUrl('see https://x.test'), null);
  assert.equal(soleUrl('ftp://x.test'), null);
  assert.equal(soleUrl('plain words'), null);
});

test('peaksToSvg: fixed peaks → fixed drawing, clamped to the strip (D81)', () => {
  const svg = peaksToSvg([0, 0.25, 1, 0.5]);
  assert.equal(svg, peaksToSvg([0, 0.25, 1, 0.5]), 'deterministic');
  assert.match(svg, /stroke="#3a332a"/, 'the house waveform ink');
  assert.match(svg, /M18 97\.0 V103\.0/, 'silence keeps the quiet floor');
  assert.match(svg, /M46 44\.0 V156\.0/, 'full peak spans the strip');
  assert.equal(peaksToSvg([2]), peaksToSvg([1]), 'over-range clamps');
  assert.ok(svgDataUrl(svg).startsWith('data:image/svg+xml;utf8,'));
});

test('siteCardSvg: domain large, path small, markup-safe, clipped', () => {
  const svg = siteCardSvg('https://www.example.com/a&b/<c>?q="d"');
  assert.match(svg, />example\.com</, 'www falls away, domain stands large');
  assert.match(svg, /a&amp;b\/&lt;c&gt;\?q=&quot;d&quot;/, 'content is escaped, never markup');
  assert.match(siteCardSvg(`https://example.com/${'x'.repeat(80)}`), /…</, 'long paths clip with an ellipsis');
});

test('linkExcerpt tiers: direct image · YouTube thumbnail · typographic site-card (D82)', () => {
  const img = linkExcerpt('https://example.com/photo.jpg');
  assert.deepEqual(img, { media: 'image', excerpt: { form: 'crop', src: 'https://example.com/photo.jpg' } });
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
  ]) {
    const yt = linkExcerpt(url);
    assert.equal(yt.media, 'video', url);
    assert.deepEqual(yt.excerpt, { form: 'frames', src: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' });
  }
  const site = linkExcerpt('https://someone.dev/work/piece');
  assert.equal(site.media, 'image');
  assert.equal(site.excerpt.form, 'render');
  assert.ok(site.excerpt.src.startsWith('data:image/svg+xml'), 'drawn on-device, no third party asked');
  assert.equal(linkExcerpt('ftp://example.com/x'), null, 'http(s) only');
  assert.equal(linkExcerpt('not a url'), null);
});

test('resolveFront (D88/D90): title preferred, clicks override, one text + one piece', () => {
  const blocks = [tb('t1', 'first line'), pb('p1', imgPiece()), tb('t2', 'second line'), pb('p2', audioPiece())];
  let f = resolveFront({ title: 'T', blocks });
  assert.equal(f.textBlock, null, 'a title fronts the text slot when nothing is chosen');
  assert.equal(f.piece.id, 'p1', 'the first piece fronts by default');
  f = resolveFront({ title: 'T', blocks, frontTextId: 't2', frontPieceId: 'p2' });
  assert.equal(f.textBlock.id, 't2', 'clicking a text block moves the highlight');
  assert.equal(f.piece.id, 'p2');
  f = resolveFront({ title: '', blocks });
  assert.equal(f.textBlock.id, 't1', 'no title: any text serves');
  const dismissed = [pb('p1', { ...imgPiece(), kind: 'link', href: 'https://x.test/', dismissed: true })];
  assert.equal(resolveFront({ title: '', blocks: dismissed }).piece, null, 'a dismissed link cannot front the card');
});

test('normalizeUrl (D94): the link prompt forgives a missing scheme, prose stays prose', () => {
  assert.equal(normalizeUrl('someone.dev'), 'https://someone.dev/');
  assert.equal(normalizeUrl('someone.dev/the-work'), 'https://someone.dev/the-work');
  assert.equal(normalizeUrl('www.x.co/a?b=1'), 'https://www.x.co/a?b=1');
  assert.equal(normalizeUrl('https://x.test/a'), 'https://x.test/a', 'full addresses pass through');
  assert.equal(normalizeUrl('not a url'), null, 'spaces are prose');
  assert.equal(normalizeUrl('word'), null, 'no dot, no domain');
  assert.equal(normalizeUrl(''), null);
});

test('deckSpread (D114): alone grows in place; two to the sides; three to corners; rows after', () => {
  assert.deepEqual(deckSpread(1), [[0, 0]]);
  assert.deepEqual(deckSpread(2), [[-1, 0], [1, 0]]);
  assert.deepEqual(deckSpread(3), [[-1, -1], [1, -1], [0, 1]]);
  assert.deepEqual(deckSpread(4), [[-1, -1], [1, -1], [-1, 1], [1, 1]]);
  assert.deepEqual(deckSpread(5), [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]);
  assert.deepEqual(deckSpread(6), [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]);
  assert.equal(deckSpread(7).length, 7, 'a seventh card still has a place');
  assert.deepEqual(deckSpread(7)[6], [0, 1], 'the last row centers its lone card');
});

test("hasTitleLine (D99): any '# ' line — even a bare one being written — hides the title door", () => {
  assert.equal(hasTitleLine(''), false);
  assert.equal(hasTitleLine('plain text\nmore'), false);
  assert.equal(hasTitleLine('# t'), true);
  assert.equal(hasTitleLine('body\n# t'), true);
  assert.equal(hasTitleLine('# '), true, 'a title still being written counts');
  assert.equal(hasTitleLine('#x'), false, 'not a title line (D90)');
  assert.equal(hasTitleLine('## deep'), false);
});

test('stripExt (D94): captions lose the extension, never the name', () => {
  assert.equal(stripExt('kiln-door.png'), 'kiln-door');
  assert.equal(stripExt('take.4.m4a'), 'take.4');
  assert.equal(stripExt('noext'), 'noext');
  assert.equal(stripExt('.env'), '.env', 'a dotfile keeps itself');
});

test('pageMeta (D98): the page answers with its own picture and title, or quietly with nothing', () => {
  const og = '<html><head><meta property="og:image" content="https://x.test/cover.jpg"><meta property="og:title" content="the piece"></head></html>';
  assert.deepEqual(pageMeta(og, 'https://x.test/work'), { image: 'https://x.test/cover.jpg', title: 'the piece' });

  const reversed = '<meta content="/rel/cover.png" property="og:image"><title>fallback title</title>';
  assert.deepEqual(pageMeta(reversed, 'https://x.test/deep/page'), { image: 'https://x.test/rel/cover.png', title: 'fallback title' }, 'attribute order and relative images both resolve');

  const twitter = '<meta name="twitter:image" content="https://x.test/tw.jpg">';
  assert.equal(pageMeta(twitter, 'https://x.test/').image, 'https://x.test/tw.jpg');

  assert.deepEqual(pageMeta('<html><body>plain</body></html>', 'https://x.test/'), { image: null, title: null }, 'a silent page stays silent');
});

test("parseDoc with linkMeta (D98): the page's picture fronts the link and reaches the card", () => {
  const meta = new Map([['https://x.test/work', { status: 'done', image: 'https://x.test/cover.jpg', title: 'the piece' }]]);
  const { blocks } = parseDoc('https://x.test/work', new Map(), meta);
  assert.equal(blocks[0].p.media, 'image');
  assert.deepEqual(blocks[0].p.front, { form: 'crop', src: 'https://x.test/cover.jpg' });
  assert.equal(blocks[0].p.caption, 'the piece', 'the fetched title captions it when the line gives none');

  const { artifact } = composeDoc({ docText: '# the piece\nhttps://x.test/work', linkMeta: meta });
  assert.equal(artifact.excerpt.src, 'https://x.test/cover.jpg', 'the picture reaches the laid card, not just the editor');

  const bare = parseDoc('https://y.test/quiet', new Map(), new Map()).blocks[0];
  assert.equal(bare.p.front.form, 'render', 'no answer, the typographic still stands');
});

test("slashTokenAt (D90): '/' at a word start before the caret, and only there", () => {
  assert.deepEqual(slashTokenAt('/', 1), { start: 0, query: '' });
  assert.deepEqual(slashTokenAt('a line /im', 10), { start: 7, query: 'im' });
  assert.deepEqual(slashTokenAt('line one\n/link', 14), { start: 9, query: 'link' });
  assert.equal(slashTokenAt('https://x.test', 14), null, 'urls never trigger');
  assert.equal(slashTokenAt('and/or', 6), null, 'mid-word never triggers');
  assert.equal(slashTokenAt('3/4', 3), null);
  assert.deepEqual(slashTokenAt('a /img trailing', 6), { start: 2, query: 'img' }, 'only text before the caret counts');
});

test('refLineChange (D96): a reference lands alone on its line, cursor after it', () => {
  const apply = (text, pos, line) => {
    const c = refLineChange(text, pos, line);
    return { out: text.slice(0, c.from) + c.insert + text.slice(c.to), cursor: c.cursor };
  };
  assert.deepEqual(apply('', 0, 'REF'), { out: 'REF\n', cursor: 4 }, 'an empty page takes the line whole');
  assert.deepEqual(apply('ab', 2, 'REF'), { out: 'ab\nREF\n', cursor: 7 }, 'mid-doc gains its own line');
  assert.deepEqual(apply('ab\ncd', 2, 'REF').out, 'ab\nREF\ncd', 'no blank lines doubled before an existing break');
  assert.deepEqual(apply('ab\ncd', 3, 'REF').out, 'ab\nREF\ncd', 'at a line start it slots above');
  assert.equal(apply('abcd', 2, 'REF').out, 'ab\nREF\ncd', 'a split line closes around the reference');
});

test('classifyLine (D96): four line shapes, everything else is prose', () => {
  assert.deepEqual(classifyLine('![kiln](piece:a1b2)'), { t: 'piece', caption: 'kiln', ref: 'a1b2' });
  assert.deepEqual(classifyLine('![](piece:a1b2)'), { t: 'piece', caption: '', ref: 'a1b2' });
  assert.equal(classifyLine('see ![kiln](piece:a1b2)').t, 'text', 'whole-line only');
  assert.deepEqual(classifyLine('https://x.test/a'), { t: 'link', href: 'https://x.test/a' });
  assert.equal(classifyLine('see https://x.test').t, 'text');
  assert.equal(classifyLine('readme.md').t, 'text', 'a lone filename never embeds');
  assert.deepEqual(classifyLine('<https://x.test/a>'), { t: 'dismissed', href: 'https://x.test/a' });
  assert.deepEqual(classifyLine('[the notes](https://x.test/a)'), { t: 'link', href: 'https://x.test/a', caption: 'the notes' });
});

test('parseDoc (D96): the doc becomes the composition blocks, order held', () => {
  const pieces = new Map([['img1', { kind: 'image', name: 'kiln.png', blob: 'IMG', front: { form: 'crop', src: 'data:x' } }]]);
  const doc = '# the kiln door\nFired with @T.\n\nsecond paragraph\n![the door](piece:img1)\nhttps://x.test/notes\n<https://y.test/>\n![lost](piece:gone)';
  const { blocks, unknownRefs } = parseDoc(doc, pieces);
  assert.deepEqual(blocks.map((b) => b.t), ['text', 'text', 'piece', 'piece', 'piece']);
  assert.equal(blocks[0].text, '# the kiln door\nFired with @T.', 'single newlines join a paragraph');
  assert.equal(blocks[1].text, 'second paragraph', 'blank lines split paragraphs');
  assert.equal(blocks[2].id, 'img1', 'piece block id is the registry id');
  assert.equal(blocks[2].p.caption, 'the door', 'the line caption is the truth');
  assert.equal(blocks[3].p.kind, 'link');
  assert.equal(blocks[3].p.href, 'https://x.test/notes');
  assert.equal(blocks[4].p.dismissed, true);
  assert.deepEqual(unknownRefs, ['gone'], 'a broken reference never reaches a back, and is named');
});

test('composeDoc (D96): the whole page → the artifact, everything downstream untouched', () => {
  const pieces = new Map([['au1', { kind: 'audio', name: 'drone.wav', blob: 'AUD', front: { form: 'waveform', src: 'data:image/svg+xml;utf8,w' } }]]);
  const { artifact, blobs, blobKeys, unknownRefs } = composeDoc({
    docText: '# drone, phone take\nwith @B. and @Claude\n![take one](piece:au1)',
    pieces,
      });
  assert.equal(artifact.media, 'audio');
  assert.equal(artifact.title, 'drone, phone take');
  assert.equal(artifact.caption, undefined, 'the makers travel in people; the face writes them (D148)');
  assert.deepEqual(artifact.people, ['B.', 'Claude']);
  assert.deepEqual(artifact.detail.experience, { mode: 'play', src: null });
  assert.equal(blobs.experience, 'AUD');
  assert.equal(blobs[blobKeys.get('au1')], 'AUD', 'blob slots reachable through the piece id');
  assert.deepEqual(unknownRefs, []);
  assert.equal(validateArtifact(materialize(artifact, blobs, () => 'blob:probe')), null);
});

test('composeDoc: a lone written line stays a closed card; a title-only page is a quiet note', () => {
  const lone = composeDoc({ docText: 'The kiln holds at nine hundred.' }).artifact;
  assert.equal(lone.media, 'text');
  assert.equal(lone.detail, undefined, 'the back that is the front stays closed');
  const titled = composeDoc({ docText: '# rebuild the zither' }).artifact;
  assert.equal(titled.media, 'note');
  assert.equal(titled.excerpt.text, 'rebuild the zither');
});

test("extractTitle (D90): the first '# ' line is the title and leaves the body", () => {
  let r = extractTitle([tb('t1', '# the kiln door\nfired at nine hundred')]);
  assert.equal(r.title, 'the kiln door');
  assert.equal(r.blocks[0].text, 'fired at nine hundred');
  assert.equal(r.blocks[0].id, 't1', 'ids survive the strip');
  r = extractTitle([tb('t1', 'a line'), tb('t2', 'body\n# late title\nmore')]);
  assert.equal(r.title, 'late title', 'a heading after a newline counts');
  assert.equal(r.blocks[1].text, 'body\nmore');
  r = extractTitle([tb('t1', '# first'), tb('t2', '# second')]);
  assert.equal(r.title, 'first');
  assert.equal(r.blocks[1].text, '# second', 'later # lines stay literal text');
  assert.equal(extractTitle([tb('t1', '#not a title')]).title, '', 'needs the space');
  assert.equal(extractTitle([tb('t1', '## deeper')]).title, '', 'only one # is a title');
  assert.equal(extractTitle([tb('t1', '# ')]).title, '', 'a bare marker is not a title');
});

test('migrateSheet (D96): three tray generations collapse into the doc, blob keys verbatim', () => {
  const v1 = migrateSheet({
    title: 'old card', kind: 'quest', frontTextId: 'title',
    blocks: [
      tb('t1', 'body text @Y.'),
      pb('p1', { kind: 'image', name: 'a.png', caption: 'a cut', front: { form: 'crop', src: 'data:x' }, blobKey: 'piece:1' }),
      pb('p2', { kind: 'link', href: 'https://x.test/', caption: 'x.test' }),
      pb('p3', { kind: 'link', href: 'https://y.test/', dismissed: true }),
    ],
  });
  assert.equal(v1.v, 3);
  assert.deepEqual(v1.docText.split('\n\n'), ['# old card', 'body text @Y.', '![a cut](piece:p1)', 'https://x.test/', '<https://y.test/>']);
  assert.equal(v1.pieces.length, 1, 'links live in the text, not the registry');
  assert.equal(v1.pieces[0].blobKey, 'piece:1', 'blob keys copy verbatim — recomputing would orphan originals');
  assert.equal(v1.kind, 'quest');
  assert.deepEqual(migrateSheet(v1), v1, 'idempotent');
  // and the migrated page still composes into a valid artifact
  const pieces = new Map(v1.pieces.map((sp) => [sp.id, { kind: sp.kind, name: sp.name, front: sp.front, blob: 'IMG' }]));
  const { artifact, blobs } = composeDoc({ docText: v1.docText, pieces, kind: v1.kind });
  assert.equal(artifact.title, 'old card');
  assert.equal(validateArtifact(materialize(artifact, blobs, () => 'blob:probe')), null);
});

test('composeArtifact: a lone written line is a closed text card (D88)', () => {
  const { artifact, blobs } = composeArtifact({
        blocks: [tb('t1', 'The kiln holds at nine hundred. @R.')],
  });
  assert.equal(artifact.media, 'text');
  assert.equal(artifact.excerpt.text, 'The kiln holds at nine hundred. @R.');
  assert.equal(artifact.title, 'The kiln holds at nine hundred. @R.');
  assert.equal(artifact.detail, undefined, 'a back that is exactly the front adds nothing — the card stays closed');
  assert.deepEqual(blobs, {});
  assert.equal(validateArtifact(artifact), null);
});

test('composeArtifact: title alone is a quiet note card; a title-less piece borrows its caption', () => {
  const titled = composeArtifact({ blocks: [tb('t1', '# rebuild the zither')] }).artifact;
  assert.equal(titled.media, 'note');
  assert.equal(titled.excerpt.text, 'rebuild the zither');
  const borrowed = composeArtifact({ blocks: [pb('p1', imgPiece())] }).artifact;
  assert.equal(borrowed.title, 'kiln.png', 'the caption stands in so the schema holds');
});

test('composeArtifact: the editor is the back — order kept, blobs slotted, author on the front (D88)', () => {
  const { artifact, blobs, blobKeys } = composeArtifact({
        blocks: [
      tb('t0', '# the kiln door'),
      tb('t1', 'Fired with @T. and @Claude.'),
      pb('p1', imgPiece()),
      tb('t2', 'The glaze crawled on the shoulder.'),
      pb('p2', { kind: 'file', name: 'notes.pdf', blob: 'PDF' }),
    ],
  });
  assert.equal(artifact.media, 'image');
  assert.equal(artifact.title, 'the kiln door');
  assert.deepEqual(artifact.people, ['T.', 'Claude']);
  assert.equal(artifact.caption, undefined, 'the makers travel in people; the face writes them (D148)');
  assert.deepEqual(artifact.detail.composition.map((e) => e.t), ['text', 'image', 'text', 'file'], 'the arrangement holds');
  assert.equal(artifact.detail.composition[1].src, null, 'the back image is the original, riding as a blob');
  assert.equal(blobs['piece:1'], 'IMG');
  assert.equal(blobs['piece:3'], 'PDF');
  assert.equal(blobKeys.get('p1'), 'piece:1');
  assert.equal(validateArtifact(materialize(artifact, blobs, () => 'blob:probe')), null);
});

test('composeArtifact doors (D72): first audio/video plays, else the first link visits', () => {
  const av = composeArtifact({ blocks: [tb('t0', '# x'), pb('p1', audioPiece())] });
  assert.deepEqual(av.artifact.detail.experience, { mode: 'play', src: null });
  assert.equal(av.blobs.experience, 'AUD', 'the door plays the untouched original');
  assert.equal(av.artifact.detail.composition[0].orig, null, 'the original also shelves under the still');

  const link = composeArtifact({
        blocks: [tb('t0', '# x'), pb('p1', { kind: 'link', href: 'https://x.test/', media: 'image', front: { form: 'render', src: 'data:svg' }, caption: 'x.test' })],
  });
  assert.deepEqual(link.artifact.detail.experience, { mode: 'visit', src: 'https://x.test/' });
  assert.equal(link.artifact.detail.composition[0].embed, 'data:svg');

  const dismissed = composeArtifact({
        blocks: [tb('t0', '# x'), tb('t1', 'a line'), pb('p1', { kind: 'link', href: 'https://x.test/', media: 'image', front: { form: 'render', src: 'data:svg' }, dismissed: true })],
  });
  assert.equal(dismissed.artifact.detail.composition[1].embed, undefined, 'clicked away: the plain line stays, the embed goes');
  assert.equal(dismissed.artifact.detail.experience.mode, 'visit', 'the door still leads to the work');
});

test("composeArtifact: kind rides through — Claude's failure is stored as the failure register", () => {
  const { artifact } = composeArtifact({ kind: 'failure', blocks: [tb('t0', '# fugue, again'), tb('t1', 'no use @M.')] });
  assert.equal(artifact.kind, 'failure');
  const s = createStream();
  s.append({ e: 'deposit', night: 0, artifact: { ...artifact, id: 'h-001' } });
});

test('validateArtifact: the stream speaks the dry line; a sound artifact is quiet', () => {
  const good = composeArtifact({ blocks: [tb('t0', '# x'), tb('t1', 'y @E.')] }).artifact;
  assert.deepEqual(good.people, ['E.'], 'an @name is how a hand card says who made it (D118)');
  assert.match(validateArtifact({ ...good, people: undefined }), /a card needs an author/, 'anonymous is refused, in the sheet as anywhere');
  assert.equal(validateArtifact(good), null);
  // a card needs a title, a caption, OR a line — any one is enough (D116)
  assert.equal(validateArtifact({ ...good, title: '' }), null, 'its own line still carries it');
  assert.equal(validateArtifact({ ...good, title: '', caption: 'M. + Claude' }), null);
  assert.match(validateArtifact({ ...good, title: '', caption: undefined, excerpt: { form: 'words' } }),
    /a card needs a title, a caption, or a line of its own/, 'nothing readable at all is refused');
  assert.match(validateArtifact(composeArtifact({ blocks: [] }).artifact), /media/);
});

test('allocate: h-### rides the fork, night is the current highest (D19)', () => {
  assert.deepEqual(allocate([]), { id: 'h-001', night: 0 });
  const events = [
    { e: 'deposit', night: 2, artifact: { id: 'a-001' } },
    { e: 'thread', night: 4, from: 'a', to: 'b' },
    { e: 'deposit', night: 3, artifact: { id: 'h-007' } },
  ];
  assert.deepEqual(allocate(events), { id: 'h-008', night: 4 });
});

test('materialize: composition slots become URLs at the table, nothing else moves', () => {
  const { artifact, blobs } = composeArtifact({
        blocks: [tb('t0', '# the walk'), pb('p1', { kind: 'video', name: 'walk.mov', caption: 'walk', blob: 'VID', front: { form: 'frames', src: 'data:strip' } })],
  });
  const urls = [];
  const done = materialize(artifact, blobs, (b) => { urls.push(b); return `blob:${b}`; });
  assert.equal(done.detail.experience.src, 'blob:VID');
  assert.equal(done.detail.composition[0].orig, 'blob:VID');
  assert.equal(done.detail.composition[0].src, 'data:strip', 'the still stays inline');
  assert.equal(artifact.detail.experience.src, null, 'the bare artifact is never mutated');
  const legacy = materialize({ detail: { assets: [{ name: 'a.txt', src: null }] } }, { 'asset:0': 'A' }, (b) => `blob:${b}`);
  assert.deepEqual(legacy.detail.assets[0], { name: 'a.txt', src: 'blob:A' }, 'seed-era shelves stay materializable');
});

test('directSink: allocates, appends, and lets the stream refuse (D85)', () => {
  const s = createStream();
  s.append({ e: 'deposit', night: 3, artifact: {
    id: 'a-001', media: 'note', kind: 'quest', title: 'q', people: ['R.'],
    provenance: 'curator', visibility: 'public', excerpt: { form: 'words', text: 'q' },
  } });
  const sink = directSink(s);
  const bare = composeArtifact({ blocks: [tb('t0', '# x'), tb('t1', 'a line of it @E.')] }).artifact;
  sink.deposit(bare, {});
  sink.deposit({ ...bare, title: 'x2' }, {});
  const ids = s.all().filter((e) => e.e === 'deposit').map((e) => e.artifact.id);
  assert.deepEqual(ids, ['a-001', 'h-001', 'h-002'], 'each lay takes the next h-number');
  assert.equal(s.all().at(-1).night, 3, 'hand deposits join the current night');
  assert.throws(() => sink.deposit({ ...bare, title: '', caption: undefined, excerpt: { form: 'words' } }, {}),
    /a card needs a title, a caption, or a line of its own/, 'rejected, never coerced');
  assert.equal(s.all().length, 3, 'a refused deposit leaves no trace');
});

test('a signature is names, not prose — it is read and then it goes (D160)', () => {
  // the pre-filled name sits at the foot of the same block the writing is in
  // (D137), so stripping whole blocks would have left it standing
  assert.equal(withoutSignature('the zither, restrung\n\n@E.'), 'the zither, restrung');
  assert.equal(withoutSignature('@E. @Y.'), '', 'a page holding nothing but its signature says nothing');
  assert.equal(withoutSignature('@E.\nthe zither, restrung'), 'the zither, restrung', 'wherever it stands');
  // a name inside a sentence is part of the sentence and stays
  assert.equal(withoutSignature('the third course held tune, @Y. showed me the trick'),
    'the third course held tune, @Y. showed me the trick');
  assert.equal(withoutSignature(''), '');

  const { artifact } = composeArtifact({ blocks: [{ id: 't1', t: 'text', text: 'the zither, restrung\n\n@E. @Y.' }] });
  assert.deepEqual(artifact.people, ['E.', 'Y.'], 'the names were read before the line went');
  assert.equal(artifact.excerpt.text, 'the zither, restrung', 'and the face says them once, on its own line');
  assert.equal(artifact.caption, undefined);
});
