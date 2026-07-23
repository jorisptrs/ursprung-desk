// Who the room knows (BRIEF §7 step 5). One token per participant, registered
// once, and from then on both doors know who is depositing without asking per
// card — which is what D123 said this step would settle.
//
// The desk still signs for nobody (D121): the deliberate act is this
// registration, performed by the keeper with the person, rather than a machine
// guessing from whose laptop it happens to be running on.
//
//   node mcp/people.mjs add "E."      mint a token and print their two lines
//   node mcp/people.mjs list          who the room knows
//   node mcp/people.mjs remove <tok>  forget someone
//   node mcp/people.mjs sheet         a printable page of personal QRs
//
// drop/people.json is the token table, so it is gitignored with the rest of
// drop/ and the room server never serves it.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';

import QRCode from 'qrcode';

import { ROOT } from './core.mjs';
import { DEFAULT_PORT, peopleFileIn, readPeople } from './room.mjs';

const root = process.env.DESK_ROOT || ROOT;
const port = Number(process.env.DESK_PORT) || DEFAULT_PORT;
const say = (msg = '') => process.stdout.write(`${msg}\n`);

const lanAddress = () => {
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) if (!nic.internal && nic.family === 'IPv4') return nic.address;
  }
  return null;
};

const base = (host) => `http://${host}:${port}`;
const handDoor = (host, token) => `${base(host)}/deposit.html?t=${token}`;
const sessionDoor = (host, token) => `${base(host)}/mcp/${token}`;

function write(people) {
  const file = peopleFileIn(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(people, null, 2)}\n`);
  return file;
}

function add(name) {
  if (!name?.trim()) {
    say('a name — node mcp/people.mjs add "E."');
    process.exitCode = 1;
    return;
  }
  const people = readPeople(root);
  // 80 bits, URL-safe: long enough that guessing is not a way in, short enough
  // to sit in a line someone may have to read aloud once
  const token = randomBytes(10).toString('base64url');
  people[token] = { name: name.trim(), added: new Date().toISOString() };
  write(people);
  say(`${name.trim()} · registered`);
  // A card writes a person as @name in its text, and a mention stops at the
  // first space — so "Joris Peters" would sign as @Joris on a phone while the
  // session door carried the whole name, and the log would hold one person
  // under two names. Said here, at the one moment it can still be changed.
  if (/\s/.test(name.trim())) {
    say(`  note     a card signs this @${name.trim().split(/\s+/)[0]} — a name stops at the first space. Initials are the house style.`);
  }
  say(`  phone    ${handDoor('desk.local', token)}`);
  say(`  session  claude mcp add desk --transport http ${sessionDoor('desk.local', token)}`);
}

function list() {
  const people = readPeople(root);
  const tokens = Object.keys(people);
  if (!tokens.length) {
    say('nobody yet — node mcp/people.mjs add "<name>"');
    return;
  }
  for (const t of tokens) say(`  ${people[t].name ?? people[t]}  ${t}`);
}

function remove(token) {
  const people = readPeople(root);
  if (!people[token]) {
    say('no such token');
    process.exitCode = 1;
    return;
  }
  const gone = people[token].name ?? people[token];
  delete people[token];
  write(people);
  say(`${gone} · forgotten`);
}

// A page to print and cut up: one card per person, their name above their own
// door. The second, smaller code carries this machine's address instead of its
// name — `.local` is the least reliable thing about an Android phone, and a
// printed fallback costs nothing.
async function sheet() {
  const people = readPeople(root);
  const tokens = Object.keys(people);
  if (!tokens.length) {
    say('nobody yet — node mcp/people.mjs add "<name>"');
    process.exitCode = 1;
    return;
  }
  const ip = lanAddress();
  const svg = (text) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const cards = [];
  for (const t of tokens) {
    const name = people[t].name ?? people[t];
    const main = await svg(handDoor('desk.local', t));
    const alt = ip ? await svg(handDoor(ip, t)) : '';
    cards.push(`<figure class="card">
  <figcaption>${name.replace(/[<&]/g, '')}</figcaption>
  <div class="qr">${main}</div>
  <p>add your work</p>
  ${alt ? `<div class="qr qr--alt">${alt}</div><p class="alt">if the first does not open</p>` : ''}
</figure>`);
  }
  const html = `<!doctype html>
<meta charset="utf-8">
<title>the desk — personal doors</title>
<style>
  body { font-family: "Iowan Old Style", Palatino, Georgia, serif; margin: 2rem; color: #2b2418; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
  .card { border: 1px solid #d8cfbc; border-radius: 4px; padding: 1rem; margin: 0; text-align: center; break-inside: avoid; }
  figcaption { font-size: 1.2rem; margin-bottom: .5rem; }
  .qr svg { width: 100%; height: auto; }
  .qr--alt svg { width: 45%; }
  p { font-size: .75rem; color: #6f6350; margin: .4rem 0 0; }
  .alt { font-size: .65rem; }
  @media print { body { margin: 0 } }
</style>
<div class="sheet">${cards.join('\n')}</div>
`;
  const at = join(root, 'drop', 'qr.html');
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, html);
  say(`${tokens.length} ${tokens.length === 1 ? 'door' : 'doors'} → ${at}`);
  say(ip ? `  desk.local, with ${ip} as the fallback` : '  no LAN address found — only desk.local is on the sheet');
}

const [what, arg] = process.argv.slice(2);
if (what === 'add') add(arg);
else if (what === 'list') list();
else if (what === 'remove') remove(arg);
else if (what === 'sheet') await sheet();
else {
  say('node mcp/people.mjs add "<name>" | list | remove <token> | sheet');
  if (!existsSync(peopleFileIn(root))) say('(nobody registered yet)');
}
