// Dev-only crowd surface (D44, after ?specimens): the table at the density the
// castle actually reaches — twenty-five people, four nights, a hundred works, a
// quarter of them shared. Loaded only behind ?castle, never linked.
//
// This exists because the old scatter passed every test at seventeen cards and
// collapsed at a hundred: 209 covered caption strips, no dark field left. The
// number is only visible on a surface this crowded, so the surface is kept.
// Content is invented (D3) — the people are letters, the works are stand-ins.

import { coauthorship } from './affinity.js';
import { arrange } from './layout.js';

const PEOPLE = ['R.', 'B.', 'M.', 'E.', 'Y.', 'T.', 'L.', 'A.', 'S.', 'K.', 'N.', 'P.',
  'D.', 'G.', 'H.', 'I.', 'J.', 'C.', 'F.', 'O.', 'V.', 'W.', 'Z.', 'Q.', 'X.'];

// Titles and captions in the desk's own grammar: a noun phrase, often
// `thing, state`; captions are facts joined by ' · '.
const WORKS = [
  { media: 'note', title: 'the fold, reopened', caption: '22.5° · flat-foldable', form: 'words', text: 'the crease wants to be a curve' },
  { media: 'audio', title: 'kettle drone, take 4', caption: 'audio · four minutes', form: 'waveform', src: 'assets/placeholder-waveform.svg',
    detail: { note: 'the kettle is the only thing in the room that holds a pitch.', assets: ['assets/Test.m4a'] } },
  { media: 'image', title: 'the walk, at six', caption: 'one phone, six hands', form: 'crop', src: 'assets/placeholder-photo.svg',
    detail: { note: 'passed hand to hand along the ridge; nobody chose the frame.' } },
  { media: 'code', title: 'the 1993 system', caption: 'running · slowly', form: 'lines', text: 'while (alive) {\n  listen();\n  adapt();\n}' },
  { media: 'text', title: 'chapter 7, rewritten', caption: 'third pass', form: 'sentence', text: 'the room decided before anyone spoke.' },
  { media: 'fold', title: 'crease pattern', caption: 'paper · one sheet', form: 'linework', src: 'assets/placeholder-crease.svg',
    detail: { note: 'folded at 22.5°; it lies flat, then will not.', links: [{ href: 'https://example.org/crease', label: 'the pattern' }] } },
  { media: 'video', title: 'the hills, filmed', caption: 'three stills · day two', form: 'frames', src: 'assets/placeholder-frames.svg' },
  { media: 'note', title: 'the zither, drawn', caption: 'pencil · from memory', form: 'words', text: 'seventeen strings, none tuned' },
  { media: 'model', title: 'the joint, printed', caption: 'nylon · fits', form: 'render', src: 'assets/placeholder-render.svg' },
  { media: 'text', title: 'the piece, finished', caption: 'read aloud once', form: 'sentence', text: 'and then the light went out of it.' },
  { media: 'note', title: 'the drone and the fold', caption: 'one problem', form: 'words', text: 'both refuse to close' },
  { media: 'image', title: 'the courtyard, at four', caption: 'two stills · rain', form: 'crop', src: 'assets/placeholder-photo.svg' },
];
const FAILURES = [
  { media: 'note', title: 'fugue scoring — no use', caption: 'tried twice · stays up', form: 'words', text: 'the machine hears counterpoint as noise' },
  { media: 'note', title: 'the hinge — abandoned', caption: 'four attempts · brittle', form: 'words', text: 'nylon splits along the grain' },
];

// One deterministic walk. Who works, who they work with, and what they make are
// all functions of the index — no clock, no randomness, so ?castle is the same
// table every time and a screenshot of it can be compared with another.
export const castleEvents = (() => {
  const deposits = [];
  let n = 0;
  for (let night = 1; night <= 4; night++) {
    for (let i = 0; i < 25; i++) {
      const who = PEOPLE[(night * 7 + i * 3) % PEOPLE.length];
      // people keep working with whoever they clicked with, so a pairing recurs
      const also = PEOPLE[(PEOPLE.indexOf(who) * 7 + 3) % PEOPLE.length];
      const shared = i % 4 === 0 && also !== who;
      const withClaude = i % 3 === 0;
      const failed = n % 17 === 5;
      const w = failed ? FAILURES[n % FAILURES.length] : WORKS[(n * 5 + night) % WORKS.length];
      const people = [who, ...(shared ? [also] : []), ...(withClaude ? ['Claude'] : [])];
      deposits.push({ e: 'deposit', night, artifact: {
        id: `c-${++n}`, media: w.media, kind: failed ? 'failure' : 'work',
        title: w.title, caption: w.caption, people,
        provenance: i % 5 === 0 ? 'mcp' : 'hand', visibility: 'public',
        excerpt: w.src ? { form: w.form, src: w.src } : { form: w.form, text: w.text },
        ...(w.detail ? { detail: w.detail } : {}),
      } });
    }
  }
  // Claude's own field notes — the view from every studio at once, which is the
  // only thing Claude deposits under its own name (BRIEF §3).
  deposits.push({ e: 'deposit', night: 4, artifact: {
    id: 'c-fn-1', media: 'note', kind: 'fieldnotes', title: 'the fold and the drone are one problem',
    people: ['Claude'], provenance: 'mcp', visibility: 'public',
    excerpt: { form: 'words', text: 'the fold and the drone are one problem' } } });

  // The arrangement, made the way a night's redraw makes it: affinity from the
  // log, geometry from the solver, and the result appended as an ordinary fact.
  // Every stack is placed in the one relaxation — a studio for each person, and
  // a place between the hands for each work they made together.
  const shared = new Map();
  for (const d of deposits) {
    const makers = [...new Set(d.artifact.people)].filter((n) => n !== 'Claude').sort();
    if (makers.length > 1) shared.set(makers.join(' + '), makers);
  }
  const places = arrange(
    [
      ...new Set(deposits.flatMap((d) => d.artifact.people)),
      ...[...shared].map(([key, of]) => ({ key, of })),
    ],
    coauthorship(deposits),
  );
  return [...deposits, { e: 'arrange', night: 4, places, why: 'who has been working with whom, four nights in' }];
})();
