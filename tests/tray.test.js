// The tray against an in-memory backend: the interface is what the castle's
// LAN store must honor — staging survives, commit is the one consent, and a
// refusing sink keeps the entry staged. Dev-only; nothing here ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTray } from '../js/tray.js';

function memoryBackend() {
  const entries = new Map();
  let token = null;
  return {
    loadToken: () => token,
    saveToken: (t) => { token = t; },
    loadEntries: () => [...entries.values()],
    saveEntry: (e) => { entries.set(e.id, e); },
    deleteEntry: (id) => { entries.delete(id); },
  };
}

const art = (title) => ({ media: 'text', kind: 'work', title, practice: 'writing', people: ['E.'], provenance: 'hand', visibility: 'public', excerpt: { form: 'sentence', text: 'y' } });

test('token: minted once, then possession is identity', async () => {
  const backend = memoryBackend();
  const t1 = await createTray(backend).token();
  const t2 = await createTray(backend).token();
  assert.ok(t1.length >= 8);
  assert.equal(t1, t2, 'the same tray answers to the same token');
  assert.notEqual(await createTray(memoryBackend()).token(), t1, 'a fresh browser mints its own');
});

test('stage, list, update, unstage — and staging survives a new session', async () => {
  const backend = memoryBackend();
  const tray = createTray(backend);
  const idA = await tray.stage({ artifact: art('first') });
  const idB = await tray.stage({ artifact: art('second'), blobs: { experience: 'BLOB' } });
  assert.notEqual(idA, idB);
  let entries = await tray.list();
  assert.deepEqual(entries.map((e) => e.artifact.title), ['first', 'second'], 'staging order holds');
  assert.equal(entries[1].blobs.experience, 'BLOB', 'originals ride along untouched');

  const idC = await tray.stage({ artifact: art('third'), sheet: { v: 3, docText: '# third' } });
  assert.equal((await tray.list()).find((e) => e.id === idC).sheet.docText, '# third', 'the sheet rides the entry whole — editing depends on it');
  await tray.update(idC, { artifact: art('third, edited'), blobs: {}, sheet: { v: 3, docText: '# third, edited' } });
  assert.equal((await tray.list()).find((e) => e.id === idC).sheet.docText, '# third, edited', 'updates keep it too');
  await tray.unstage(idC);

  await tray.update(idA, { artifact: art('first, edited') });
  await tray.unstage(idB);
  entries = await createTray(backend).list(); // a new session over the same store
  assert.deepEqual(entries.map((e) => e.artifact.title), ['first, edited'], 'closing the tab loses nothing');
});

test('commit: the one consent — laid in order, refusals stay staged with their reason', async () => {
  const tray = createTray(memoryBackend());
  await tray.stage({ artifact: art('one') });
  await tray.stage({ artifact: art('') }); // the stream will refuse this
  await tray.stage({ artifact: art('three'), blobs: { 'asset:0': 'A0' } });

  const seen = [];
  const sink = {
    deposit(artifact, blobs) {
      if (!artifact.title) throw new Error('artifact needs a title');
      seen.push({ title: artifact.title, blobs });
    },
  };
  const { laid, rejected } = await tray.commit(sink);
  assert.deepEqual(seen.map((s) => s.title), ['one', 'three'], 'laid in staging order');
  assert.deepEqual(seen[1].blobs, { 'asset:0': 'A0' }, 'blobs reach the sink');
  assert.equal(laid.length, 2);
  assert.deepEqual(rejected.map((r) => r.reason), ['artifact needs a title']);

  const kept = await tray.list();
  assert.equal(kept.length, 1, 'the refused card stays staged — rejected, never coerced');
  assert.equal(kept[0].artifact.title, '');

  const again = await tray.commit({ deposit() {} });
  assert.equal(again.laid.length, 1, 'a second consent can lay the mended tray');
  assert.equal((await tray.list()).length, 0);
});

test('commit with the door\'s own rule (D101): a card it holds back is never offered to the sink', async () => {
  const tray = createTray(memoryBackend());
  await tray.stage({ artifact: art('kept back') });
  await tray.stage({ artifact: art('let through') });

  const seen = [];
  const refuse = (entry) => (entry.artifact.title === 'kept back' ? 'this one names no practice' : null);
  const { laid, rejected } = await tray.commit({ deposit: (a) => seen.push(a.title) }, refuse);

  assert.deepEqual(seen, ['let through'], 'the sink never saw the held card');
  assert.deepEqual(laid.map((e) => e.artifact.title), ['let through']);
  assert.deepEqual(rejected, [{ id: rejected[0].id, title: 'kept back', reason: 'this one names no practice' }]);
  assert.deepEqual((await tray.list()).map((e) => e.artifact.title), ['kept back'], 'and it stays in the deck, untouched');
});
