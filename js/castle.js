// Dev-only crowd surface (D44, after ?specimens): the table at the density the
// castle actually reaches — twenty of twenty-five push, four nights, ~80 works, a
// quarter of them shared (D182). Loaded only behind ?castle, never linked.
//
// This exists because the old scatter passed every test at seventeen cards and
// collapsed at a hundred: 209 covered caption strips, no dark field left. The
// number is only visible on a surface this crowded, so the surface is kept — and
// eighty in twenty studios still crosses where the scatter died.
// Content is invented (D3) — the people are letters, most works stand-ins; but
// three studios now carry the keeper's own real work, photographed as any analog
// deposit would be: R. folds paper (a crane, crease patterns, a standing figure),
// P. paints in watercolour (a study and its paintings), and T. filmed a ridge —
// the one card on this surface that actually plays (D188).
//
// What each stand-in *is* matters too: a table drawn from a dozen cycled works
// reads as nothing to explore, and the whole point of a map of studios (D140) is
// that a pile is one person's four days. So every person here has a practice and
// a four-beat arc — a quest they arrive stuck on (night 1), then works, notes on
// Claude, the odd dead end — and picking a card up is worth doing: backs carry
// the maker's own words (a poem, a tally, a field note), and a thread runs from a
// quest to the work that answered it. The desk's own voice stays dry (the
// desk-voice skill); the *work* quoted on a back is the maker's, in the maker's
// register — which is the one place words on this table are allowed to sing.
// None of it is Claude's own art (BRIEF §3): the poems are the invented poets'.

import { coauthorship } from './affinity.js';
import { arrange } from './layout.js';

const PEOPLE = ['R.', 'B.', 'M.', 'E.', 'Y.', 'T.', 'L.', 'A.', 'S.', 'K.', 'N.', 'P.',
  'D.', 'G.', 'H.', 'I.', 'J.', 'C.', 'F.', 'O.', 'V.', 'W.', 'Z.', 'Q.', 'X.'];

// A beat is one card a person laid on one night, in shorthand kept tight so the
// arc reads down the page:
//   t title · c caption · m media · f excerpt form · x excerpt words · s excerpt src
//   k kind (default 'work'; night 1 is forced to 'quest') · C worked with Claude
//   d detail (the back) — { note } one dry line · { composition:[{t:'text',text}] }
//   the maker's own arrangement (poems keep their line breaks) · { experience }
//   a recording that plays where it lies (D147).
// beats[0..3] are nights 1..4. Night 1 is the intro round: the thing this person
// arrived stuck on. Titles and captions obey the voice; x on a work is a quote.
const A = 'assets/';
const PRACTICES = {
  'R.': { craft: 'origami', beats: [
    { t: 'the crane, still a square', m: 'image', f: 'crop', s: A + 'or0-q0.jpg' },
    { t: 'the crease pattern, for a book', c: 'one sheet · no cuts', m: 'image', f: 'crop', s: A + 'or0-w0-0.jpeg' },
    { t: 'off the square, standing', c: 'one sheet · flat, then not', m: 'image', f: 'crop', s: A + 'or1-w0.JPG', C: true,
      d: { note: 'the crease pattern is the whole design; the folding is only obedience.',
           composition: [{ t: 'image', src: A + 'or0-q1-0.jpeg', caption: 'the pattern behind it' }] } },
    { t: 'the book, folded shut', c: 'one sheet · a chapter in it', m: 'image', f: 'crop', s: A + 'or0-w0-1.jpeg',
      d: { composition: [{ t: 'image', src: A + 'or0-q1-1.jpeg', caption: 'the last collapse' }] } } ] },

  'B.': { craft: 'field recording', beats: [
    { t: 'the room tone of an empty room', m: 'note', f: 'words' },
    { t: 'the bell, before it cooled', c: 'bronze · still ringing', m: 'audio', f: 'waveform', s: A + 'castle-wave-bell.svg',
      d: { experience: { mode: 'play', src: A + 'audio-bell.m4a' } } },
    { t: 'room tone, castle kitchen', c: 'four minutes · nobody in it', m: 'audio', f: 'waveform', s: A + 'waveform-kettle.svg', C: true,
      d: { experience: { mode: 'play', src: A + 'audio-roomtone.m4a' } } },
    { t: 'the bell, tuned', c: 'take 3 · true at last', m: 'audio', f: 'waveform', s: A + 'castle-wave-bell.svg', C: true } ] },

  'M.': { craft: 'metal instruments', beats: [
    { t: 'an instrument with no note of its own', m: 'note', f: 'words' },
    { t: 'it tuned the string to a number, not to the room', c: 'in tune · dead', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the long string, bowed', c: 'one string · many rooms', m: 'image', f: 'crop', s: A + 'castle-crop-instrument.svg',
      d: { note: 'the room is the other half of the instrument. tune to the number and you lose it.' } },
    { t: 'the automaton, tuned', c: 'brass · it plays itself', m: 'model', f: 'render', s: A + 'castle-render-escape.svg', C: true } ] },

  'E.': { craft: 'novelist', beats: [
    { t: 'a chapter that will not turn', m: 'note', f: 'words' },
    { t: 'the sentence, cut', c: 'manuscript · kept out', m: 'text', f: 'sentence', x: 'She had been leaving the room for eleven years.',
      d: { composition: [{ t: 'text', text: 'cut from the book.\nit was the best line in it and it was doing nothing there.' }] } },
    { t: 'chapter 7, that turns now', c: 'third pass', m: 'text', f: 'sentence', x: 'The river had been rehearsing this bend for a thousand years.', C: true },
    { t: 'the novel, set in metal', c: 'hand-set · one page', m: 'text', f: 'sentence', x: 'In the beginning was the counter-punch.', C: true } ] },

  'Y.': { craft: 'weaving', beats: [
    { t: 'a cloth that remembers the loom', m: 'note', f: 'words' },
    { t: 'one wrong end, and I am keeping it', c: 'point twill · eight shafts', m: 'note', f: 'words' },
    { t: 'the loom keeps the tension you gave it yesterday', m: 'note', f: 'words' },
    { t: 'the cloth, off the loom', c: 'two metres · point twill', m: 'image', f: 'crop', s: A + 'castle-line-weave.svg' } ] },

  'T.': { craft: 'documentary camera', beats: [
    { t: 'the shot that is always one second late', m: 'note', f: 'words' },
    { t: 'the ridge, at dusk', c: 'two minutes · unbroken', m: 'video', f: 'frames', s: A + 'mountains-strip.jpg',
      d: { experience: { mode: 'play', src: A + 'mountains.mp4' } } },
    { t: 'it found the cut I had been looking for since Tuesday', c: 'frame 2140 · there all along', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the courtyard, in rain', c: 'two minutes · unbroken', m: 'video', f: 'frames', s: A + 'placeholder-frames.svg' } ] },

  'L.': { craft: 'glazes, ceramics', beats: [
    { t: 'a surface that records how it was touched', m: 'note', f: 'words' },
    { t: 'the kiln decides the last ten degrees; I only ask', c: 'ash · reduction', m: 'note', f: 'words' },
    { t: 'the touched surface, fired', c: 'fingerprints · vitrified', m: 'image', f: 'crop', s: A + 'castle-crop-kiln.svg', C: true,
      d: { composition: [{ t: 'text', text: 'V. pressed each one once.\nthe glaze kept the weight of it —\nheavier where she doubted.' }] } },
    { t: 'a bowl, off-centre on purpose', c: 'stoneware · it sits', m: 'image', f: 'crop', s: A + 'placeholder-photo.svg' } ] },

  'A.': { craft: 'tilings', beats: [
    { t: 'a tiling you can hear', m: 'note', f: 'words' },
    { t: 'the aperiodic patch', c: 'never repeats · proven', m: 'fold', f: 'linework', s: A + 'castle-line-tiling.svg', C: true,
      d: { note: 'no two neighbourhoods the same, all the way out. that is the whole of it.' } },
    { t: 'the tiling, rung', c: 'each tile a pitch', m: 'image', f: 'crop', s: A + 'castle-line-tiling.svg', C: true },
    { t: 'a floor, laid', c: 'terracotta · six shapes', m: 'image', f: 'crop', s: A + 'placeholder-photo.svg' } ] },

  'S.': { craft: 'lichen, old walls', beats: [
    { t: 'read the wall before it is gone', m: 'note', f: 'words' },
    { t: 'the north face, mapped', c: 'lichen · four centuries, maybe', m: 'image', f: 'crop', s: A + 'castle-crop-wall.svg',
      d: { note: 'each ring is a wet decade. the wall kept the record nobody else did.' } },
    { t: 'the north wall, read aloud', c: 'read aloud · once', m: 'image', f: 'crop', s: A + 'castle-crop-wall.svg', C: true,
      d: { composition: [{ t: 'text', text: 'this one grew in the wet years.\nthis one is the drought.\nnobody wrote it down at the time,\nso the wall did.' }] } },
    { t: 'the sample, under glass', c: 'scraped · catalogued', m: 'image', f: 'crop', s: A + 'castle-crop-wall.svg' } ] },

  'K.': { craft: 'poet', beats: [
    { t: 'a poem that will not end', m: 'note', f: 'words' },
    { t: 'the well', m: 'text', f: 'sentence', x: 'drop the stone. do not count.',
      d: { composition: [{ t: 'text', text: 'drop the stone.\ndo not count.\nthe sound comes back\nas a number you did not ask for.\nwrite it down anyway.' }] } },
    { t: 'asked for the worst line, got three compliments', c: 'three tries · an honest answer on the fourth', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the last line, found', c: 'kept', m: 'text', f: 'sentence', x: 'It ends the way a room does when the last one forgets to leave.', C: true } ] },

  'N.': { craft: 'bell founding', beats: [
    { t: 'a bell that rings true the first time', m: 'note', f: 'words' },
    { t: 'the mould, packed', c: 'loam · drying a week', m: 'image', f: 'crop', s: A + 'castle-crop-kiln.svg' },
    { t: 'the pour', c: 'bronze · eleven hundred degrees', m: 'image', f: 'crop', s: A + 'castle-crop-glass.svg' },
    { t: 'the bell, true', c: 'struck once · in tune', m: 'model', f: 'render', s: A + 'castle-render-bell.svg', C: true,
      d: { note: 'a hair thinner at the waist. it rang true on the first strike, which never happens.' } } ] },

  'P.': { craft: 'watercolour', beats: [
    { t: 'a tone that stays ugly', m: 'image', f: 'crop', s: A + 'wc-q0.JPG',
      d: { note: 'too much pigment, not enough water. the study is the argument with myself.' } },
    { t: 'the path, through birches', c: 'watercolour · one afternoon', m: 'image', f: 'crop', s: A + 'wc-w0.JPG',
      d: { composition: [{ t: 'image', src: A + 'wc-w3.JPG', caption: 'the same walk, later and looser' }] } },
    { t: 'it painted every leaf and lost the tree', c: 'four washes · muddy', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the oak, alone', c: 'watercolour · from the field', m: 'image', f: 'crop', s: A + 'wc-w1.JPG',
      d: { composition: [{ t: 'image', src: A + 'wc-w2.JPG', caption: 'and once more, in fuller leaf' }] } } ] },

  'D.': { craft: 'plotters, drivers', beats: [
    { t: 'a machine that draws like it is unsure', m: 'note', f: 'words' },
    { t: 'the pen, hesitating', c: 'ink · one pass', m: 'image', f: 'crop', s: A + 'castle-line-plot.svg', C: true },
    { t: 'it wrote the whole driver and none of the hesitation', c: 'one evening · working, and wrong', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the driver, with the tremor added back', c: 'running · slowly', m: 'code', f: 'lines', x: 'for (const p of path) {\n  move(p, speed * waver());\n}', C: true,
      d: { note: 'a line that never wavers is not a drawn line. the tremor is the work, not the bug.' } } ] },

  'G.': { craft: 'bookbinding', beats: [
    { t: 'a binding that opens flat and stays shut', m: 'note', f: 'words' },
    { t: 'the castle, to a pocket', c: 'one sheet · folds to a pocket', m: 'fold', f: 'linework', s: A + 'castle-line-star.svg' },
    { t: 'linen thread, five stations', c: 'sewn · it lies flat', m: 'note', f: 'words' },
    { t: 'the atlas, bound', c: 'case-bound · opens flat', m: 'image', f: 'crop', s: A + 'castle-line-star.svg', C: true,
      d: { note: 'a French fold did it — opens flat, falls shut. the quest, answered by a crease.' } } ] },

  'H.': { craft: 'bamboo structures', beats: [
    { t: 'a joint that bends and does not break', m: 'note', f: 'words' },
    { t: 'the stalk, listened to', c: 'wind · through split cane', m: 'audio', f: 'waveform', s: A + 'placeholder-waveform.svg',
      d: { experience: { mode: 'play', src: A + 'audio-cane.m4a' } } },
    { t: 'it solved the joint and forgot the wind', c: 'holds on paper · not in the field', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the lashing, tuned', c: 'cane · it gives and holds', m: 'image', f: 'crop', s: A + 'placeholder-photo.svg' } ] },

  'I.': { craft: 'swifts, counting', beats: [
    { t: 'count a thing that will not hold still', m: 'note', f: 'words' },
    { t: 'the count, four mornings', m: 'text', f: 'sentence', x: 'They leave before the bell and come back wrong.',
      d: { composition: [{ t: 'text', text: 'mon 41 · tue 44 · wed 39 · thu 44.\neither I cannot count, or four of them are new.' }] } },
    { t: 'the roost, at dusk', m: 'text', f: 'sentence', x: 'At dusk they pour back in as if the tower were breathing.' },
    { t: 'the wall, counted', c: 'growth rings · read as years', m: 'image', f: 'crop', s: A + 'castle-crop-wall.svg', C: true } ] },

  'J.': { craft: 'translation', beats: [
    { t: 'a word we do not have', m: 'note', f: 'words' },
    { t: 'a glossary of what is missing', m: 'text', f: 'sentence', x: 'There is no word here for the way a room agrees.',
      d: { composition: [{ t: 'text', text: 'no word for the way a room agrees.\nno word for the second time you hear a joke.\nno word for the hour before dinner when nobody starts anything.\nwe borrowed four and left the rest.' }] } },
    { t: 'it kept the pun I was about to throw away', c: 'one word · saved', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the line, carried across', c: 'third language', m: 'text', f: 'sentence', x: 'In the original it limps; I let it limp.', C: true } ] },

  'C.': { craft: 'puppet mechanisms', beats: [
    { t: 'a mechanism that looks like it is thinking', m: 'note', f: 'words' },
    { t: 'the hand, linkage', c: 'seven joints · one string', m: 'model', f: 'render', s: A + 'castle-render-escape.svg' },
    { t: 'the pause, built in', c: 'it waits · then moves', m: 'model', f: 'render', s: A + 'castle-render-escape.svg', C: true,
      d: { note: 'the hesitation is a cam, not a mind. everyone in the room read it as a mind.' } },
    { t: 'the puppet, breathing', c: 'three stills · it seems to wait', m: 'video', f: 'frames', s: A + 'placeholder-frames.svg' } ] },

  'F.': { craft: 'glass', beats: [
    { t: 'glass that holds a shadow', m: 'note', f: 'words' },
    { t: 'it modelled the anneal and cracked every one', c: 'four · all crazed', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'the shadow, in glass', c: 'cast · it keeps the dark', m: 'image', f: 'crop', s: A + 'castle-crop-glass.svg' },
    { t: 'a lens, ground by hand', c: 'crown glass · slow', m: 'image', f: 'crop', s: A + 'castle-crop-glass.svg' } ] },

  'O.': { craft: 'cartography', beats: [
    { t: 'a map of where the paths give out', m: 'note', f: 'words' },
    { t: 'the ridge, surveyed', c: 'contours · paced out', m: 'image', f: 'crop', s: A + 'castle-line-star.svg' },
    { t: 'the coastline, cut', c: 'engraved · in slate', m: 'image', f: 'crop', s: A + 'castle-line-star.svg', C: true,
      d: { note: 'where the road gives out the map should too. this one stops, honestly, at the scree.' } },
    { t: 'the map, folded wrong on purpose', c: 'one sheet · a route hidden in the fold', m: 'fold', f: 'linework', s: A + 'castle-line-star.svg' } ] },

  'V.': { craft: 'dance notation', beats: [
    { t: 'notate the weight, not the step', m: 'note', f: 'words' },
    { t: 'the fall, scored', m: 'text', f: 'sentence', x: 'The weight goes before the foot knows.',
      d: { composition: [{ t: 'text', text: 'down-and-through, then the foot.\nthe old notation writes the foot first,\nwhich is why it never looks danced.' }] } },
    { t: 'a gesture, in glass', c: 'one movement · held', m: 'image', f: 'crop', s: A + 'castle-crop-glass.svg' },
    { t: 'it notated the steps and lost the weight', c: 'complete · not danced', m: 'note', f: 'words', k: 'failure', C: true } ] },

  'W.': { craft: 'astronomy, instruments', beats: [
    { t: 'an instrument that measures its own error', m: 'note', f: 'words' },
    { t: 'the transit, logged', m: 'text', f: 'sentence', x: 'The star crossed the wire at 9:14, and then at nothing.',
      d: { composition: [{ t: 'text', text: 'first wire 9:14:02\nmiddle wire 9:14:31\nthird wire ——\nclouded before it could be wrong on its own.' }] } },
    { t: 'the sky, folded', c: 'one sheet · flat-foldable', m: 'fold', f: 'linework', s: A + 'castle-line-star.svg', C: true,
      d: { note: 'a star chart that folds to the pocket and opens back to the whole sky.' } },
    { t: 'caught the arithmetic I had had wrong since spring', c: 'one line · months', m: 'note', f: 'words', k: 'failure', C: true } ] },

  'Z.': { craft: 'fermentation', beats: [
    { t: 'keep a thing alive four days', m: 'note', f: 'words' },
    { t: 'day two, bubbling', c: 'wild yeast · a warm corner', m: 'image', f: 'crop', s: A + 'placeholder-photo.svg',
      d: { note: 'fed at eight and eight. it is louder than the kitchen by day two.' } },
    { t: 'it will not taste it', c: 'the one thing that mattered', m: 'note', f: 'words', k: 'failure', C: true },
    { t: 'day four, sour and right', c: 'kept · by the window', m: 'image', f: 'crop', s: A + 'placeholder-photo.svg',
      d: { note: 'alive on the fourth morning. the quest was only ever: do not kill it.' } } ] },

  'Q.': { craft: 'escapements', beats: [
    { t: 'an escapement you can hear think', m: 'note', f: 'words' },
    { t: 'the deadbeat, drawn', c: 'brass · no recoil', m: 'model', f: 'render', s: A + 'castle-render-escape.svg' },
    { t: 'the tick, uneven on purpose', c: 'running · by hand', m: 'code', f: 'lines', x: 'while (wound) {\n  tick();\n  wait(beat + drift());\n}', C: true,
      d: { note: 'a clock that ticks too evenly sounds dead. I put the drift back until you could hear it think.' } },
    { t: 'the movement, going', c: 'eight days · one wind', m: 'model', f: 'render', s: A + 'castle-render-escape.svg' } ] },

  'X.': { craft: 'punchcutting', beats: [
    { t: 'a letter that reads small', m: 'note', f: 'words' },
    { t: 'the star catalogue, cut', c: '6 point · a typeface for a sky', m: 'image', f: 'crop', s: A + 'castle-line-star.svg' },
    { t: 'the counter-punch', c: 'steel · struck cold', m: 'image', f: 'crop', s: A + 'placeholder-photo.svg',
      d: { note: 'the hole inside the letter is cut first, and it is the whole letter.' } },
    { t: 'the specimen, pulled', c: '6 to 72 point', m: 'text', f: 'sentence', x: 'The quick brown fox is a lie; set real words.' } ] },
};

// One deterministic walk. Who works, who they work with, and which night are all
// functions of the index — no clock, no randomness, so ?castle is the same table
// every time and a screenshot of it can be compared with another. What each
// person deposits is read from PRACTICES by their name and the night.
//
// Not everyone pushes to the desk (D182): five of the twenty-five attended
// without ever laying a card, so the table is twenty studios, not twenty-five —
// nearer what the room actually reaches once the eager and the sceptical sort
// themselves out. The five are chosen so every recurring collaboration, every
// surprise, and every poem stays; they take only their own solo work with them.
const SILENT = new Set(['D.', 'C.', 'Z.', 'Q.', 'X.']);
export const castleEvents = (() => {
  // The curator registers the cohort that engaged — the ones a card can land
  // under; the table opens as their named places rather than a void (D152).
  const deposits = [{ e: 'roster', night: 0, people: PEOPLE.filter((p) => !SILENT.has(p)) }];
  const idOf = new Map(); // `${who}:${night}` → card id, so threads can name ends
  let n = 0;
  for (let night = 1; night <= 4; night++) {
    for (let i = 0; i < 25; i++) {
      const who = PEOPLE[(night * 7 + i * 3) % PEOPLE.length];
      if (SILENT.has(who)) continue; // attended, but laid nothing on the desk
      // people keep working with whoever they clicked with, so a pairing recurs
      const also = PEOPLE[(PEOPLE.indexOf(who) * 7 + 3) % PEOPLE.length];
      const shared = i % 4 === 0 && also !== who && !SILENT.has(also);
      const beat = PRACTICES[who].beats[night - 1];
      const kind = night === 1 ? 'quest' : (beat.k ?? 'work');
      const people = [who, ...(shared ? [also] : []), ...(beat.C ? ['Claude'] : [])];
      const id = `c-${++n}`;
      idOf.set(`${who}:${night}`, id);
      // a model turns to its 3D on the back (D190): the front stays the chosen
      // render, and every model card is given the turntable unless the maker
      // already arranged its own back.
      const detail = beat.d ? { ...beat.d } : (beat.m === 'model' ? {} : null);
      if (detail && beat.m === 'model' && !detail.experience) {
        detail.experience = { mode: 'play', src: A + 'model-fold.obj' };
      }
      deposits.push({ e: 'deposit', night, artifact: {
        id, media: beat.m, kind,
        title: beat.t, ...(beat.c ? { caption: beat.c } : {}), people,
        // quests are the curator's night-one register; everything after enters
        // by the door the index picks — a mix of the terminal and the phone.
        provenance: night === 1 ? 'curator' : (i % 5 === 0 ? 'mcp' : 'hand'),
        visibility: 'public',
        // a note's words are its face; when none are given the title is the
        // words (as the quests are), so the face is not printed twice — once as
        // the trace, once as the title line above it.
        excerpt: beat.s
          ? { form: beat.f, src: beat.s }
          : { form: beat.f, text: beat.x ?? (beat.m === 'note' ? beat.t : undefined) },
        ...(detail ? { detail } : {}),
      } });
    }
  }
  // Claude's own field notes — the view from every studio at once, which is the
  // only thing Claude deposits under its own name (BRIEF §3).
  deposits.push({ e: 'deposit', night: 4, artifact: {
    id: 'c-fn-1', media: 'note', kind: 'fieldnotes', title: 'the fold and the drone are one problem',
    people: ['Claude'], provenance: 'mcp', visibility: 'public',
    excerpt: { form: 'words', text: 'the fold and the drone are one problem' } } });

  // Threads Claude proposes (D171): a quest to the work that answered it, and a
  // few works that turn out to be one problem across studios. Only anchors draw
  // at rest; these wait for a card to be picked up (D149), so they cost nothing
  // on the closed table and are the reward for reading one. Named by (who,night)
  // and resolved to ids, so a mistyped end is a crash here, not a silent miss.
  const T = (aw, an, bw, bn, why) => {
    const from = idOf.get(`${aw}:${an}`);
    const to = idOf.get(`${bw}:${bn}`);
    if (!from || !to) throw new Error(`castle thread names nobody: ${aw}:${an} → ${bw}:${bn}`);
    return { e: 'thread', night: Math.max(an, bn), from, to, why };
  };
  const threads = [
    // a quest, and the work that answered it
    T('R.', 1, 'R.', 3, 'off the square at last'),
    T('P.', 1, 'P.', 4, 'the tone, found in the end'),
    T('B.', 1, 'B.', 3, 'the quest, answered'),
    T('E.', 1, 'E.', 3, 'the chapter turns now'),
    T('K.', 1, 'K.', 4, 'the poem, ended'),
    T('N.', 1, 'N.', 4, 'true on the first strike'),
    T('I.', 1, 'I.', 2, 'the quest, answered'),
    T('G.', 1, 'G.', 4, 'opens flat and stays shut'),
    T('H.', 1, 'H.', 4, 'it gives and holds'),
    T('J.', 1, 'J.', 2, 'the quest, answered'),
    T('A.', 1, 'A.', 3, 'a tiling you can hear, heard'),
    T('O.', 1, 'O.', 3, 'the quest, answered'),
    T('L.', 1, 'L.', 3, 'the quest, answered'),
    T('F.', 1, 'F.', 3, 'the quest, answered'),
    // and a few that turn out to be one problem, across two studios
    T('R.', 3, 'B.', 3, 'both refuse to close'),
    T('W.', 3, 'O.', 4, 'the same fold, sky and ground'),
  ];

  // The arrangement, made the way a night's redraw makes it: affinity from the
  // log, geometry from the solver, and the result appended as an ordinary fact.
  // Every stack is placed in the one relaxation — a studio for each person, and
  // a place between the hands for each work they made together.
  //
  // The order the stacks are named in seeds the relaxation (layout.js `ring`), so
  // it must not depend on which cards happen to credit Claude — otherwise editing
  // the works would move everyone's studio. It is rebuilt from the walk's own
  // cadence — who, a shared partner, then Claude on the same beats the room has
  // always had one — so the map stays a pure function of the walk, identical
  // whatever the works turn out to say.
  const order = [];
  const seenNode = new Set();
  const pushNode = (k) => { if (k && !seenNode.has(k)) { seenNode.add(k); order.push(k); } };
  for (let night = 1; night <= 4; night++) {
    for (let i = 0; i < 25; i++) {
      const who = PEOPLE[(night * 7 + i * 3) % PEOPLE.length];
      if (SILENT.has(who)) continue;
      const also = PEOPLE[(PEOPLE.indexOf(who) * 7 + 3) % PEOPLE.length];
      pushNode(who);
      if (i % 4 === 0 && also !== who && !SILENT.has(also)) pushNode(also);
      if (i % 3 === 0) pushNode('Claude');
    }
  }
  const shared = new Map();
  for (const d of deposits) {
    if (d.e !== 'deposit') continue;
    const makers = [...new Set(d.artifact.people)].filter((name) => name !== 'Claude').sort();
    if (makers.length > 1) shared.set(makers.join(' + '), makers);
  }
  const places = arrange(
    [...order, ...[...shared].map(([key, of]) => ({ key, of }))],
    coauthorship(deposits),
  );
  return [...deposits, ...threads, { e: 'arrange', night: 4, places, why: 'who has been working with whom, four nights in' }];
})();
