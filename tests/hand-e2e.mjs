// Dev-only end-to-end drive of the hand path over CDP — not part of `npm test`
// (it wants the static server up on :8123 and the Playwright headless shell):
//
//   python3 -m http.server 8123 &   then   node tests/hand-e2e.mjs
//
// The editor is CodeMirror 6 (D96), so typing rides the TRUSTED pipeline:
// CDP Input.insertText / Input.dispatchKeyEvent — real key events, real
// editing, with an insert-a-letter canary up front. The view handle comes
// from EditorView.findFromDOM on the same vendored module URL. Covers: the
// live-preview loop (URL and piece lines embed when the cursor leaves,
// dissolve to raw markdown when it returns — the keeper's ask), the /title
// door (pen behind the marks, once only), '# ' titles anywhere, slash labels
// without dashes, the picker path, Backspace/undo over widgets, push to
// table + the set-aside deck (D99) incl. a hand-planted v1 legacy entry,
// broadcast, the staged no-table push, Space-tap vs Space-hold on the table,
// the one-line caret on the empty page, and the blur/focus render cycle.
// Screenshots land in /tmp/desk-shots. Does not ship.

import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const SHELL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = 9333;
const failures = [];
const ok = (cond, label) => {
  console.log(`${cond ? '✔' : '✘'} ${label}`);
  if (!cond) failures.push(label);
};

rmSync('/tmp/desk-e2e-profile', { recursive: true, force: true });
const shell = spawn(SHELL, [
  '--headless', '--disable-gpu', '--window-size=1440,900', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/desk-e2e-profile',
  'http://localhost:8123/?debug',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://localhost:${PORT}/json/list`);
  return res.json();
}

function connect(wsUrl, tag) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log(`  [${tag} exception]`, msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description ?? '');
      }
    };
    ws.onerror = () => reject(new Error('ws failed'));
  });
}

async function evalIn(page, expression, awaitPromise = false) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
  return r.result.value;
}

// trusted keys through the CDP Input domain
const VK = { Enter: 13, Backspace: 8, ArrowDown: 40, ArrowUp: 38, Escape: 27, z: 90 };
async function press(page, key, modifiers = 0) {
  const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: VK[key] ?? 0, modifiers };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const insert = (page, text) => page.send('Input.insertText', { text });
// a real mouse, through the trusted pipeline — the widget path the keyboard never walks
async function clickOn(page, selector) {
  const at = await evalIn(page, `${HELPERS} boxOf('${selector}')`);
  const base = { x: at.x, y: at.y, button: 'left', clickCount: 1 };
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
}
async function pressSpace(page, holdMs = 0) {
  const base = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ' ' });
  if (holdMs) await sleep(holdMs);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function typeLines(page, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await insert(page, lines[i]);
    if (i < lines.length - 1) await press(page, 'Enter');
  }
}

const HELPERS = `
  globalThis.$ = (s) => document.querySelector(s);
  globalThis.set = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  globalThis.act = (label) => { const el = [...document.querySelectorAll('.sheet .sheet__action')].find((e) => e.textContent.trim().startsWith(label)); if (!el) throw new Error('no action ' + label); el.click(); };
  globalThis.sheetStatus = () => $('.sheet__status')?.textContent ?? '';
  globalThis.dropFile = (file) => { const dt = new DataTransfer(); dt.items.add(file); $('.sheet').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt })); };
  globalThis.edReady = async () => {
    const { EditorView } = await import('/vendor/codemirror.js');
    for (let i = 0; i < 50; i++) {
      const el = document.querySelector('.cm-editor');
      if (el) { globalThis.__view = EditorView.findFromDOM(el); if (globalThis.__view) return true; }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  globalThis.docText = () => __view.state.doc.toString();
  globalThis.putCursor = (pos) => { __view.dispatch({ selection: { anchor: Math.min(pos, __view.state.doc.length) } }); __view.focus(); };
  globalThis.clearDoc = () => { __view.dispatch({ changes: { from: 0, to: __view.state.doc.length, insert: '' } }); __view.focus(); };
  globalThis.tapDeck = (sel) => {
    const stack = document.querySelector('.sheet__stack');
    stack.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); // the click that opens
    const el = document.querySelector(sel);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));    // the one that takes
    el.click();
  };
  globalThis.tapOnce = (id) => {
    const el = document.querySelector('[data-id="' + id + '"]');
    const r = el.getBoundingClientRect();
    const at = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', at));
    el.dispatchEvent(new PointerEvent('pointerup', at));
    el.dispatchEvent(new MouseEvent('click', at));
  };
  // A card in a studio's pile takes the two-beat: the first tap spreads the
  // pile, the second takes the card. A card lying alone takes one. This helper
  // reaches the card either way — the gesture itself is drilled in pile-e2e.
  // Spreading is synchronous (the fold re-settles at once); the flip is queued.
  // So if the card moved on this tap, the tap opened its pile — take the second
  // beat. If it did not, the tap already went to the card.
  globalThis.tapCard = (id) => {
    // the settled style, not the rendered box: the spread transitions, so the
    // box still reads the old place for a moment, but the style is already true
    const at = () => document.querySelector('[data-id="' + id + '"]').style.transform;
    const before = at();
    tapOnce(id);
    if (at() !== before) tapOnce(id);
  };
  globalThis.dragCard = (id) => {
    const el = document.querySelector('[data-id="' + id + '"]');
    const r = el.getBoundingClientRect();
    const a = { bubbles: true, clientX: r.x + 20, clientY: r.y + 20 };
    const b = { bubbles: true, clientX: r.x + 70, clientY: r.y + 28 };
    el.dispatchEvent(new PointerEvent('pointerdown', a));
    el.dispatchEvent(new PointerEvent('pointermove', b));
    el.dispatchEvent(new PointerEvent('pointerup', b));
    el.dispatchEvent(new MouseEvent('click', b));
  };
  globalThis.isOpen = (id) => document.querySelector('[data-id="' + id + '"]')?.style.zIndex === '400';
  globalThis.boxOf = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  globalThis.until = (fn, ms = 10000) => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let v = false; try { v = fn(); } catch {}
      if (v) { clearInterval(iv); res(v); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); res(false); }
    }, 120);
  });
`;

try {
  // -- the deployed table --
  let list = [];
  for (let i = 0; i < 60 && !list.length; i++) { await sleep(250); try { list = (await targets()).filter((t) => t.url.includes('localhost:8123')); } catch {} }
  const table = await connect(list[0].webSocketDebuggerUrl, 'table');
  await table.send('Runtime.enable');

  ok(await evalIn(table, `${HELPERS} until(() => !!document.querySelector('[data-id="a-017"]'), 30000)`, true), 'opening pass runs to rest (meta lands)');

  ok(await evalIn(table, `(() => { const b = document.querySelector('.add-btn'); if (!b) return false; const r = b.getBoundingClientRect(); return b.textContent === '+' && r.left < innerWidth / 2 && r.top > innerHeight / 2; })()`), 'a + waits in the pool\'s bottom-left (D91)');
  await press(table, 'Enter');
  ok(await evalIn(table, `${HELPERS} edReady()`, true), 'Enter is the +\'s key — the sheet opens, CodeMirror mounts (D98)');
  ok(await evalIn(table, `document.activeElement?.closest('.cm-editor') != null`), 'the pen is ready — the editor has focus');

  // the trusted-input canary: a letter in, a letter seen, a letter gone
  await evalIn(table, `__view.focus()`);
  await insert(table, 'a');
  ok((await evalIn(table, `docText()`)) === 'a', 'trusted typing reaches the document (canary)');
  await press(table, 'Backspace');
  ok((await evalIn(table, `docText()`)) === '', 'and trusted keys edit it');

  ok(await evalIn(table, `!document.querySelector('[placeholder^="origami"]')`), 'the sheet asks for no craft at all — the work says what it is');
  ok(await evalIn(table, `(() => {
    const opts = [...document.querySelectorAll('.sheet__opt')].filter((e) => e.offsetParent !== null);
    const flag = document.querySelector('.sheet__flag');
    return opts.map((e) => e.textContent).join('|') === "work|quest|flag Claude's failure"
      && flag.getBoundingClientRect().right > document.querySelector('.sheet__opt').getBoundingClientRect().right + 100;
  })()`), "work · quest stand open; the flag waits at the line's far right (D98)");
  ok(await evalIn(table, `getComputedStyle(document.querySelector('.editor')).backgroundColor === 'rgb(222, 209, 182)'`), 'the editor is the parchment back itself (D95)');
  ok(await evalIn(table, `getComputedStyle(document.querySelector('.sheet__deck')).display === 'none'`), 'empty deck stays hidden');

  await evalIn(table, `${HELPERS} act('set aside')`);
  ok((await evalIn(table, `sheetStatus()`)).includes('write, drop, or paste'), 'set aside with nothing: the dry line asks for something');

  // the title through its own door: pen lands behind the marks, door leaves the menu (D99)
  await evalIn(table, `__view.focus()`);
  await insert(table, '/ti');
  await evalIn(table, `${HELPERS} until(() => document.querySelector('.cm-tooltip-autocomplete li[aria-selected] .cm-completionLabel')?.textContent === 'title', 3000)`, true);
  await press(table, 'Enter');
  ok(await evalIn(table, `docText() === '# ' && __view.state.selection.main.head === 2`), "/title writes the marks and sets the pen behind them (D99)");
  await insert(table, 'kiln note, day two');
  await press(table, 'Enter');
  await insert(table, 'The kiln holds at nine hundred, with @T. and @Claude. /');
  ok(await evalIn(table, `${HELPERS} until(() => {
    const lis = [...document.querySelectorAll('.cm-tooltip-autocomplete li .cm-completionLabel')];
    return lis.length === 6 && !lis.some((l) => l.textContent === 'title');
  }, 3000)`, true), 'with a title standing, its door has left the menu (D99)');
  await press(table, 'Escape');
  await press(table, 'Backspace');
  await press(table, 'Backspace');
  ok(await evalIn(table, `${HELPERS} until(() => document.querySelector('.sheet__face .card--note .trace--words')?.textContent === 'kiln note, day two', 3000)`, true), "the '# ' line becomes the title on the front");
  ok((await evalIn(table, `document.querySelector('.sheet__face .card__by')?.textContent`)) === '@T. + Claude',
    'the author reads from the @-mentions, on its own line (D148/D160)');
  ok(await evalIn(table, `document.querySelector('.cm-line.desk-title')?.textContent === 'kiln note, day two'`), "the '# ' marks hide once the pen has left the title line (D98)");
  ok(await evalIn(table, `document.querySelectorAll('.desk-mention').length >= 2`), 'the names wear their quiet pills (D98)');
  await evalIn(table, `${HELPERS} act('push to table')`);
  ok(await evalIn(table, `${HELPERS} until(() => {
    const el = document.querySelector('#field [data-id="h-001"]');
    return !!el && el.classList.contains('card--note') && el.classList.contains('card--backed') && !document.querySelector('.sheet');
  }, 6000)`, true), 'push to table lays h-001 at once — no staging, and the sheet steps away (D99)');

  // -- /image: the slash menu, mid-text, no dashes, into the picker (D96/D97) --
  await evalIn(table, `document.querySelector('.add-btn').click()`);
  ok(await evalIn(table, `${HELPERS} edReady()`, true), 'a second sheet mounts');
  await evalIn(table, `(() => { const p = document.querySelector('.sheet input[type=file][hidden]'); globalThis.__accept = null; p.click = () => { globalThis.__accept = p.accept; }; })()`);
  await evalIn(table, `__view.focus()`);
  await typeLines(table, ['# the kiln door', '@T. worked by the west wall ']);
  await insert(table, '/im');
  ok(await evalIn(table, `${HELPERS} until(() => document.querySelector('.cm-tooltip-autocomplete li[aria-selected] .cm-completionLabel')?.textContent === 'image', 3000)`, true), 'mid-text /im filters the menu to image');
  await sleep(150);
  ok(await evalIn(table, `![...document.querySelectorAll('.cm-tooltip-autocomplete li')].some((li) => li.textContent.includes('—'))`), 'the options carry no dashes (D97)');
  await press(table, 'Enter');
  ok((await evalIn(table, `globalThis.__accept`)) === 'image/*', 'picking image opens the picker, filtered');
  ok((await evalIn(table, `docText()`)).endsWith('by the west wall '), 'the /token is excised, the sentence whole');
  await evalIn(table, `(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#7a5c36'; x.fillRect(0, 0, 320, 200);
    x.fillStyle = '#e8dcc4'; x.beginPath(); x.arc(160, 100, 52, 0, 7); x.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'kiln-door.png', { type: 'image/png' }));
    const p = document.querySelector('.sheet input[type=file][hidden]');
    p.files = dt.files; p.dispatchEvent(new Event('change'));
  })()`, true);
  ok(await evalIn(table, `${HELPERS} until(() => /!\\[kiln-door\\]\\(piece:\\w+\\)/.test(docText()), 6000)`, true), 'the picked photo lands as its reference line, caption sans extension (D94)');

  ok(await evalIn(table, `(() => {
    const sel = __view.state.selection.main;
    return __view.state.doc.sliceString(sel.from, sel.to) === 'kiln-door';
  })()`), 'the pen lands in the caption, ready to be rewritten (D98)');
  await insert(table, 'the west door');
  await press(table, 'ArrowDown');
  ok(await evalIn(table, `${HELPERS} until(() => document.querySelector('.editor .edit-piece--image img')?.src.startsWith('data:image/png') && document.querySelector('.editor .edit-piece__caption')?.textContent === 'the west door', 4000)`, true), 'typing replaced it, and leaving rendered the still');

  // the keeper's loop holds for pieces too: arrows onto the still dissolve it
  await press(table, 'ArrowUp');
  ok(await evalIn(table, `${HELPERS} until(() => !document.querySelector('.editor .edit-piece--image') && /!\\[the west door\\]/.test(docText()), 3000)`, true), 'arrowing onto the photo dissolves it to its editable line (D99)');
  await press(table, 'ArrowDown');
  ok(await evalIn(table, `${HELPERS} until(() => !!document.querySelector('.editor .edit-piece--image'), 3000)`, true), 'and leaving renders it again');

  // and the mouse agrees with the arrows: ONE click opens the line (D99) —
  // the front is its own quiet mark, not what a click on the picture means
  await clickOn(table, '.editor .edit-piece--image .edit-piece__img');
  ok(await evalIn(table, `${HELPERS} until(() => !document.querySelector('.editor .edit-piece--image'), 3000)`, true), 'one click on the photo opens its line — no click out and back (D99)');
  ok(await evalIn(table, `(() => {
    const line = __view.state.doc.lineAt(__view.state.selection.main.head);
    return __view.state.selection.main.head === line.from + 2 + 'the west door'.length;
  })()`), 'and the pen sits at the end of the caption, the part you came to edit (D99)');
  await press(table, 'ArrowDown');
  await evalIn(table, `${HELPERS} until(() => !!document.querySelector('.editor .edit-piece--image'), 3000)`, true);
  await clickOn(table, '.editor .edit-piece--image .pick-front');
  ok(await evalIn(table, `${HELPERS} until(() => !!document.querySelector('.editor .edit-piece.desk-front') && !!document.querySelector('.pick-front--on'), 3000)`, true), "the 'front' mark, and only it, chooses the card's face (D99)");

  // the typed doors take their own kind only (D103) — his bug: /audio took film
  await evalIn(table, `putCursor(docText().length)`);
  await press(table, 'Enter');
  const docBefore = await evalIn(table, `docText()`);
  await insert(table, '/au');
  await evalIn(table, `${HELPERS} until(() => document.querySelector('.cm-tooltip-autocomplete li[aria-selected] .cm-completionLabel')?.textContent === 'audio', 3000)`, true);
  await press(table, 'Enter');
  ok((await evalIn(table, `globalThis.__accept`)) === 'audio/*', 'the audio door asks the picker for audio');
  await evalIn(table, `(() => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([0, 1, 2, 3])], 'walk.mov', { type: 'video/quicktime' }));
    const p = document.querySelector('.sheet input[type=file][hidden]');
    p.files = dt.files; p.dispatchEvent(new Event('change'));
  })()`);
  ok(await evalIn(table, `${HELPERS} until(() => sheetStatus() === 'walk.mov is not audio · / file shelves anything', 5000)`, true), 'a film handed to the audio door is refused, and told why (D103)');
  ok((await evalIn(table, `docText()`)) === docBefore, 'and nothing reached the page');
  await press(table, 'Backspace'); // the blank line the door was opened on

  // set aside: the card joins the pile, in person — no label, no status line,
  // the pile gaining a card is the whole answer (D99/D114)
  await evalIn(table, `${HELPERS} act('set aside')`);
  ok(await evalIn(table, `${HELPERS} until(() => {
    const slot = document.querySelector('.sheet__stack .deck-card');
    return !!slot && slot.title === 'the kiln door' && !!slot.querySelector('.card--image') && docText() === '' && sheetStatus() === '';
  }, 4000)`, true), 'the pile shows the card itself — mini, named, no words — and the page is clear');
  ok(await evalIn(table, `(() => {
    const stack = document.querySelector('.sheet__stack');
    stack.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    stack.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    return !stack.classList.contains('stack--open');
  })()`), 'a passing pointer leaves the pile alone (D115)');
  ok(await evalIn(table, `(() => {
    const stack = document.querySelector('.sheet__stack');
    stack.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return stack.classList.contains('stack--open');
  })()`), 'a click is what opens it (D115)');
  ok(await evalIn(table, `(() => {
    const slot = document.querySelector('.deck-card');
    return getComputedStyle(slot).transform !== 'none' && slot.style.getPropertyValue('--sx') === '0px' && slot.style.getPropertyValue('--sy') === '0px';
  })()`), 'alone, it grows in place — no sideways step (D114)');
  // a second card, written after the first went to the deck: the editor must
  // still see new pieces — the registry is emptied in place, never swapped (D99)
  await evalIn(table, `__view.focus()`);
  await insert(table, 'a second card by @T., written after the first went to the deck');
  await evalIn(table, `putCursor(0)`); // the synthetic drop lands at the top; the sentence gives the pen a line to leave to
  await evalIn(table, `(async () => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 140;
    const x = c.getContext('2d'); x.fillStyle = '#4a5c36'; x.fillRect(0, 0, 200, 140);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    dropFile(new File([blob], 'second-piece.png', { type: 'image/png' }));
  })()`, true);
  await evalIn(table, `${HELPERS} until(() => /!\\[second-piece\\]/.test(docText()), 6000)`, true);
  await insert(table, 'the green plate'); // over the selected caption, as a hand would
  await press(table, 'ArrowDown');
  ok(await evalIn(table, `${HELPERS} until(() => document.querySelector('.editor .edit-piece__caption')?.textContent === 'the green plate', 4000)`, true), 'a picture added after a set-aside still renders — the registry survives the clearing (D99)');
  await evalIn(table, `clearDoc()`);

  await evalIn(table, `${HELPERS} tapDeck('.deck-card')`);
  ok(await evalIn(table, `${HELPERS} until(() => docText().includes('the west door') && sheetStatus().includes('picked up from the deck'), 4000)`, true), 'a tap hands the card back to the pen');
  ok(await evalIn(table, `__view.hasFocus && __view.state.selection.main.head === __view.state.doc.length`), 'picked up means in hand — the editor holds the pen at the end (D99)');
  await evalIn(table, `${HELPERS} act('push to table')`);
  ok(await evalIn(table, `${HELPERS} until(() => {
    const el = document.querySelector('#field [data-id="h-002"]');
    return !!el && el.classList.contains('card--image') && el.querySelector('.card__title')?.textContent === 'the kiln door' && !document.querySelector('.sheet');
  }, 6000)`, true), 'pushing the picked-up card lays it and leaves the deck');

  // -- D92/D93 on the laid table: clean tap flips, marked text stays, backs fit --
  await evalIn(table, `${HELPERS} tapCard('a-017')`);
  ok(await evalIn(table, `${HELPERS} until(() => isOpen('a-017'), 4000)`, true), 'a clean tap picks the card up');
  ok(await evalIn(table, `(() => {
    const el = document.querySelector('[data-id="a-017"]');
    const back = el.querySelector('.card__back');
    // the back's own window is the card's height, not the front's (D93's hole, closed in D100)
    return back.clientHeight === el.clientHeight && el.clientHeight + 2 >= back.scrollHeight;
  })()`), 'the open card fits its whole back, window and all (D93/D100)');
  await evalIn(table, `(() => {
    const note = document.querySelector('[data-id="a-017"] .back__note');
    const r = document.createRange(); r.selectNodeContents(note);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  })()`);
  await evalIn(table, `${HELPERS} tapCard('a-017')`);
  await sleep(700);
  ok(await evalIn(table, `${HELPERS} isOpen('a-017')`), 'marking text to copy keeps the card open (D92)');
  await evalIn(table, `getSelection().removeAllRanges()`);
  await evalIn(table, `${HELPERS} dragCard('a-017')`);
  await sleep(700);
  ok(await evalIn(table, `${HELPERS} isOpen('a-017')`), 'a drag is reading, not a flip');
  await evalIn(table, `${HELPERS} tapCard('a-017')`);
  ok(await evalIn(table, `${HELPERS} until(() => !isOpen('a-017'), 4000)`, true), 'the next clean tap lays it back down');

  // -- Space on the table (D99): a tap deals the sheet, a hold rushes --
  await pressSpace(table);
  ok(await evalIn(table, `${HELPERS} until(() => !!document.querySelector('.sheet .cm-editor'), 6000)`, true), 'a tap of Space opens the sheet, like Enter (D99)');
  ok(await evalIn(table, `${HELPERS} edReady()`, true), 'and its editor mounts');
  ok(await evalIn(table, `${HELPERS} until(() => { const c = __view.coordsAtPos(0); return !!c && (c.bottom - c.top) < 30; }, 3000)`, true), 'the caret on the empty page stands one line tall (D99)');
  ok(await evalIn(table, `getComputedStyle(document.querySelector('.cm-placeholder')).display === 'inline'`), 'the hint wraps as text, not as one tall box');
  await evalIn(table, `__view.focus()`);
  await insert(table, '/');
  await evalIn(table, `${HELPERS} until(() => !!document.querySelector('.cm-tooltip-autocomplete'), 3000)`, true);
  await press(table, 'Escape');
  ok(await evalIn(table, `${HELPERS} until(() => !document.querySelector('.cm-tooltip-autocomplete') && !!document.querySelector('.sheet'), 3000)`, true), 'over the table too, Esc closes the menu and keeps the sheet (D99)');
  await evalIn(table, `clearDoc()`);
  await press(table, 'Escape');
  ok(await evalIn(table, `${HELPERS} until(() => !document.querySelector('.sheet'), 3000)`, true), 'Escape lays the empty sheet away');
  // Space steps nowhere (D103): held or tapped, it is Enter's twin and nothing else
  const beforeSpace = await evalIn(table, `document.querySelectorAll('#field .card').length`);
  await pressSpace(table, 700);
  await sleep(500);
  ok(await evalIn(table, `!!document.querySelector('.sheet')
    && document.querySelectorAll('#field .card').length === ${beforeSpace}`), 'a held Space opens the sheet and steps the table nowhere (D103)');
  await press(table, 'Escape');
  await evalIn(table, `${HELPERS} until(() => !document.querySelector('.sheet'), 3000)`, true);

  // -- a card in hand is a page, and a long back turns leaves (D100) --
  await press(table, 'Enter');
  ok(await evalIn(table, `${HELPERS} edReady()`, true), 'a sheet for the long card');
  await typeLines(table, ['# the long account', ...Array.from({ length: 14 }, (_, i) =>
    `Paragraph ${i + 1}, by @E.. The kiln was opened at first light and the whole batch was carried out to the yard, where the wind took the last of the heat off the glaze and everyone stood about saying nothing much.`),
    'Supercalifragilisticexpialidociousandthensomemoreletterswithnospacesatallxxxxxxxxxxxxxxxx',
    'https://example.test/a/very/long/path/that/keeps/going/and/going/until/it/is/wider/than/any/card?with=query&and=more']);
  // a tall portrait, the kind that used to take three leaves on its own (D102)
  await evalIn(table, `${HELPERS} (async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 1400;
    const x = c.getContext('2d'); x.fillStyle = '#6b4f2a'; x.fillRect(0, 0, 300, 1400);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    dropFile(new File([blob], 'tall-portrait.png', { type: 'image/png' }));
  })()`, true);
  await evalIn(table, `${HELPERS} until(() => /!\\[tall-portrait\\]/.test(docText()), 8000)`, true);
  await evalIn(table, `${HELPERS} act('push to table')`);
  ok(await evalIn(table, `${HELPERS} until(() => !!document.querySelector('#field [data-id="h-003"]'), 8000)`, true), 'the long card lies down');
  const laidBox = await evalIn(table, `(() => { const r = document.querySelector('[data-id="h-003"]').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  await evalIn(table, `${HELPERS} tapCard('h-003')`);
  ok(await evalIn(table, `${HELPERS} until(() => isOpen('h-003'), 4000)`, true), 'it comes into the hand');
  await sleep(700);
  const openBox = await evalIn(table, `(() => { const r = document.querySelector('[data-id="h-003"]').getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right, bottom: r.bottom, left: r.left, top: r.top }; })()`);
  ok(openBox.w > laidBox.w * 2, `a card in hand is a page, not a token (D100) — ${Math.round(laidBox.w)}px laid, ${Math.round(openBox.w)}px in hand`);
  ok(openBox.left > -1 && openBox.top > -1 && await evalIn(table, `${openBox.right} < innerWidth + 1 && ${openBox.bottom} < innerHeight + 1`), 'and it still lies inside the light');
  ok(await evalIn(table, `(() => {
    const back = document.querySelector('[data-id="h-003"] .card__back');
    const nav = back.querySelector('.back__nav');
    return Number(back.dataset.pages) > 1 && back.dataset.page === '1' && back.dataset.at === 'first'
      && getComputedStyle(nav).display === 'flex' && /^1\\/\\d+$/.test(back.querySelector('.back__count').textContent);
  })()`), 'a back longer than the card gets its bar, at the first leaf (D100)');
  // nothing runs off the paper sideways, and a tall still shares its leaf (D102)
  ok(await evalIn(table, `(() => {
    const flow = document.querySelector('[data-id="h-003"] .back__flow');
    return flow.scrollWidth <= flow.clientWidth + 1;
  })()`), 'a monster word and a long address wrap inside the card, never past it (D102)');
  ok(await evalIn(table, `(() => {
    const el = document.querySelector('[data-id="h-003"]');
    const img = el.querySelector('.back__piece img');
    return !!img && img.offsetHeight <= el.offsetHeight * 0.7 && img.offsetWidth <= el.querySelector('.back__flow').clientWidth + 1;
  })()`), 'the tall portrait is held to part of the card, at its own shape (D102)');

  await evalIn(table, `${HELPERS} (() => { const el = document.querySelector('[data-id="h-003"] .back__page[data-page="next"]'); const r = el.getBoundingClientRect();
    const at = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', at)); el.dispatchEvent(new PointerEvent('pointerup', at)); el.dispatchEvent(new MouseEvent('click', at)); })()`);
  await sleep(500);
  ok(await evalIn(table, `${HELPERS} until(() => {
    const back = document.querySelector('[data-id="h-003"] .card__back');
    return back.dataset.page === '2' && back.querySelector('.back__flow').scrollTop > 0 && isOpen('h-003');
  }, 3000)`, true), 'tapping › turns the leaf and keeps the card in hand (D100)');

  // a hand may push the arrangement along directly, and the bar follows (D102)
  await evalIn(table, `(() => { const f = document.querySelector('[data-id="h-003"] .back__flow'); f.scrollTop = f.scrollHeight; })()`);
  ok(await evalIn(table, `${HELPERS} until(() => {
    const back = document.querySelector('[data-id="h-003"] .card__back');
    return back.dataset.page === back.dataset.pages && back.dataset.at === 'last' && isOpen('h-003');
  }, 3000)`, true), 'scrolling the back to its end moves the bar with it (D102)');

  await evalIn(table, `${HELPERS} tapCard('h-003')`);
  ok(await evalIn(table, `${HELPERS} until(() => !isOpen('h-003'), 4000)`, true), 'a tap on the card itself still lays it back down');
  ok(await evalIn(table, `(() => {
    const back = document.querySelector('[data-id="h-003"] .card__back');
    return !back.dataset.pages && back.querySelector('.back__flow').scrollTop === 0;
  })()`), 'laid down, the back is whole again — from the top, no leaf left turned');

  // -- deposit.html: the live-preview loop, undo, kinds, audio, broadcast --
  const created = await fetch(`http://localhost:${PORT}/json/new?url=${encodeURIComponent('http://localhost:8123/deposit.html')}`, { method: 'PUT' });
  const dep = await created.json();
  if (!dep.webSocketDebuggerUrl) throw new Error(`no ws url in /json/new response: ${JSON.stringify(dep).slice(0, 200)}`);
  const phone = await connect(dep.webSocketDebuggerUrl, 'phone');
  await phone.send('Runtime.enable');
  await phone.send('Page.enable').catch(() => {});
  await phone.send('Page.navigate', { url: 'http://localhost:8123/deposit.html' });
  ok(await evalIn(phone, `${HELPERS} edReady()`, true), 'deposit.html mounts the editor');
  await evalIn(phone, `__view.focus()`);

  // the keeper's loop: a URL line embeds when the cursor leaves, and dissolves
  // to raw markdown when the arrows walk back onto it
  await insert(phone, 'https://x.invalid/typed-in');
  ok(await evalIn(phone, `!document.querySelector('.editor .desk-linkwrap')`), 'while the cursor sits on the address, it stays text');
  await press(phone, 'Enter');
  ok(await evalIn(phone, `${HELPERS} until(() => document.querySelector('.editor .desk-linkline')?.textContent === 'x.invalid', 4000)`, true), 'leaving the line turns it into its inline link (D97/D98)');
  await press(phone, 'ArrowUp');
  ok(await evalIn(phone, `${HELPERS} until(() => !document.querySelector('.editor .desk-linkwrap'), 3000)`, true), 'arrowing back dissolves it to raw markdown — the address under the pen');
  await evalIn(phone, `putCursor(docText().indexOf('typed-in') + 'typed-in'.length)`);
  await insert(phone, '-more');
  await press(phone, 'ArrowDown');
  ok(await evalIn(phone, `${HELPERS} until(() => docText().includes('typed-in-more') && !!document.querySelector('.editor .desk-linkline'), 3000)`, true), 'the address edits in place and re-renders on leave');

  // erasing and undoing widgets
  await evalIn(phone, `putCursor(docText().length)`);
  await press(phone, 'Backspace'); // at the start of the line below the embed
  ok(await evalIn(phone, `${HELPERS} until(() => !docText().includes('typed-in-more'), 3000)`, true), 'backspace at the top of a line takes the embed above with it (D94)');
  await press(phone, 'z', 4); // Mod-z
  ok(await evalIn(phone, `${HELPERS} until(() => docText().includes('typed-in-more') && !!document.querySelector('.editor .desk-linkline'), 3000)`, true), 'undo brings the piece back, widget and all (D96)');
  await evalIn(phone, `clearDoc()`);

  // the slash menu: everything on offer, Esc closes only itself
  await insert(phone, '/');
  ok((await evalIn(phone, `${HELPERS} until(() => document.querySelectorAll('.cm-tooltip-autocomplete li').length === 7, 3000)`, true)), 'a bare / offers the seven doors — no registers hiding in it (D98)');
  ok(!(await evalIn(phone, `[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map((li) => li.textContent).join('|')`)).match(/work|quest|failure/), 'registers left the menu (D98)');
  await press(phone, 'Escape');
  ok(await evalIn(phone, `!document.querySelector('.cm-tooltip-autocomplete') && !!document.querySelector('.sheet--page .editor')`), 'Esc closes the menu and nothing else');
  await evalIn(phone, `clearDoc()`);

  // the page's own picture: a link to our own origin answers with its title
  await insert(phone, 'http://localhost:8123/');
  await press(phone, 'Enter');
  ok(await evalIn(phone, `${HELPERS} until(() => document.querySelector('.desk-linkline')?.textContent === 'localhost:8123', 4000)`, true), 'a link renders inline, in the door grammar (D98)');
  ok(await evalIn(phone, `${HELPERS} until(() => document.querySelector('.link-preview__title')?.textContent === 'the desk', 6000)`, true), 'the page was asked, and its title answered beneath (D98)');
  await evalIn(phone, `document.querySelector('.link-preview__x').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  ok(await evalIn(phone, `${HELPERS} until(() => docText().includes('<http://localhost:8123/>') && !document.querySelector('.link-preview'), 3000)`, true), 'clicking the preview away leaves the plain link');
  await evalIn(phone, `clearDoc()`);

  // a recording: waveform still, md title
  await evalIn(phone, `${HELPERS} (() => {
    const rate = 8000, n = rate;
    const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
    const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const t = i / rate; v.setInt16(44 + i * 2, Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * 220 * t) * 28000, true); }
    dropFile(new File([buf], 'drone-take.wav', { type: 'audio/wav' }));
  })()`);
  ok(await evalIn(phone, `${HELPERS} until(() => {
    const sel = __view.state.selection.main;
    return __view.state.doc.sliceString(sel.from, sel.to) === 'drone-take';
  }, 8000)`, true), 'the recording lands with its caption under the pen (D98)');
  await insert(phone, 'first take');
  await press(phone, 'ArrowDown');
  ok(await evalIn(phone, `${HELPERS} until(() => document.querySelector('.editor .edit-piece--audio img')?.src.startsWith('data:image/svg') && document.querySelector('.editor .edit-piece__caption')?.textContent === 'first take', 6000)`, true), 'the waveform drew at deposit time; leaving rendered it');

  // the blur/focus cycle (D99): raw under the pen, whole when the pen is away —
  // and the field re-syncs even when focus moves programmatically
  await evalIn(phone, `putCursor(docText().indexOf('![') + 3)`);
  ok(await evalIn(phone, `${HELPERS} until(() => !document.querySelector('.editor .edit-piece--audio'), 3000)`, true), 'the pen on the piece line dissolves the still');
  await evalIn(phone, `__view.contentDOM.blur()`);
  ok(await evalIn(phone, `${HELPERS} until(() => !!document.querySelector('.editor .edit-piece--audio'), 3000)`, true), 'blur closes the note — everything renders');
  await evalIn(phone, `__view.focus()`);
  ok(await evalIn(phone, `${HELPERS} until(() => !document.querySelector('.editor .edit-piece--audio'), 3000)`, true), 'focus returns, and the line under the pen is editable again (D99)');
  await evalIn(phone, `putCursor(0)`);
  await insert(phone, '# drone, phone take');
  await press(phone, 'Enter');
  await insert(phone, 'by @B.'); // every card names its author (D118)
  await press(phone, 'Enter');
  await evalIn(phone, `document.querySelector('.sheet__flag').click()`);
  ok(await evalIn(phone, `document.querySelector('.sheet__flag').classList.contains('sheet__opt--on')`), 'the flag stands, and asks nothing further of anyone');
  ok(await evalIn(phone, `${HELPERS} until(() => !!document.querySelector('.sheet__face .card--audio.kind--failure'), 4000)`, true), 'the front previews the ashen register (D95/D98)');
  await sleep(400);
  const shot1 = await phone.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/desk-shots/e2e-editor-audio.png', Buffer.from(shot1.data, 'base64'));
  await evalIn(phone, `${HELPERS} act('push to table')`);
  ok(await evalIn(phone, `${HELPERS} until(() => sheetStatus().includes('pushed · a table open in this browser took it'), 8000)`, true), 'the phone hears the table answer');
  ok(await evalIn(table, `${HELPERS} until(() => {
    const el = document.querySelector('#field [data-id="h-004"]');
    return !!el && el.classList.contains('card--audio') && el.classList.contains('kind--failure')
      && !!el.querySelector('[data-plays] audio') && !!el.querySelector('[data-plays] [data-seek]')
      && el.querySelector('.card__trace img')?.src.startsWith('data:image/svg');
  }, 8000)`, true), 'the flagged card crosses the channel — ashen, waveform front, a player behind (D147)');
  await sleep(600);
  const shot2 = await table.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/desk-shots/e2e-table-after.png', Buffer.from(shot2.data, 'base64'));

  // a v1 legacy entry planted straight into the tray store, then found again
  await evalIn(phone, `(async () => {
    const open = indexedDB.open('desk-tray', 1);
    await new Promise((res, rej) => {
      open.onupgradeneeded = () => open.result.createObjectStore('entries', { keyPath: 'id' });
      open.onsuccess = res; open.onerror = rej;
    });
    const db = open.result;
    const tx = db.transaction('entries', 'readwrite');
    tx.objectStore('entries').put({
      id: 's-99', seq: 99,
      artifact: { media: 'text', kind: 'work', title: 'old card', people: ['Y.'], provenance: 'hand', visibility: 'public', excerpt: { form: 'sentence', text: 'the body line @Y.' } },
      blobs: {},
      sheet: { title: 'old card', kind: 'work', frontTextId: 'title', blocks: [{ id: 't1', t: 'text', text: 'the body line @Y.' }] },
    });
    await new Promise((res) => { tx.oncomplete = res; });
    db.close();
  })()`, true);
  await evalIn(phone, `location.reload()`);
  await sleep(400);
  ok(await evalIn(phone, `${HELPERS} edReady()`, true), 'the page returns, the deck persisted');
  ok(await evalIn(phone, `${HELPERS} until(() => !!document.querySelector('.deck-card[title="old card"]'), 6000)`, true), 'the planted v1 card stands in the deck by name');
  await evalIn(phone, `${HELPERS} tapDeck('.deck-card[title="old card"]')`);
  ok(await evalIn(phone, `${HELPERS} until(() => docText().startsWith('# old card'), 4000)`, true), 'a v1 legacy entry opens as the md page (D96)');
  await evalIn(phone, `${HELPERS} act('set aside')`);
  ok(await evalIn(phone, `${HELPERS} until(() => sheetStatus() === 'kept', 4000)`, true), 'and keeps its changes');
  ok(await evalIn(phone, `(async () => {
    const open = indexedDB.open('desk-tray', 1);
    await new Promise((res) => { open.onsuccess = res; });
    const db = open.result;
    const tx = db.transaction('entries', 'readonly');
    const req = tx.objectStore('entries').getAll();
    const rows = await new Promise((res) => { req.onsuccess = () => res(req.result); });
    db.close();
    return rows.some((r) => r.sheet?.v === 3 && r.sheet.docText.startsWith('# old card'));
  })()`, true), 're-saved as a v3 doc');

  // -- the deck's own door, only once more than one card waits (D101) --
  ok(await evalIn(phone, `document.querySelectorAll('.deck-card').length === 1
    && getComputedStyle(document.querySelector('.sheet__pushall')).display === 'none'`), 'one card set aside: no batch door, just the card (D101)');
  await evalIn(phone, `__view.focus()`);
  await typeLines(phone, ['# a batch companion', 'set aside by @T. so the deck holds two.']);
  await evalIn(phone, `${HELPERS} act('set aside')`);
  ok(await evalIn(phone, `${HELPERS} until(() => {
    const b = document.querySelector('.sheet__pushall');
    return document.querySelectorAll('.deck-card').length === 2 && getComputedStyle(b).display !== 'none' && b.textContent === 'push all 2 to table';
  }, 4000)`, true), 'a second card raises "push all 2 to table" (D101)');
  ok(await evalIn(phone, `(() => {
    const [a, b] = document.querySelectorAll('.deck-card');
    const ax = parseFloat(a.style.getPropertyValue('--sx'));
    const bx = parseFloat(b.style.getPropertyValue('--sx'));
    // the step itself is an eye-tunable constant; what must hold is the shape
    return ax < 0 && bx === -ax && a.style.getPropertyValue('--sy') === '0px' && b.style.getPropertyValue('--sy') === '0px';
  })()`), 'two cards open to the left and right of the pile (D114)');
  await evalIn(phone, `${HELPERS} act('push all')`);
  ok(await evalIn(phone, `${HELPERS} until(() => sheetStatus().includes('2 pushed'), 8000)`, true), 'the phone hears the table take them both');
  ok(await evalIn(phone, `${HELPERS} until(() => !document.querySelectorAll('.deck-card').length
    && getComputedStyle(document.querySelector('.sheet__deck')).display === 'none', 4000)`, true), 'and the deck is empty again');
  ok(await evalIn(table, `${HELPERS} until(() => !!document.querySelector('#field [data-id="h-005"]') && !!document.querySelector('#field [data-id="h-006"]'), 8000)`, true), 'both cards lie on the table, in the order they were set aside');

  // -- no table open: a push into silence stages the card instead (D99) --
  await fetch(`http://localhost:${PORT}/json/close/${list[0].id}`);
  await sleep(500);
  await evalIn(phone, `__view.focus()`);
  await typeLines(phone, ['# a card with nowhere to go', 'the table was closed behind @T.']);
  await evalIn(phone, `${HELPERS} act('push to table')`);
  ok(await evalIn(phone, `${HELPERS} until(() => sheetStatus().includes('no table is open in this browser · kept in the deck'), 8000)`, true), 'silence surfaces the dry no-table line — and says where the card went');
  ok(await evalIn(phone, `document.querySelectorAll('.deck-card').length === 1`), 'the deck holds the card — nothing is lost');

  phone.close();
  table.close();
} catch (err) {
  failures.push(String(err?.message ?? err));
  console.error('✘ e2e aborted:', err);
} finally {
  shell.kill();
}

console.log(failures.length ? `\nFAIL — ${failures.length} problem(s)` : '\nPASS — the hand path runs end to end');
process.exit(failures.length ? 1 : 0);
