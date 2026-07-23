// The room server over the wire: a real process on a real port, spoken to the
// way a phone and a session speak to it. Skips itself when mcp/node_modules is
// absent, so the page and the root test run stay dependency-free (D113).
//
//   cd mcp && npm install     then     node --test
//
// Dev-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAS_SDK = existsSync(join(ROOT, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk'));

const SEED = {
  events: [
    { e: 'deposit', night: 2, artifact: { id: 'a-001', media: 'note', kind: 'quest', title: 'a fold that will not close', people: ['R.'], provenance: 'curator', visibility: 'public', excerpt: { form: 'words', text: 'a fold that will not close' } } },
  ],
};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
const TOKEN = 'a-known-token';

// A desk of its own, on a port the OS picks, torn down with the test.
async function open() {
  const { createRoom } = await import('../mcp/room.mjs');
  const root = mkdtempSync(join(tmpdir(), 'desk-http-'));
  writeFileSync(join(root, 'seed.json'), JSON.stringify(SEED));
  mkdirSync(join(root, 'drop'), { recursive: true });
  writeFileSync(join(root, 'drop', 'people.json'), JSON.stringify({
    people: [{ name: 'E.', tokens: [TOKEN] }, { name: 'M.', tokens: [] }],
  }));
  // the pages the table needs, so the static allowlist can be exercised for real
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>the desk</title>');
  writeFileSync(join(root, 'deposit.html'), '<!doctype html><title>add your work</title>');
  writeFileSync(join(root, 'BRIEF.md'), 'the brief');
  writeFileSync(join(root, 'private.pdf'), 'budget figures');
  mkdirSync(join(root, 'js'), { recursive: true });
  writeFileSync(join(root, 'js', 'stream.js'), '// the log');

  const room = createRoom({ root });
  const port = await room.listen(0);
  const base = `http://localhost:${port}`;
  return {
    root, port, base, room,
    close: () => room.close(),
    get: (path, headers = {}) => fetch(`${base}${path}`, { headers: { host: `localhost:${port}`, ...headers } }),
    deposit: (body, headers = {}) => fetch(`${base}/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desk-token': TOKEN, ...headers },
      body: JSON.stringify(body),
    }),
  };
}

const lines = (root) => {
  const f = join(root, 'drop', 'stream.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};

const handCard = () => ({
  artifact: {
    media: 'image', kind: 'work', title: 'the fold, closed', people: ['R.'],
    excerpt: { form: 'crop', src: `data:image/png;base64,${PNG.toString('base64')}` },
    detail: { composition: [{ t: 'image', src: null, name: 'crane.png' }] },
  },
  blobs: { 'piece:0': { name: 'crane.png', type: 'image/png', b64: PNG.toString('base64') } },
});

// A JSON-RPC client that speaks streamable HTTP the way a session does.
async function rpc(base, token, body) {
  const res = await fetch(`${base}/mcp/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!text.trim()) return { status: res.status, body: null };
  // the transport answers as one JSON body or as an SSE frame — take whichever
  const framed = text.split('\n').find((l) => l.startsWith('data:'));
  return { status: res.status, body: JSON.parse(framed ? framed.slice(5).trim() : text) };
}

// fetch refuses to set Host — it is a forbidden header — so the one check that
// is entirely about Host has to be made the long way round.
function rawStatus(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
};

test('the hand door: a phone lays a card, and the log points at files rather than holding bytes', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const res = await d.deposit(handCard());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).laid, 'h-001');

    assert.equal(lines(d.root).length, 1);
    const raw = lines(d.root)[0];
    assert.ok(!raw.includes('data:'), 'no payload was written into the log (§9)');
    const a = JSON.parse(raw).artifact;
    assert.equal(a.provenance, 'hand');
    assert.deepEqual(a.people, ['R.'], 'a stated maker travels as stated');

    // and the file the log points at is served back, so the table can draw it
    const asset = await d.get(`/${a.excerpt.src}`);
    assert.equal(asset.status, 200);
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), PNG);
  } finally {
    await d.close();
  }
});

test('the hand door signs an unnamed card with the token’s own person', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const card = handCard();
    delete card.artifact.people;
    assert.equal((await d.deposit(card)).status, 200);
    assert.deepEqual(JSON.parse(lines(d.root)[0]).artifact.people, ['E.']);
  } finally {
    await d.close();
  }
});

test('a token the room does not know writes nothing, at either door', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const hand = await d.deposit(handCard(), { 'x-desk-token': 'made-up' });
    assert.equal(hand.status, 403);
    assert.match((await hand.json()).refused, /does not know that device/);

    const none = await d.deposit(handCard(), { 'x-desk-token': '' });
    assert.equal(none.status, 403);

    const session = await rpc(d.base, 'made-up', INIT);
    assert.equal(session.status, 403);
    assert.match(session.body.error.message, /does not know that device/);

    assert.equal(lines(d.root).length, 0, 'a stranger left no trace');
  } finally {
    await d.close();
  }
});

test('a write from another origin is refused — a page on the web cannot reach this table', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const res = await d.deposit(handCard(), { origin: 'https://evil.test' });
    assert.equal(res.status, 403);
    assert.match((await res.json()).refused, /the desk's own page/);
    assert.equal(lines(d.root).length, 0);
  } finally {
    await d.close();
  }
});

test('the desk answers to its own name only — a rebound host gets nothing', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    // a name on the open web pointed at this box: the address is right, the
    // name is not, and that is exactly what DNS rebinding looks like
    assert.equal(await rawStatus(d.port, '/', { Host: 'desk.evil.test' }), 421);
    assert.equal(await rawStatus(d.port, '/', { Host: `localhost:${d.port}` }), 200, 'its own name still opens');
    assert.equal(lines(d.root).length, 0);
  } finally {
    await d.close();
  }
});

test('the MCP door lays a card over HTTP, with the file inline and the author already known', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const hello = await rpc(d.base, TOKEN, INIT);
    assert.equal(hello.status, 200);
    assert.equal(hello.body.result.serverInfo.name, 'desk');

    const tools = await rpc(d.base, TOKEN, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const deposit = tools.body.result.tools.find((t) => t.name === 'deposit');
    assert.ok(deposit, 'one tool, and it is the deposit');
    assert.match(deposit.description, /knows you as E\./, 'the door stopped asking who is there');
    assert.match(deposit.description, /excerpt\.bytes/, 'and says how a file crosses a network');

    const laid = await rpc(d.base, TOKEN, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'deposit',
        arguments: {
          media: 'image', kind: 'work', title: 'the yard, at first light',
          excerpt: { bytes: PNG.toString('base64'), name: 'yard.png' },
        },
      },
    });
    assert.match(laid.body.result.content[0].text, /^m-001 · laid/);

    const a = JSON.parse(lines(d.root)[0]).artifact;
    assert.equal(a.provenance, 'mcp');
    assert.deepEqual(a.people, ['E.'], 'the token signed it, so the session never had to');
    assert.equal(a.excerpt.src, 'drop/assets/m-001.png');
    assert.deepEqual(readFileSync(join(d.root, a.excerpt.src)), PNG, 'the still travelled verbatim (D109)');
  } finally {
    await d.close();
  }
});

test('the MCP door refuses in the desk’s own words, and writes nothing', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    await rpc(d.base, TOKEN, INIT);
    const meta = await rpc(d.base, TOKEN, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'deposit', arguments: { media: 'note', kind: 'meta', title: 'the desk, v0' } },
    });
    assert.equal(meta.body.result.isError, true);
    assert.match(meta.body.result.content[0].text, /the meta card is the curator's/);
    assert.equal(lines(d.root).length, 0);
  } finally {
    await d.close();
  }
});

test('the table is served, and nothing else in the repo is', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    for (const path of ['/', '/index.html', '/deposit.html', '/js/stream.js', '/drop/stream.jsonl']) {
      assert.equal((await d.get(path)).status, 200, `${path} should be served`);
    }
    // the proposal's budget and its named invitees, the token table, and the
    // door's own source are nobody else's business on a room's network
    for (const path of ['/BRIEF.md', '/private.pdf', '/drop/people.json', '/mcp/core.mjs', '/package.json', '/seed.json/../BRIEF.md']) {
      const res = await d.get(path);
      assert.ok(res.status === 404 || res.status === 403, `${path} answered ${res.status} — it must not be served`);
    }
  } finally {
    await d.close();
  }
});

test('the desk says who it is holding, and who else it knows — never a token', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const res = await fetch(`${d.base}/whoami`, { headers: { 'x-desk-token': TOKEN } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'E.', 'so the page can open already signed');
    assert.deepEqual(body.people, ['E.', 'M.'], 'and an @ has the room to offer');
    assert.equal(JSON.stringify(body).includes(TOKEN), false, 'the way in is never handed back out');

    // a device the desk has never seen is exactly who the cohort is FOR
    const fresh = await (await fetch(`${d.base}/whoami`)).json();
    assert.equal(fresh.name, null, 'it does not pretend to know them');
    assert.deepEqual(fresh.people, ['E.', 'M.'], 'but it shows them the room, to tap their own name');
  } finally {
    await d.close();
  }
});

test('tapping a name claims it for this device, and a second device is its own way in', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  const tap = (name, headers = {}) => fetch(`${d.base}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ name }),
  });
  try {
    const first = await tap('M.');
    assert.equal(first.status, 200);
    const phone = await first.json();
    assert.equal(phone.name, 'M.');

    // that device can now lay a card, and it is signed without being asked
    const card = handCard();
    delete card.artifact.people;
    const laid = await d.deposit(card, { 'x-desk-token': phone.token });
    assert.equal(laid.status, 200);
    assert.deepEqual(JSON.parse(lines(d.root)[0]).artifact.people, ['M.']);

    const laptop = await (await tap('M.')).json();
    assert.notEqual(laptop.token, phone.token, 'a second device gets its own token');
    const both = await fetch(`${d.base}/whoami`, { headers: { 'x-desk-token': laptop.token } });
    assert.equal((await both.json()).name, 'M.', 'and both are the same person');

    const stranger = await tap('somebody else');
    assert.equal(stranger.status, 403);
    assert.match((await stranger.json()).refused, /not in this room/);

    const elsewhere = await tap('M.', { origin: 'https://evil.test' });
    assert.equal(elsewhere.status, 403, 'and a claim from another origin is no claim');
  } finally {
    await d.close();
  }
});

test('a person may be called something else, unless it is already someone', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  const say = (name, token) => fetch(`${d.base}/rename`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-desk-token': token },
    body: JSON.stringify({ name }),
  });
  try {
    // a card laid first keeps the name it was laid under
    const card = handCard();
    delete card.artifact.people;
    await d.deposit(card);
    assert.deepEqual(JSON.parse(lines(d.root)[0]).artifact.people, ['E.']);

    const taken = await say('M.', TOKEN);
    assert.equal(taken.status, 403);
    assert.match((await taken.json()).refused, /already someone here/);

    const done = await say('Emma Fell', TOKEN);
    assert.equal(done.status, 200);
    assert.equal((await done.json()).name, 'Emma Fell');
    assert.deepEqual((await (await fetch(`${d.base}/whoami`, { headers: { 'x-desk-token': TOKEN } })).json()).people, ['Emma Fell', 'M.']);

    // the card already on the table is untouched; the next one carries the new name
    assert.deepEqual(JSON.parse(lines(d.root)[0]).artifact.people, ['E.'], 'the log is never rewritten');
    const after = handCard();
    delete after.artifact.people;
    await d.deposit(after);
    assert.deepEqual(JSON.parse(lines(d.root)[1]).artifact.people, ['Emma Fell']);
  } finally {
    await d.close();
  }
});

test('the log is served uncached, and is empty rather than missing before the first deposit', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    const res = await d.get('/drop/stream.jsonl');
    assert.equal(res.status, 200, 'a table opening before anyone deposits is not an error');
    assert.equal(await res.text(), '');
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  } finally {
    await d.close();
  }
});

test('two doors, one log: the ids do not collide and the writes do not interleave', { skip: !HAS_SDK && 'mcp/npm install has not run' }, async () => {
  const d = await open();
  try {
    await rpc(d.base, TOKEN, INIT);
    const words = (n) => ({
      jsonrpc: '2.0', id: 10 + n, method: 'tools/call',
      params: { name: 'deposit', arguments: { media: 'note', kind: 'work', title: `note ${n}`, excerpt: { text: `note ${n}` } } },
    });
    // everything at once, the way a room of people would
    await Promise.all([
      d.deposit(handCard()), d.deposit(handCard()), d.deposit(handCard()),
      rpc(d.base, TOKEN, words(1)), rpc(d.base, TOKEN, words(2)),
    ]);
    const ids = lines(d.root).map((l) => JSON.parse(l).artifact.id);
    assert.equal(ids.length, 5, 'every card landed');
    assert.equal(new Set(ids).size, 5, 'and no two share an id — one process owns the log again (D112)');
    assert.deepEqual(ids.filter((i) => i.startsWith('h-')).sort(), ['h-001', 'h-002', 'h-003']);
    assert.deepEqual(ids.filter((i) => i.startsWith('m-')).sort(), ['m-001', 'm-002']);
  } finally {
    await d.close();
  }
});
