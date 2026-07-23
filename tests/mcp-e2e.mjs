// Dev-only end-to-end drive of the MCP door — not part of `npm test` (it wants
// the static server up on :8123, the Playwright headless shell, and mcp/ its
// dependencies):
//
//   python3 -m http.server 8123 &   then   node tests/mcp-e2e.mjs
//
// Walks the one-take shoot on the main page's own controls (D103: Space opens
// the sheet, → steps): the pass rests live with meta held back (?tail=1), a
// real Claude-session deposit lands within a poll, a second one waits politely
// while the table is held and lands on →, a re-deal re-enacts both (D28), and
// m lands meta last (D52 closed). Screenshots land in /tmp/desk-shots.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = 9334;
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

// Between takes the keeper truncates; so does this harness (D112).
const DROP = join(ROOT, 'drop', 'stream.jsonl');
mkdirSync(join(ROOT, 'drop', 'assets'), { recursive: true });
writeFileSync(DROP, '');
for (const f of readdirSync(join(ROOT, 'drop', 'assets'))) rmSync(join(ROOT, 'drop', 'assets', f), { force: true });

// ---- a Claude session, in miniature: the real server over real stdio ----

function openDoor() {
  const child = spawn(process.execPath, [join(ROOT, 'mcp', 'server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', (b) => stderr.push(String(b)));
  let buffer = '';
  const pending = new Map();
  child.stdout.on('data', (b) => {
    buffer += String(b);
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  let id = 0;
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mid, method, params })}\n`);
  });
  return {
    stderr,
    close: () => child.kill(),
    async start() {
      await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    },
    deposit: (args) => send('tools/call', { name: 'deposit', arguments: args }),
  };
}
const said = (res) => res.result.content.map((p) => p.text).join('\n');

// ---- the table, over CDP ----

rmSync('/tmp/desk-mcp-profile', { recursive: true, force: true });
mkdirSync('/tmp/desk-shots', { recursive: true });
const shell = spawn(SHELL, [
  '--headless', '--disable-gpu', '--window-size=1440,900', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/desk-mcp-profile',
  'http://localhost:8123/?live&tail=1&debug',
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

const HELPERS = `
  globalThis.card = (id) => !!document.querySelector('#field [data-id="' + id + '"]');
  globalThis.laid = () => document.querySelectorAll('#field .card').length;
  globalThis.until = (fn, ms = 8000) => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let v = false; try { v = fn(); } catch {}
      if (v || Date.now() - t0 > ms) { clearInterval(iv); res(!!v); }
    }, 60);
  });
`;

const VK = { ArrowRight: 39, d: 68, m: 77 };
async function press(page, key) {
  const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: VK[key] ?? 0 };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const shoot = (page, name) => page.send('Page.captureScreenshot').then((r) => writeFileSync(`/tmp/desk-shots/mcp-${name}.png`, Buffer.from(r.data, 'base64')));

const door = openDoor();
let table = null;
try {
  await sleep(1400);
  const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  table = await connect(target.webSocketDebuggerUrl);
  await table.send('Runtime.enable');
  await table.send('Page.enable');
  await door.start();

  // -- the pass, with meta held back (?tail=1) --
  // 22 seed events, meta held back: 16 of the remaining 21 are deposits (the rest are threads)
  ok(await evalIn(table, `${HELPERS} until(() => laid() >= 16, 30000)`, true), 'the pass deals the seed and rests');
  ok(!(await evalIn(table, `${HELPERS} card('a-017')`)), 'the meta card is held back — the tail is off the table (D111)');

  // -- the shot: a confirmed deposit from a session lands on the table --
  const t0 = Date.now();
  const res = await door.deposit({
    media: 'text', kind: 'work', title: 'the zither, restrung',
    caption: 'strings · Y. + Claude', people: ['Y.', 'Claude'], practice: 'instrument building',
    excerpt: { text: 'the third course held tune for the first time.' },
  });
  ok(said(res) === 'm-001 · laid — the table has it', `the door answers dryly: ${said(res)}`);
  const landed = await evalIn(table, `${HELPERS} until(() => card('m-001'), 6000)`, true);
  ok(landed, `the card walks onto the table (${Date.now() - t0} ms from the call)`);
  ok(Date.now() - t0 < 4000, 'within a poll and a gesture — the terminal shot works on camera');
  await shoot(table, 'deposit-landed');

  // -- held: a picked-up deposit waits its turn (D105) --
  await press(table, 'd'); // live → held
  await sleep(200);
  const second = await door.deposit({ media: 'note', kind: 'fieldnotes', people: ['Claude'], title: 'two rooms are solving the same joint' });
  ok(said(second) === 'm-002 · laid — the table has it', 'the door takes the second card');
  await sleep(1800); // more than a poll
  ok(!(await evalIn(table, `${HELPERS} card('m-002')`)), 'held, it waits — the table does not move on its own');
  await press(table, 'ArrowRight');
  ok(await evalIn(table, `${HELPERS} until(() => card('m-002'), 5000)`, true), 'and the next → lands it');

  // -- a re-deal re-enacts the whole stream, deposits included (D28) --
  await press(table, 'd'); // full held table: d re-deals from empty
  ok(await evalIn(table, `${HELPERS} until(() => laid() < 5, 6000)`, true), 'd re-deals from an empty table');
  ok(await evalIn(table, `${HELPERS} until(() => card('m-001') && card('m-002'), 30000)`, true), 'both deposits re-enact in place (D28)');
  ok(!(await evalIn(table, `${HELPERS} card('a-017')`)), 'and meta is still held back');

  // -- m lands the tail: meta last, as the stream always meant (D52 closed) --
  await press(table, 'm');
  ok(await evalIn(table, `${HELPERS} until(() => card('a-017'), 8000)`, true), 'm lands the meta card, last of all');
  await shoot(table, 'meta-last');

  // -- the file is the log: two lines, one per confirmed card --
  const lines = readFileSync(DROP, 'utf8').split('\n').filter(Boolean);
  ok(lines.length === 2, `the drop file holds exactly the two deposits (${lines.length})`);
  ok(JSON.parse(lines[0]).artifact.provenance === 'mcp', 'each names its door');

  // -- a refusal never reaches the table --
  // named, so the stream's word on the media is what comes back (D121 refuses earlier)
  const bad = await door.deposit({ media: 'hologram', kind: 'work', people: ['R.'], title: 'not a thing' });
  ok(bad.result.isError === true && said(bad).startsWith('refused — unknown media'), `a bogus card is refused: ${said(bad)}`);
  await sleep(1500);
  ok(readFileSync(DROP, 'utf8').split('\n').filter(Boolean).length === 2, 'and the log is untouched by it');

  ok(table.noise.length === 0, `the console stayed clean${table.noise.length ? ` — ${table.noise.join(' | ')}` : ''}`);
} catch (err) {
  failures.push(String(err?.message ?? err));
  console.error('✘ e2e aborted:', err);
} finally {
  table?.close();
  door.close();
  shell.kill();
}

console.log(failures.length ? `\nFAIL — ${failures.length} problem(s)` : '\nPASS — the MCP door runs end to end');
process.exit(failures.length ? 1 : 0);
