// Dev-only drive of the pile's two-beat over CDP — not part of `npm test` (it
// wants the static server up on :8123 and the Playwright headless shell):
//
//   python3 -m http.server 8123 &   then   node tests/pile-e2e.mjs
//
// The gesture is D115's, borrowed from the editor's deck: the first tap on a
// studio spreads its pile, the second takes a card in hand, and a tap on the
// wood puts the pile back. Runs against ?castle, the crowd surface, because a
// pile is only worth opening on a table too dense to read whole. Stills land in
// /tmp/desk-shots/pile-*.png. Does not ship.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const SHELL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = 9335;
const failures = [];
const ok = (cond, label) => {
  console.log(`${cond ? '✔' : '✘'} ${label}`);
  if (!cond) failures.push(label);
};

mkdirSync('/tmp/desk-shots', { recursive: true });
rmSync('/tmp/desk-pile-profile', { recursive: true, force: true });
const shell = spawn(SHELL, [
  '--headless', '--disable-gpu', '--window-size=1600,1000', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/desk-pile-profile',
  'http://localhost:8123/?castle', // not ?cursor= — that surface is a still, with no hands on it (D62)
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
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
        console.log('  [exception]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description ?? '');
        failures.push('page threw');
      }
    };
    ws.onerror = () => reject(new Error('ws failed'));
  });
}

async function main() {
  await sleep(1400);
  const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const evalIn = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  };
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`/tmp/desk-shots/pile-${name}.png`, Buffer.from(data, 'base64'));
  };
  const click = async (x, y) => {
    const base = { x, y, button: 'left', clickCount: 1 };
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
    await sleep(450);
  };
  // where a card lies right now, and how much of it another card covers
  const geom = () => evalIn(`(() => {
    const out = [];
    for (const el of document.querySelectorAll('.card')) {
      const r = el.getBoundingClientRect();
      out.push({ id: el.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height, z: +getComputedStyle(el).zIndex || 0 });
    }
    return out;
  })()`);

  // The opening pass lays the whole stream before anything can be touched — and
  // the last event is the arrangement, which moves every studio at once. So wait
  // for the table to stop moving, not merely for the last card to arrive.
  let cards = [];
  let still = 0;
  for (let i = 0; i < 60 && still < 2; i++) {
    await sleep(1000);
    const now = await geom();
    still = now.length >= 101 && JSON.stringify(now) === JSON.stringify(cards) ? still + 1 : 0;
    cards = now;
  }
  ok(cards.length === 101, `the crowd surface laid ${cards.length} cards`);
  await shot('0-laid');

  // a studio with a pile worth opening: the deepest stack on the table. A pile
  // cascades, so its cards are near each other rather than on each other —
  // cluster by centre, the way an eye would.
  const centre = (c) => [c.x + c.w / 2, c.y + c.h / 2];
  const stacks = [];
  for (const c of cards) {
    const [cx, cy] = centre(c);
    const near = stacks.find((g) => g.some((o) => { const [ox, oy] = centre(o); return Math.hypot(cx - ox, cy - oy) < 40; }));
    if (near) near.push(c); else stacks.push([c]);
  }
  // and one that holds something worth reading, so the second beat has a target
  const backed = await evalIn(`[...document.querySelectorAll('.card--backed')].map((el) => el.dataset.id)`);
  const bigFirst = stacks.sort((a, b) => b.length - a.length);
  const deep = bigFirst.find((g) => g.length >= 3 && g.some((c) => backed.includes(c.id))) ?? bigFirst[0];
  ok(deep.length >= 3, `the deepest pile holds ${deep.length}`);
  const top = deep.sort((a, b) => b.z - a.z)[0];

  await click(top.x + top.w / 2, top.y + top.h / 2);
  await shot('1-open');
  const opened = await geom();
  const spread = deep.map((c) => opened.find((o) => o.id === c.id));
  const moved = spread.filter((c, i) => Math.hypot(c.x - deep[i].x, c.y - deep[i].y) > 4).length;
  ok(moved >= deep.length - 1, `the tap spread the pile — ${moved} of ${deep.length} cards moved`);
  ok(spread.every((c) => c.z >= 300), 'and the open pile lifted above the table');
  const onTable = spread.every((c) => c.x >= -1 && c.y >= -1 && c.x + c.w <= 1601 && c.y + c.h <= 1001);
  ok(onTable, 'the whole spread stayed in the light');
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  let worst = 0;
  for (let i = 0; i < spread.length; i++) {
    for (let j = i + 1; j < spread.length; j++) worst = Math.max(worst, overlap(spread[i], spread[j]) / (spread[i].w * spread[i].h));
  }
  ok(worst < 0.12, `and the spread cards barely touch (worst overlap ${(worst * 100).toFixed(0)}%)`);

  // the second beat: a card of the open pile comes into the hand
  const pick = spread.find((c) => backed.includes(c.id)) ?? spread[spread.length - 1];
  ok(backed.includes(pick.id), 'the pile holds something with a back to read');
  await click(pick.x + pick.w / 2, pick.y + pick.h / 2);
  await sleep(700);
  await shot('2-in-hand');
  const held = (await geom()).find((c) => c.id === pick.id);
  ok(held.w > pick.w * 1.4, `the second tap read the card (${Math.round(pick.w)}px → ${Math.round(held.w)}px)`);
  const threads = await evalIn("document.querySelectorAll('.thread').length");
  ok(threads > 0, `${threads} threads drawn`);

  // and the wood puts everything back — a point inside the light with nothing on it
  const wood = await evalIn(`(() => {
    const f = document.getElementById('field');
    const r = f.getBoundingClientRect();
    for (let y = r.top + 8; y < r.bottom - 8; y += 7) {
      for (let x = r.left + 8; x < r.right - 8; x += 7) {
        const el = document.elementFromPoint(x, y);
        if (el && f.contains(el) && !el.closest('.card') && !el.closest('button')) return { x, y };
      }
    }
    return null;
  })()`);
  ok(wood, 'there is bare wood left to tap');
  await click(wood.x, wood.y);
  await shot('3-closed');
  const back = await geom();
  const rest = deep.map((c) => back.find((o) => o.id === c.id));
  const drift = rest.map((c, i) => Math.hypot(c.x - deep[i].x, c.y - deep[i].y));
  ok(Math.max(...drift) < 4, `a tap on the wood laid the pile back where it was (worst ${Math.max(...drift).toFixed(1)}px)`);

  await cdp.close();
  shell.kill();
  console.log(failures.length ? `\n${failures.length} failed` : '\nall good · stills in /tmp/desk-shots/pile-*.png');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); shell.kill(); process.exit(1); });
