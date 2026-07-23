// Dev-only end-to-end drive of the room server — not part of `npm test` (it
// wants the Playwright headless shell and mcp/ its dependencies):
//
//   node tests/room-e2e.mjs
//
// This is the step's actual claim, and the one thing the HTTP suite cannot
// make: a person on their own device writes on a page they reached by their
// own QR, pushes, and the card appears on the projected table in front of
// everyone. Two browser windows stand for the two devices — a phone at
// deposit.html?t=<token>, and the table watching the room's log. The server is
// the real one; nothing here is stubbed but the wifi.
//
// Screenshots land in /tmp/desk-shots/room-*.png.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const CDP = 9336;
const failures = [];
const ok = (cond, label) => {
  console.log(`${cond ? '✔' : '✘'} ${label}`);
  if (!cond) failures.push(label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(ROOT, 'mcp', 'node_modules'))) {
  console.error('mcp/node_modules absent — run `npm install` in mcp/ first');
  process.exit(1);
}

// ---- the room, on its own log so a real desk is never touched ----

const { createRoom, peopleFileIn } = await import('../mcp/room.mjs');
const TOKEN = 'e2e-token';
const desk = join(ROOT, 'drop', 'e2e-room');
rmSync(desk, { recursive: true, force: true });
mkdirSync(join(desk, 'drop', 'assets'), { recursive: true });
writeFileSync(peopleFileIn(desk), JSON.stringify({ [TOKEN]: { name: 'E.' } }));
writeFileSync(join(desk, 'drop', 'stream.jsonl'), '');
// the room serves the repo's own page and seed, against its own log
for (const f of ['index.html', 'deposit.html', 'desk.css', 'desk.js', 'seed.json']) {
  writeFileSync(join(desk, f), readFileSync(join(ROOT, f)));
}
for (const dir of ['js', 'vendor', 'assets']) {
  spawn('cp', ['-R', join(ROOT, dir), join(desk, dir)]).unref();
}
await sleep(600); // let the copies land

const room = createRoom({ root: desk });
const port = await room.listen(0);
const base = `http://localhost:${port}`;
console.log(`the room is open on ${port}`);

// ---- two windows, standing in for two devices ----

rmSync('/tmp/desk-room-profile', { recursive: true, force: true });
mkdirSync('/tmp/desk-shots', { recursive: true });
const shell = spawn(SHELL, [
  '--headless', '--disable-gpu', '--window-size=1440,900', '--hide-scrollbars',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/desk-room-profile',
  `${base}/?live`,
], { stdio: 'ignore' });

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const noise = [];
    ws.onopen = () => resolve({
      noise,
      send(method, params = {}) {
        return new Promise((res) => {
          const mid = ++id;
          pending.set(mid, res);
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
      if (msg.method === 'Runtime.exceptionThrown') noise.push(`exception: ${msg.params.exceptionDetails.text}`);
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        noise.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
    };
    ws.onerror = () => reject(new Error('ws failed'));
  });
}

async function evalIn(page, expression, awaitPromise = false) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.text}`);
  return r.result.value;
}

const UNTIL = `
  globalThis.until = (fn, ms = 10000) => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let v = false; try { v = fn(); } catch {}
      if (v || Date.now() - t0 > ms) { clearInterval(iv); res(!!v); }
    }, 80);
  });
  globalThis.laid = () => document.querySelectorAll('#field .card').length;
  globalThis.card = (id) => !!document.querySelector('#field [data-id="' + id + '"]');
  // the editor's own handle, the way the hand door's harness takes it
  globalThis.edReady = async () => {
    const { EditorView } = await import('/vendor/codemirror.js');
    for (let i = 0; i < 50; i++) {
      const el = document.querySelector('.cm-editor');
      if (el) { globalThis.__view = EditorView.findFromDOM(el); if (globalThis.__view) return true; }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  globalThis.writeCard = (text) => {
    __view.dispatch({ changes: { from: 0, to: __view.state.doc.length, insert: text } });
    __view.focus();
    return __view.state.doc.toString();
  };
  globalThis.act = (label) => {
    const el = [...document.querySelectorAll('.sheet .sheet__action')].find((e) => e.textContent.trim().startsWith(label));
    if (!el) throw new Error('no action ' + label);
    el.click();
  };
  globalThis.sheetStatus = () => document.querySelector('.sheet__status')?.textContent ?? '';
`;

const shoot = (page, name) => page.send('Page.captureScreenshot')
  .then((r) => writeFileSync(`/tmp/desk-shots/room-${name}.png`, Buffer.from(r.data, 'base64')));

let table = null;
let phone = null;
try {
  await sleep(1600);
  const list = await (await fetch(`http://localhost:${CDP}/json/list`)).json();
  table = await connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await table.send('Runtime.enable');
  await table.send('Page.enable');
  await evalIn(table, UNTIL);

  // the table finishes its opening pass over the whole seed before anything else
  const seedEvents = JSON.parse(readFileSync(join(desk, 'seed.json'), 'utf8')).events.filter((e) => e.e === 'deposit').length;
  await evalIn(table, `until(() => laid() >= ${seedEvents}, 25000)`, true);
  const seeded = await evalIn(table, 'laid()');
  ok(seeded === seedEvents, `the table stands with the whole seed (${seeded}/${seedEvents} cards)`);
  await shoot(table, '1-table');

  // -- the phone: a second window, opened at this person's own door --
  const opened = await (await fetch(`http://localhost:${CDP}/json/new?${encodeURIComponent(`${base}/deposit.html?t=${TOKEN}`)}`, { method: 'PUT' })).json();
  phone = await connect(opened.webSocketDebuggerUrl);
  await phone.send('Runtime.enable');
  await evalIn(phone, UNTIL);
  ok(await evalIn(phone, 'edReady()', true), 'the QR opens the sheet on the phone');

  // the page opens already signed: the card is E.'s before a word is written
  const opening = await evalIn(phone, '__view.state.doc.toString()');
  ok(opening.trim() === '@E.', `the page opens signed (${JSON.stringify(opening)})`);
  const preSigned = await evalIn(phone, 'document.querySelector(".sheet__face .card__caption")?.textContent ?? ""');
  ok(preSigned === 'E.', `and the front already says whose it is (${preSigned || 'nothing'})`);
  ok(await evalIn(phone, "!!document.querySelector('.sheet__action')"), 'the actions stand');
  await evalIn(phone, "act('push to table')");
  await sleep(600);
  ok(/first/.test(await evalIn(phone, 'sheetStatus()')), 'but a page holding only its signature is not a card yet');

  // write a card the way a person does, keeping the signature it opened with
  await evalIn(phone, "writeCard('# the zither, restrung\\n\\nthe third course held tune.\\n\\n@E.')");
  await sleep(500);
  await shoot(phone, '2-phone');

  // a note whose words are its title carries the line once, not twice (D40) —
  // so read the whole face, not a title element that is correctly absent
  const front = await evalIn(phone, 'document.querySelector(".sheet__face .card")?.textContent ?? ""');
  ok(front.includes('zither'), `the front previews what was written (${front.trim() || 'nothing'})`);

  // -- the push: the one consent, and it crosses the room --
  await evalIn(phone, "act('push to table')");
  await sleep(1500);
  const status = await evalIn(phone, 'sheetStatus()');
  ok(!/refused|not answering|no table|first/i.test(status), `the phone was not refused (${status || 'nothing said'})`);

  // -- the room's log has it, and the projected table picks it up --
  const log = readFileSync(join(desk, 'drop', 'stream.jsonl'), 'utf8').split('\n').filter(Boolean);
  ok(log.length === 1, `the room's own log holds the card (${log.length} line${log.length === 1 ? '' : 's'})`);
  const laidCard = log.length ? JSON.parse(log[0]).artifact : null;
  ok(laidCard?.id === 'h-001', `it is h-001, numbered by the hand door (${laidCard?.id})`);
  ok(laidCard?.provenance === 'hand', 'and the door named itself');
  ok(JSON.stringify(laidCard?.people) === '["E."]', `signed by the person who wrote it (${JSON.stringify(laidCard?.people)})`);
  ok(!log[0]?.includes('data:'), 'with no payload written into the line');

  const arrived = await evalIn(table, 'until(() => card("h-001"), 12000)', true);
  ok(arrived, 'and it appears on the projected table, without anyone touching it');
  await shoot(table, '3-landed');

  const total = await evalIn(table, 'laid()');
  ok(total === seeded + 1, `the table gained exactly one card (${seeded} → ${total})`);

  // -- the next page opens signed too, not only the first --
  ok((await evalIn(phone, '__view.state.doc.toString()')).trim() === '@E.', 'the page after a push opens signed as well');

  // -- the signature can be handed over: delete it, name someone else --
  await evalIn(phone, "writeCard('# the fold, closed\\n\\n@Y.')");
  await sleep(400);
  await evalIn(phone, "act('push to table')");
  await sleep(1500);
  const handed = readFileSync(join(desk, 'drop', 'stream.jsonl'), 'utf8').split('\n').filter(Boolean);
  const second = handed.length > 1 ? JSON.parse(handed[1]).artifact : null;
  ok(JSON.stringify(second?.people) === '["Y."]', `replacing the signature hands the card over (${JSON.stringify(second?.people)})`);

  // -- a card nobody signed at all is still refused --
  await evalIn(phone, "writeCard('# a fold that will not close')");
  await sleep(400);
  await evalIn(phone, "act('push to table')");
  await sleep(1500);
  const refusal = await evalIn(phone, 'sheetStatus()');
  ok(/author/i.test(refusal), `an unsigned card is refused in words (${refusal || 'nothing said'})`);
  const after = readFileSync(join(desk, 'drop', 'stream.jsonl'), 'utf8').split('\n').filter(Boolean);
  ok(after.length === 2, 'and the room’s log is unchanged by it');

  const noise = [...table.noise, ...phone.noise].filter((n) => !/favicon|ERR_FILE/i.test(n));
  ok(noise.length === 0, `consoles clean${noise.length ? ` — ${noise.join(' | ')}` : ''}`);
} finally {
  table?.close();
  phone?.close();
  shell.kill();
  await room.close();
}

console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall green');
process.exit(failures.length ? 1 : 0);
