// The cohort (BRIEF §7 step 5, keeper's ruling 2026-07-23). The keeper seeds
// the names; nobody is handed a credential. One QR goes on the wall, everyone
// scans the same one, and each person taps their own name — the device
// remembers it from then on, and a person may claim on as many devices as they
// carry.
//
//   node mcp/people.mjs add "E."      put someone in the cohort
//   node mcp/people.mjs list          who is in it, and who has claimed
//   node mcp/people.mjs remove "E."   take someone out
//   node mcp/people.mjs qr            the one code, as a printable page
//
// The desk still signs for nobody (D121): tapping your own name is the
// deliberate act. What it costs is stated where it lives, in room.mjs — one
// code on a wall means the desk trusts the room, which is the same trust the
// table itself runs on, and why none of it is exposed beyond the LAN.
//
// drop/people.json holds the device tokens, so it is gitignored with the rest
// of drop/ and the room server never serves it.

import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import QRCode from 'qrcode';

import { ROOT, appendEvent } from './core.mjs';
import { DEFAULT_PORT, peopleFileIn, readPeople, writePeople, sameName } from './room.mjs';

const root = process.env.DESK_ROOT || ROOT;
const port = Number(process.env.DESK_PORT) || DEFAULT_PORT;
const say = (msg = '') => process.stdout.write(`${msg}\n`);

const lanAddress = () => {
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) if (!nic.internal && nic.family === 'IPv4') return nic.address;
  }
  return null;
};

const doorAt = (host) => `http://${host}:${port}/deposit.html`;

function add(name) {
  if (!name?.trim()) {
    say('a name — node mcp/people.mjs add "E."');
    process.exitCode = 1;
    return;
  }
  const people = readPeople(root);
  if (people.some((p) => sameName(p.name, name))) {
    say(`${name.trim()} is already in the cohort`);
    process.exitCode = 1;
    return;
  }
  people.push({ name: name.trim(), tokens: [], claimedAt: null });
  writePeople(root, people);
  // The table opens as a room of named empty places rather than a void that
  // fills, so registering someone puts their name on the wood at once — and a
  // shared work then has both its ends to hang from, even before either maker
  // has laid anything alone. drop/people.json never leaves this machine; the
  // roster event carries only the names, which the table shows anyway.
  appendEvent(root, { e: 'roster', night: 0, people: [name.trim()] });
  say(`${name.trim()} · in the cohort, and a place on the table`);
  say(`  they scan the room's code and tap their name — nothing to hand over`);
}

function list() {
  const people = readPeople(root);
  if (!people.length) {
    say('nobody yet — node mcp/people.mjs add "<name>"');
    return;
  }
  for (const p of people) {
    const devices = p.tokens.length;
    say(`  ${p.name.padEnd(18)} ${devices ? `${devices} device${devices === 1 ? '' : 's'}` : 'not yet claimed'}`);
  }
}

function remove(name) {
  const people = readPeople(root);
  const at = people.findIndex((p) => sameName(p.name, name));
  if (at < 0) {
    say('nobody by that name');
    process.exitCode = 1;
    return;
  }
  const [gone] = people.splice(at, 1);
  writePeople(root, people);
  say(`${gone.name} · out of the cohort`);
  // The registry is a list of who may claim a device; the table is a log, and a
  // log is not rewritten (§9). So the name stays written on the wood where it
  // was placed, with nothing standing in it — said plainly rather than found out.
  say('  their place stays on the table; the log is not rewritten');
}

// One code, printed once, for the wall. The second, smaller code carries this
// machine's address instead of its name — `.local` is the least reliable thing
// about an Android phone, and a printed fallback costs nothing.
async function qr() {
  const ip = lanAddress();
  const svg = (text) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const main = await svg(doorAt('desk.local'));
  const alt = ip ? await svg(doorAt(ip)) : '';
  const html = `<!doctype html>
<meta charset="utf-8">
<title>the desk</title>
<style>
  body { font-family: "Iowan Old Style", Palatino, Georgia, serif; color: #2b2418; margin: 0;
         min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; }
  .qr svg { width: 62vmin; height: auto; }
  .qr--alt svg { width: 18vmin; }
  p { margin: 0; font-size: 1.4rem; }
  .alt { font-size: .8rem; color: #6f6350; }
  @media print { body { height: 100vh } }
</style>
<div class="qr">${main}</div>
<p>add your work</p>
${alt ? `<div class="qr qr--alt">${alt}</div><p class="alt">if the first does not open</p>` : ''}
`;
  const at = join(root, 'drop', 'qr.html');
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, html);
  say(`one code → ${at}`);
  say(`  ${doorAt('desk.local')}`);
  say(ip ? `  with ${ip} as the printed fallback` : '  no LAN address found — only desk.local is on the page');
}

const [what, arg] = process.argv.slice(2);
if (what === 'add') add(arg);
else if (what === 'list') list();
else if (what === 'remove') remove(arg);
else if (what === 'qr') await qr();
else {
  say('node mcp/people.mjs add "<name>" | list | remove "<name>" | qr');
  if (!existsSync(peopleFileIn(root))) say('(nobody in the cohort yet)');
}
