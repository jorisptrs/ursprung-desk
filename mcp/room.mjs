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

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { appendEvent, createDeskSink, depositHand, dropFileIn, isMainModule, MAX_ASSET_BYTES, readStream, Refusal, ROOT } from './core.mjs';
import { createServer as createDeskMcp } from './server.mjs';

export const DEFAULT_PORT = 8080; // under 1024 needs root on macOS, and a QR hides a port anyway
// base64 inflates by a third, and a card may carry an original plus its pieces
const BODY_LIMIT = `${Math.ceil((MAX_ASSET_BYTES * 4) / 3 / (1 << 20)) * 2}mb`;

const say = (msg) => process.stdout.write(`desk: ${msg}\n`);
const warn = (msg) => process.stderr.write(`desk: ${msg}\n`);
const plain = (err) => String(err?.message ?? err).replace(/^stream reject: /, '');

// ---- who is at the door ----

// The cohort, and the devices that have claimed a place in it (keeper's ruling
// 2026-07-23). The keeper seeds names only; a token is minted when someone
// taps their own name on a device, and a person may hold several — a phone and
// a laptop are one person with two ways in.
//
// What this costs, said plainly: one QR on a wall means anyone on the room's
// network can claim any unclaimed name. **The desk trusts the room.** That is
// the same trust the table itself runs on — a communal surface among invited
// people — and it is why none of this is exposed beyond the LAN. The desk
// still signs for nobody (D121): tapping your own name is the deliberate act
// that used to be the keeper handing you a slip.
//
// Read per request, so the keeper can add someone mid-retreat without a restart.
export const peopleFileIn = (root) => join(root, 'drop', 'people.json');

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
export const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export function readPeople(root = ROOT) {
  const file = peopleFileIn(root);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const list = Array.isArray(raw?.people) ? raw.people : [];
    return list
      .map((p) => ({
        name: clean(p?.name),
        tokens: Array.isArray(p?.tokens) ? p.tokens.filter((t) => clean(t)) : [],
        claimedAt: p?.claimedAt ?? null,
      }))
      .filter((p) => p.name);
  } catch (err) {
    warn(`people.json unreadable — ${plain(err)}`);
    return [];
  }
}

export function writePeople(root, people) {
  const file = peopleFileIn(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ people }, null, 2)}\n`);
  return file;
}

export function whoIs(root, token) {
  const t = clean(token);
  if (!t) return null;
  const person = readPeople(root).find((p) => p.tokens.includes(t));
  return person ? { token: t, name: person.name } : null;
}

const UNKNOWN = 'this desk does not know that device — scan the desk’s code and tap your name';

// Everyone the room knows, by name, in the order the keeper seeded them. This
// is what an `@` offers: on a communal table the people are the room, and a
// name picked from the list is spelled the way its owner spells it — which is
// what keeps `people` one person per name rather than three spellings of the
// same one. Tokens are never in here; they are a way in, not a fact about
// anyone, and they never leave this machine.
export const roster = (root = ROOT) => readPeople(root).map((p) => p.name);

// The cards a person laid and still has on the table — the picker's stock. Read
// from the log the same way the table is, retired ids dropped so nobody builds on
// a card that is gone. Each card carries what its FACE needs — the picker draws it
// as it lies on the table (D163), front only, so the back and its bytes stay home.
export function myCards(root = ROOT, name) {
  if (!name) return [];
  const { stream } = readStream({ root });
  const events = stream.all();
  const retired = new Set(events.filter((e) => e.e === 'retire').map((e) => e.id));
  const cards = [];
  for (const e of events) {
    if (e.e !== 'deposit') continue;
    const a = e.artifact;
    if (!a || retired.has(a.id)) continue;
    if (!Array.isArray(a.people) || !a.people.includes(name)) continue;
    cards.push({ id: a.id, media: a.media, kind: a.kind, title: a.title, caption: a.caption, people: a.people, excerpt: a.excerpt });
  }
  return cards;
}

// Tapping your own name on a device. A person may claim on as many devices as
// they carry; each gets its own token, all of them the same person.
export function claim(root, name) {
  const people = readPeople(root);
  const person = people.find((p) => sameName(p.name, name));
  if (!person) return { refused: 'that name is not in this room’s cohort — ask the keeper to add it' };
  const token = randomBytes(10).toString('base64url');
  person.tokens.push(token);
  person.claimedAt ??= new Date().toISOString();
  writePeople(root, people);
  return { token, name: person.name };
}

// Renaming binds what comes after, never what is already laid: the log is
// append-only, so cards deposited under the old name keep it. A name is a
// person here, so two people may not answer to one name.
export function rename(root, token, next) {
  const wanted = clean(next);
  if (!wanted) return { refused: 'a name, please' };
  const people = readPeople(root);
  const person = people.find((p) => p.tokens.includes(clean(token)));
  if (!person) return { refused: UNKNOWN };
  if (people.some((p) => p !== person && sameName(p.name, wanted))) {
    return { refused: `${wanted} is already someone here — pick another` };
  }
  const was = person.name;
  person.name = wanted;
  writePeople(root, people);
  // The new name takes a place on the table at once, rather than waiting for
  // its first card (D152). The old one keeps the place it was given — cards laid
  // under it still carry it, and the log is not rewritten (D138).
  try { appendEvent(root, { e: 'roster', night: 0, people: [wanted] }); } catch { /* the table is not the registry's business */ }
  return { name: wanted, was };
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

  // Who this device is, and who is in the room. Unlike every other read, this
  // one answers a device the desk does not know yet — that is the whole point:
  // it is what a freshly scanned phone sees, and the cohort is the list it taps
  // its own name from. Names only, always; the tokens never leave this machine.
  app.get('/whoami', (req, res) => {
    const who = whoIs(root, req.get('x-desk-token') ?? req.query.t);
    res.set('Cache-Control', 'no-store');
    res.json({ name: who?.name ?? null, people: roster(root) });
  });

  // The token-holder's own cards, for the sheet's "builds on…" picker. Own work
  // only (v1): a person lays a follow-up to a card they already laid, so the
  // list is theirs alone — someone else's cards never appear here. Needs the
  // token, like a write; a device the desk does not know gets nothing.
  app.get('/mine', (req, res) => {
    const who = whoIs(root, req.get('x-desk-token') ?? req.query.t);
    res.set('Cache-Control', 'no-store');
    if (!who) {
      res.status(403).json({ refused: UNKNOWN });
      return;
    }
    res.json({ name: who.name, cards: myCards(root, who.name) });
  });

  // Tapping your own name. The device is handed a token and remembers it, so
  // this happens once per device rather than once per card.
  app.post('/claim', writeGuard, express.json({ limit: '16kb' }), (req, res) => {
    const out = claim(root, req.body?.name);
    if (out.refused) {
      res.status(403).json(out);
      return;
    }
    say(`${out.name} · claimed a device`);
    res.json(out);
  });

  // And changing it afterwards. Cards already laid keep the name they were
  // laid under — this binds what comes next.
  app.post('/rename', writeGuard, express.json({ limit: '16kb' }), (req, res) => {
    const out = rename(root, req.get('x-desk-token'), req.body?.name);
    if (out.refused) {
      res.status(403).json(out);
      return;
    }
    say(`${out.was} · now ${out.name}`);
    res.json(out);
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
        root, warn, author: who.name, buildsOn: req.body?.buildsOn, sink: createDeskSink({ root, prefix: 'h', warn }),
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
  // alternate seeds the table may be pointed at with ?seed= (a demo set); listed
  // by name, like everything else the room serves, so nothing else in root leaks
  file('/seed-mocks.json', 'seed-mocks.json');
  file('/seed-demo.json', 'seed-demo.json');
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

  const people = readPeople(root);
  const claimed = people.filter((p) => p.tokens.length).length;
  say(`the desk is open on ${port}`);
  // two views of one table: the shoot's, which deals itself and holds the meta
  // card back, and the room's, which starts held under the driver's own keys
  say(`  the take    http://desk.local:${port}/?live&tail=1`);
  say(`  the room    http://desk.local:${port}/?rig&live`);
  say(`  the one QR  http://desk.local:${port}/deposit.html`);
  say(people.length
    ? `  ${people.length} in the cohort, ${claimed} claimed`
    : '  nobody in the cohort yet — node mcp/people.mjs add "<name>"');
}
