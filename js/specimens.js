// Dev-only specimen stream (D44): one card of every media, every kind register,
// and every withheld fallback, on one field. Loaded only behind ?specimens —
// never linked. Later: the palette surface for projection calibration.
// Content is invented placeholder (D3); captions reuse BRIEF-approved phrasings.

export const specimenEvents = [
  { e: 'deposit', night: 0, artifact: {
    id: 's-010', media: 'note', kind: 'quest', title: 'a fold that will not close',
    people: ['R.'], practice: 'origami', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'words', text: 'a fold that will not close' } } },

  { e: 'deposit', night: 1, artifact: {
    id: 's-001', media: 'image', kind: 'work', title: 'jazz coding, resumed',
    caption: 'one phone, six hands · the walk', people: ['M.', 'L.', 'T.'],
    practice: 'code', provenance: 'hand', visibility: 'public',
    excerpt: { form: 'crop', src: 'assets/placeholder-photo.svg' } } },

  { e: 'deposit', night: 2, artifact: {
    id: 's-002', media: 'audio', kind: 'work', title: 'kettle drone, take 4',
    caption: 'audio · B. + Claude', people: ['B.', 'Claude'],
    practice: 'music', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'waveform', src: 'assets/placeholder-waveform.svg' },
    detail: { experience: { mode: 'play', src: 'assets/Test.m4a' } } } },

  { e: 'deposit', night: 2, artifact: {
    id: 's-003', media: 'video', kind: 'work', title: 'the walk, filmed',
    caption: 'three stills · the hills', people: ['T.'],
    practice: 'film', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'frames', src: 'assets/placeholder-frames.svg' } } },

  { e: 'deposit', night: 2, artifact: {
    id: 's-006', media: 'code', kind: 'work', title: 'the 1993 system',
    caption: 'running · M. + Claude', people: ['M.', 'Claude'],
    practice: 'code', provenance: 'mcp', visibility: 'public',
    excerpt: { form: 'lines', text: 'while (alive) {\n  listen();\n  adapt();\n}' } } },

  { e: 'deposit', night: 2, artifact: {
    id: 's-008', media: 'fold', kind: 'work', title: 'crease pattern',
    caption: '22.5° · flat-foldable', people: ['R.'],
    practice: 'origami', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'linework', src: 'assets/placeholder-crease.svg' } } },

  { e: 'deposit', night: 2, artifact: {
    id: 's-012', media: 'note', kind: 'failure', title: 'fugue scoring — no use',
    caption: 'tried twice · stays up', people: ['B.', 'Claude'],
    practice: 'music', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'words', text: 'fugue scoring — no use' } } },

  // a mid-stream thread: the draw-on path and the floor tests both cross it
  { e: 'thread', night: 2, from: 's-002', to: 's-012', why: 'same makers' },

  { e: 'deposit', night: 3, artifact: {
    id: 's-004', media: 'text', kind: 'work', title: 'chapter 7, rewritten',
    caption: 'manuscript · E. + Claude', people: ['E.', 'Claude'],
    practice: 'manuscript', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'sentence', text: 'The river had been rehearsing this bend for a thousand years.' } } },

  { e: 'deposit', night: 3, artifact: {
    id: 's-005', media: 'text', kind: 'work', title: 'a chapter that resists',
    people: ['E.'], practice: 'manuscript', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'sentence' } } },

  { e: 'deposit', night: 3, artifact: {
    id: 's-009', media: 'model', kind: 'work', title: 'the zither, drawn',
    caption: 'wireframe · Y. + Claude', people: ['Y.', 'Claude'],
    practice: 'instruments', provenance: 'mcp', visibility: 'public',
    excerpt: { form: 'render', src: 'assets/placeholder-render.svg' },
    detail: { experience: { mode: 'visit', src: 'https://example.org/zither' } } } },

  { e: 'deposit', night: 3, artifact: {
    id: 's-011', media: 'note', kind: 'fieldnotes', title: 'the fold and the drone are one problem',
    people: ['Claude'], practice: 'cartography', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'words', text: 'the fold and the drone are one problem' } } },

  { e: 'deposit', night: 4, artifact: {
    id: 's-007', media: 'code', kind: 'work', title: 'the solver, withheld',
    people: ['M.'], practice: 'code', provenance: 'mcp', visibility: 'public',
    excerpt: { form: 'lines' } } },

  { e: 'deposit', night: 4, artifact: {
    id: 's-013', media: 'note', kind: 'meta', title: 'the desk, v0',
    caption: 'J. + Claude · Berlin, July', people: ['J.', 'Claude'],
    practice: 'cartography', provenance: 'curator', visibility: 'public',
    excerpt: { form: 'words', text: 'the desk, v0' } } },

  // a cross-night thread: opacity must sink with its dimmer end (D14)
  { e: 'thread', night: 4, from: 's-006', to: 's-007', why: 'same maker' },
];
