// The room server (BRIEF §7 step 5). The laptop that drives the projector also
// serves the desk on the room's own network — one process owning the stream,
// the assets and the single-writer discipline, with two front doors onto it:
//
//   the hand door   POST /deposit      a phone, reached by a printed QR
//   the MCP door    ALL  /mcp/:token   a Claude session on someone's own laptop
//
// Both go through core.mjs, so they share every rule, every refusal and one
// log. Under stdio the desk had two writers racing for ids (D112); here one
// process owns the file again, and because the whole write path is synchronous
// the event loop cannot interleave two deposits.
//
// The desk is on the room's network, not the internet. Nothing here exposes it
// publicly, and doing so would be a separate decision with its own consent
// machinery.

import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createDeskSink, depositHand, dropFileIn, isMainModule, MAX_ASSET_BYTES, Refusal, ROOT } from './core.mjs';
import { createServer as createDeskMcp } from './server.mjs';

export const DEFAULT_PORT = 8080; // under 1024 needs root on macOS, and a QR hides a port anyway
// base64 inflates by a third, and a card may carry an original plus its pieces
const BODY_LIMIT = `${Math.ceil((MAX_ASSET_BYTES * 4) / 3 / (1 << 20)) * 2}mb`;

const say = (msg) => process.stdout.write(`desk: ${msg}\n`);
const warn = (msg) => process.stderr.write(`desk: ${msg}\n`);
const plain = (err) => String(err?.message ?? err).replace(/^stream reject: /, '');

// ---- who is at the door ----

// One token per participant, registered once (mcp/people.mjs), carried into a
// phone by their printed QR and into a session by the URL they were given.
// The desk still signs for nobody (D121): the deliberate act is the
// registration, and a card from an unknown token is refused rather than laid
// anonymously. Read per request, so the keeper can add someone mid-retreat
// without restarting the room.
export const peopleFileIn = (root) => join(root, 'drop', 'people.json');

export function readPeople(root = ROOT) {
  const file = peopleFileIn(root);
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (err) {
    warn(`people.json unreadable — ${plain(err)}`);
    return {};
  }
}

export function whoIs(root, token) {
  if (typeof token !== 'string' || !token.trim()) return null;
  const entry = readPeople(root)[token.trim()];
  const name = typeof entry === 'string' ? entry : entry?.name;
  return typeof name === 'string' && name.trim() ? { token: token.trim(), name: name.trim() } : null;
}

const UNKNOWN = 'this desk does not know that token — ask the keeper for your own';

// Everyone the room knows, by name, in the order they were registered. This is
// what an `@` offers: on a communal table the people are the room, and a name
// typed from a list is a name spelled the way its owner spells it — which is
// the only way `people` stays one person per name rather than three spellings
// of E. Tokens are never in here; they are the way in, not a fact about anyone.
export function roster(root = ROOT) {
  const names = [];
  for (const entry of Object.values(readPeople(root))) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (typeof name === 'string' && name.trim() && !names.includes(name.trim())) names.push(name.trim());
  }
  return names;
}

// ---- what the desk answers to ----

// A stable name and this machine's own addresses, nothing else. Host checking
// is what stops a page on the open web from resolving a name to this box and
// talking to it; the SDK's own option for that is deprecated in favour of
// exactly this middleware.
export function knownHosts(port, extra = []) {
  const names = ['desk.local', 'localhost', '127.0.0.1', '[::1]', '::1', ...extra];
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) {
      if (nic.internal) continue;
      names.push(nic.family === 'IPv6' ? `[${nic.address}]` : nic.address);
    }
  }
  const hosts = new Set();
  for (const n of names) {
    hosts.add(n.toLowerCase());
    hosts.add(`${n}:${port}`.toLowerCase());
  }
  return hosts;
}

// A browser sends Origin on every cross-origin write, so a site a participant
// happens to be reading on the castle wifi cannot post a card onto the table.
// A session speaking JSON-RPC sends none, and carries a token instead.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === String(req.headers.host ?? '').toLowerCase();
  } catch {
    return false;
  }
}

// ---- blobs over the wire ----

// The sheet's blobs are Files; across a network they are their three parts.
export function decodeBlobs(raw = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, b] of Object.entries(raw)) {
    if (!b || typeof b !== 'object' || typeof b.b64 !== 'string') continue;
    const bytes = Buffer.from(b.b64, 'base64');
    if (!bytes.length) throw new Refusal(`${b.name ?? key} did not decode`);
    if (bytes.length > MAX_ASSET_BYTES) throw new Refusal(`${b.name ?? key} is over 25 MB`);
    out[key] = { name: typeof b.name === 'string' ? b.name : '', type: typeof b.type === 'string' ? b.type : '', bytes };
  }
  return out;
}

// ---- the room ----

export function createRoom({ root = ROOT, port = DEFAULT_PORT } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Built from the port actually bound, not the one asked for: listen(0) lets
  // the OS choose, and a desk that will not answer to its own address is no
  // safer, only broken.
  let hosts = knownHosts(port);

  app.use((req, res, next) => {
    const host = String(req.headers.host ?? '').toLowerCase();
    if (!hosts.has(host)) {
      res.status(421).type('text/plain').send('this desk answers to its own name only\n');
      return;
    }
    next();
  });

  // -- the two write doors --

  const writeGuard = (req, res, next) => {
    if (!sameOrigin(req)) {
      res.status(403).json({ refused: "a card is laid from the desk's own page, not from somewhere else" });
      return;
    }
    next();
  };

  // Who the sheet is holding, so a page can open already signed, and who else
  // is in the building, so an @ can offer them. Names only, both times — the
  // tokens are the way in and never leave the room machine.
  app.get('/whoami', (req, res) => {
    const who = whoIs(root, req.get('x-desk-token') ?? req.query.t);
    if (!who) {
      res.status(403).json({ refused: UNKNOWN });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ name: who.name, people: roster(root) });
  });

  app.post('/deposit', writeGuard, express.json({ limit: BODY_LIMIT }), (req, res) => {
    const who = whoIs(root, req.get('x-desk-token'));
    if (!who) {
      res.status(403).json({ refused: UNKNOWN });
      return;
    }
    try {
      const blobs = decodeBlobs(req.body?.blobs);
      const { id } = depositHand(req.body?.artifact, blobs, {
        root, warn, author: who.name, sink: createDeskSink({ root, prefix: 'h', warn }),
      });
      say(`${id} · laid — ${who.name}, by hand`);
      res.json({ laid: id });
    } catch (err) {
      // Refused, never coerced (D34/D107) — the door's words or the stream's.
      res.status(400).json({ refused: plain(err) });
    }
  });

  // Stateless (sessionIdGenerator undefined): a transport and a server per
  // request, so nothing is held between calls, a restart costs no one their
  // session, and there is no session table to expire. The author is baked into
  // the server the token resolved to, so the tool never has to ask.
  app.all('/mcp/:token', writeGuard, express.json({ limit: BODY_LIMIT }), async (req, res) => {
    const who = whoIs(root, req.params.token);
    if (!who) {
      res.status(403).json({ jsonrpc: '2.0', error: { code: -32001, message: UNKNOWN }, id: null });
      return;
    }
    const server = createDeskMcp({ root, author: who.name, remote: true });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      warn(`mcp door — ${plain(err)}`);
      if (!res.headersSent) res.status(500).end();
    }
  });

  // -- the table, and only the table --
  //
  // Never express.static(root). The repo root holds things that are nobody
  // else's business — the proposal PDF with its budget and its named invitees,
  // and drop/people.json, which is the token table itself. What the desk shows
  // is listed, and everything else is simply not there.

  const file = (url, at, headers = {}) => app.get(url, (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.set(k, v);
    res.sendFile(join(root, at));
  });

  file('/', 'index.html');
  file('/index.html', 'index.html');
  file('/deposit.html', 'deposit.html');
  file('/desk.css', 'desk.css');
  file('/desk.js', 'desk.js');
  file('/seed.json', 'seed.json');
  // the log the table watches: always the file as it is on disk, never a copy
  // a proxy or a browser kept (D105)
  app.get('/drop/stream.jsonl', (req, res) => {
    const at = dropFileIn(root);
    res.set('Cache-Control', 'no-store');
    if (!existsSync(at)) {
      res.type('application/x-ndjson').send('');
      return;
    }
    res.sendFile(at);
  });
  for (const dir of ['js', 'vendor', 'assets']) {
    app.use(`/${dir}`, express.static(join(root, dir), { fallthrough: false, index: false }));
  }
  app.use('/drop/assets', express.static(join(root, 'drop', 'assets'), { fallthrough: false, index: false }));

  app.use((req, res) => res.status(404).type('text/plain').send('nothing here\n'));

  let server = null;
  return {
    app,
    hosts: () => hosts,
    listen: (onPort = port) => new Promise((done) => {
      server = app.listen(onPort, '0.0.0.0', () => {
        const bound = server.address().port;
        hosts = knownHosts(bound);
        done(bound);
      });
    }),
    close: () => new Promise((done) => (server ? server.close(() => done()) : done())),
  };
}

// ---- run it ----

if (isMainModule(import.meta.url)) {
  const root = process.env.DESK_ROOT || ROOT;
  const port = Number(process.env.DESK_PORT) || DEFAULT_PORT;
  const room = createRoom({ root, port });
  await room.listen(port);

  const people = Object.keys(readPeople(root)).length;
  say(`the desk is open on ${port}`);
  say(`  the table   http://desk.local:${port}/?live`);
  say(`  the QR      http://desk.local:${port}/deposit.html?t=<token>`);
  say(`  a session   claude mcp add desk --transport http http://desk.local:${port}/mcp/<token>`);
  say(people
    ? `  ${people} ${people === 1 ? 'person' : 'people'} registered`
    : '  nobody registered yet — node mcp/people.mjs add "<name>"');
}
