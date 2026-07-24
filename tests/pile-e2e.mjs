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
  // The threads between the last card and the arrangement move nothing, so "the
  // cards stopped" is true for a moment BEFORE the map settles. Wait for all the
  // cards, then for the big move the arrangement makes, and only then for
  // stillness — else the pile opens against places the table is about to leave.
  let base = null;
  for (let i = 0; i < 70 && !base; i++) {
    await sleep(1000);
    const g = await geom();
    if (g.length >= 81) base = g;
  }
  ok(base && base.length === 81, `the crowd surface laid ${base?.length} cards`);

  // a model card turns to its 3D (D190): its back carries the mount and the
  // render poster — the DOM wiring, checked without WebGL (GPU varies headless;
  // the live turntable is drilled in the standalone model probe)
  ok(await evalIn(`(() => {
    const el = [...document.querySelectorAll('.card--model')].find((e) => e.querySelector('.card__back [data-model]'));
    return !!el && el.querySelector('[data-model]').dataset.model.endsWith('.obj') && !!el.querySelector('.back__model-poster') && !el.querySelector('.back__front');
  })()`), 'a model card carries its 3D mount and render poster, the flat render not repeated (D190)');
  let cards = base;
  let still = 0;
  let sawArrange = false;
  for (let i = 0; i < 45 && still < 2; i++) {
    await sleep(1000);
    const now = await geom();
    if (now.some((c) => { const b = base.find((o) => o.id === c.id); return b && Math.hypot(c.x - b.x, c.y - b.y) > 80; })) sawArrange = true;
    still = ((sawArrange || i >= 10) && JSON.stringify(now) === JSON.stringify(cards)) ? still + 1 : 0;
    cards = now;
  }
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
  // a studio that has both its own work and a work made with somebody else, so
  // opening it can be shown to gather the whole thread of thinking (D173)

  const bigFirst = stacks.sort((a, b) => b.length - a.length);
  const deep = bigFirst.find((g) => g.length >= 3 && g.some((c) => backed.includes(c.id))) ?? bigFirst[0];
  ok(deep.length >= 3, `the deepest pile holds ${deep.length}`);
  const top = deep.sort((a, b) => b.z - a.z)[0];

  await click(top.x + top.w / 2, top.y + top.h / 2);
  await shot('1-open');
  // Whatever was opened, everything in it was made by the same hands: a
  // studio gathers that person's collaborations into their own timeline (D173),
  // and a shared place holds only what those hands made together.
  const gathered = await evalIn(`(() => {
    const lit = [...document.querySelectorAll('.card[data-lit]')];
    const names = lit.map((el) => (el.querySelector('.card__by')?.textContent || '')
      .split(' ').filter((w) => w.startsWith('@')));
    const common = names.length ? names[0].filter((n) => names.every((s) => s.includes(n))) : [];
    return { total: lit.length, visiting: lit.filter((el) => el.hasAttribute('data-shared')).length, common };
  })()`);
  ok(gathered.common.length > 0, `everything opened was made by the same hands (${gathered.common.join(' ')})`);
  ok(gathered.visiting <= gathered.total, `${gathered.visiting} of ${gathered.total} are works made with somebody else`);
  const opened = await geom();
  // the pile is whatever the fold says it is, not whatever lay near it
  const lit = await evalIn(`[...document.querySelectorAll('.card[data-lit]')].map((el) => el.dataset.id)`);
  ok(lit.length >= 2, `the whole pile is lit — ${lit.length} cards`);
  const spread = lit.map((id) => opened.find((o) => o.id === id));
  ok(spread.every(Boolean), 'and every one of them is on the table');
  const was = new Map(cards.map((c) => [c.id, c]));
  const moved = spread.filter((c) => Math.hypot(c.x - was.get(c.id).x, c.y - was.get(c.id).y) > 4).length;
  ok(moved >= spread.length - 1, `the tap spread the pile — ${moved} of ${spread.length} cards moved`);
  ok(spread.every((c) => c.z >= 300), 'and the open pile lifted above the table');
  const onTable = spread.every((c) => c.x >= -1 && c.y >= -1 && c.x + c.w <= 1601 && c.y + c.h <= 1001);
  ok(onTable, 'the whole spread stayed in the light');
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  let worst = 0;
  for (let i = 0; i < spread.length; i++) {
    for (let j = i + 1; j < spread.length; j++) worst = Math.max(worst, overlap(spread[i], spread[j]) / (spread[i].w * spread[i].h));
  }
  ok(worst === 0, `and no card of the open pile covers another (worst overlap ${(worst * 100).toFixed(0)}%)`);
  ok(await evalIn("document.getElementById('field').hasAttribute('data-reading')"),
    'the rest of the table stepped back while the pile is open');

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
  ok(await evalIn("document.getElementById('field').hasAttribute('data-reading')"),
    'and the table stepped back around the card in hand');

  // a recording plays where it lies rather than fetching a file (D147), on the
  // desk's own transport rather than the browser's (D151)
  const sound = await evalIn(`(() => {
    for (const el of document.querySelectorAll('.card--backed')) {
      const wrap = el.querySelector('[data-plays]');
      const media = wrap?.querySelector('audio, video');
      if (!media) continue;
      return { id: el.dataset.id, tag: media.tagName, src: media.getAttribute('src'),
               mark: wrap.querySelector('[data-mark]')?.dataset.mark,
               seek: !!wrap.querySelector('[data-seek]'),
               native: media.controls,
               links: [...el.querySelectorAll('.back__line')].map((a) => a.getAttribute('href')) };
    }
    return null;
  })()`);
  ok(sound, `a recording is a player on the back (${sound?.tag ?? 'none found'})`);
  ok(sound?.mark === 'play' && sound?.seek, 'with a mark to press and a line to travel');
  ok(!sound?.native, 'and none of the browser’s own chrome on the parchment');
  ok(!(sound?.links ?? []).some((h) => /\.(m4a|mp3|wav|mp4|mov|webm)$/i.test(h ?? '')),
    'and no line beside it that would fetch the same file instead');

  // put it back down while the pile is still open: it belongs above the table
  // with the rest of its pile, not under whatever studio lies beside it
  await click(pick.x + pick.w / 2, pick.y + pick.h / 2);
  await sleep(900);
  await shot('3-laid-again');
  const again = (await geom()).find((c) => c.id === pick.id);
  ok(again.z >= 300, `laid back down it stays above the table (z ${again.z})`);
  ok(Math.abs(again.w - pick.w) < 2, 'and at the size it lay at');
  const covers = (await geom()).filter((c) => c.id !== pick.id && c.z > again.z
    && c.x < again.x + again.w && c.x + c.w > again.x && c.y < again.y + again.h && c.y + c.h > again.y);
  ok(!covers.length, `and nothing lies over it (${covers.map((c) => c.id).join(', ')})`);
  // and it can be picked up again
  await click(again.x + again.w / 2, again.y + again.h / 2);
  await sleep(900);
  const twice = (await geom()).find((c) => c.id === pick.id);
  ok(twice.w > pick.w * 1.4, 'a second turn reads it again');
  await click(twice.x + twice.w / 2, twice.y + twice.h / 2);
  await sleep(900);
  ok((await geom()).find((c) => c.id === pick.id).z >= 300, 'and it comes back to the pile again');

  // The wood steps back one thing at a time (D174): with a card in hand, the
  // first tap lays it down and leaves the pile spread; only the next shuts it.
  const nowAt = (await geom()).find((c) => c.id === pick.id); // it was laid back down above
  await click(nowAt.x + nowAt.w / 2, nowAt.y + nowAt.h / 2); // pick it up again
  await sleep(900);
  ok((await geom()).find((c) => c.id === pick.id).w > pick.w * 1.4, 'a card is in hand again');
  const away = await evalIn(`(() => {
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
  await click(away.x, away.y);
  await sleep(900);
  const laid = (await geom()).find((c) => c.id === pick.id);
  ok(Math.abs(laid.w - pick.w) < 2, 'a tap on the wood laid the card down');
  ok(await evalIn("document.querySelectorAll('.card[data-lit]').length > 1"),
    'and left its pile open, where it was being read from');

  // and the help goes away when you look elsewhere (D174)
  await evalIn(`document.querySelector('.keys-btn').click()`);
  ok(await evalIn(`document.querySelector('.keys').classList.contains('open')`), 'the ? opens');
  await click(away.x, away.y);
  ok(!(await evalIn(`document.querySelector('.keys').classList.contains('open')`)), 'and a tap anywhere else shuts it');

  // and the wood puts everything back. One wood tap steps back one thing (D174),
  // so the tap that shut the ? may already have closed the pile; tap again only
  // if it is still open, since a wood tap on a closed table starts a scrub.
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
  if (await evalIn(`document.getElementById('field').hasAttribute('data-reading')`)) await click(wood.x, wood.y);
  await sleep(700); // let the close settle before measuring (MOVE_MS 620)
  await shot('3-closed');
  const back = await geom();
  const drift = spread.map((c) => {
    const now = back.find((o) => o.id === c.id);
    return Math.hypot(now.x - was.get(c.id).x, now.y - was.get(c.id).y);
  });
  ok(Math.max(...drift) < 4, `a tap on the wood laid the pile back where it was (worst ${Math.max(...drift).toFixed(1)}px)`);

  await cdp.close();
  shell.kill();
  console.log(failures.length ? `\n${failures.length} failed` : '\nall good · stills in /tmp/desk-shots/pile-*.png');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); shell.kill(); process.exit(1); });
