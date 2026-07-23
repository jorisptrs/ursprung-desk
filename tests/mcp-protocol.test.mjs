// The door over the wire: the real server, spawned, spoken to in raw
// newline-delimited JSON-RPC. Skips itself when mcp/node_modules is absent so
// the page and the root test run stay dependency-free (D113). Dev-only.
//
//   cd mcp && npm install     then     node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAS_SDK = existsSync(join(ROOT, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk'));

const SEED = {
  events: [{
    e: 'deposit', night: 3,
    artifact: { id: 'a-001', media: 'note', kind: 'quest', title: 'a fold that will not close', practice: 'origami', people: ['R.'], provenance: 'curator', visibility: 'public', excerpt: { form: 'words', text: 'a fold that will not close' } },
  }],
};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

// A tiny JSON-RPC client over the server's own stdio — no SDK on this side, so
// the test sees exactly what a client sees.
function talk() {
  const root = mkdtempSync(join(tmpdir(), 'desk-proto-'));
  writeFileSync(join(root, 'seed.json'), JSON.stringify(SEED));
  writeFileSync(join(root, 'crane.png'), PNG);

  const child = spawn(process.execPath, [join(ROOT, 'mcp', 'server.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DESK_ROOT: root },
  });
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
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mid, method, params })}\n`);
    setTimeout(() => reject(new Error(`no answer to ${method}`)), 10000).unref?.();
  });
  const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

  return {
    root, send, notify, stderr,
    close: () => child.kill(),
    lines: () => {
      const f = join(root, 'drop', 'stream.jsonl');
      return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
    },
    assets: () => {
      const d = join(root, 'drop', 'assets');
      return existsSync(d) ? readdirSync(d) : [];
    },
  };
}

async function open() {
  const c = talk();
  const init = await c.send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'desk-test', version: '0' },
  });
  c.notify('notifications/initialized');
  return { c, init };
}

const call = (c, args) => c.send('tools/call', { name: 'deposit', arguments: args });
const said = (res) => res.result.content.map((p) => p.text).join('\n');

test('the door speaks the protocol and names itself', { skip: !HAS_SDK && 'mcp/node_modules absent — run npm install in mcp/' }, async () => {
  const { c, init } = await open();
  try {
    assert.equal(init.result.serverInfo.name, 'desk');
    assert.ok(init.result.capabilities.tools, 'it offers tools');
  } finally { c.close(); }
});

test('one tool, and the human go is in its description (D34)', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    const list = await c.send('tools/list');
    assert.equal(list.result.tools.length, 1, 'a single deposit tool (D34)');
    const tool = list.result.tools[0];
    assert.equal(tool.name, 'deposit');
    assert.match(tool.description, /only after the person has confirmed this exact card in this session/, 'the go, stated in the description itself (D34)');
    assert.match(tool.description, /Never on inference, never in bulk, never to test/);
    assert.match(tool.description, /ask what they want to put on the desk/, 'an empty-handed session asks, it does not go looking');
    assert.match(tool.description, /Never go looking for a candidate/, 'the ethic, said where the model reads it');
    assert.match(tool.description, /Refusals come back in plain words/);
    assert.ok(tool.description.length < 1000, `the door states itself briefly (${tool.description.length} chars)`);
    assert.ok(tool.inputSchema, 'and a schema a client can read');
  } finally { c.close(); }
});

test('a confirmed card lands: one line, one asset, dry words back', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    const res = await call(c, {
      media: 'image', kind: 'work', title: 'the fold, closed',
      caption: 'paper · R. + Claude', people: ['R.', 'Claude'], practice: 'origami',
      excerpt: { path: join(c.root, 'crane.png') },
    });
    assert.ok(!res.result.isError, said(res));
    assert.equal(said(res), 'm-001 · laid — the table has it');

    assert.equal(c.lines().length, 1);
    const ev = JSON.parse(c.lines()[0]);
    assert.equal(ev.artifact.id, 'm-001');
    assert.equal(ev.night, 3, 'the current highest night');
    assert.equal(ev.artifact.provenance, 'mcp');
    assert.equal(ev.artifact.excerpt.src, 'drop/assets/m-001.png');
    assert.deepEqual(c.assets(), ['m-001.png']);
  } finally { c.close(); }
});

test('a card the desk cannot take is refused in the stream\'s own words, and nothing is written', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    const res = await call(c, { media: 'hologram', kind: 'work', people: ['R.'], title: 'a thing' });
    assert.equal(res.result.isError, true);
    assert.equal(said(res), 'refused — unknown media "hologram"');
    assert.equal(c.lines().length, 0, 'a refused card writes no line');
    assert.deepEqual(c.assets(), [], 'and leaves no asset');
  } finally { c.close(); }
});

test('the fields the desk owns are refused, not quietly stripped (D107)', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    const res = await call(c, {
      media: 'note', kind: 'work', title: 'the 1993 system',
      provenance: 'hand', id: 'a-999',
      excerpt: { text: 'it still runs' },
    });
    assert.equal(res.result.isError, true);
    assert.match(said(res), /the desk sets id and provenance itself — leave them out/);
    assert.equal(c.lines().length, 0);
  } finally { c.close(); }
});

test('meta is the curator\'s door, and a drawn medium must hand a still', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    let res = await call(c, { media: 'note', kind: 'meta', title: 'the desk, v0' });
    assert.equal(res.result.isError, true);
    assert.match(said(res), /curator/);

    res = await call(c, { media: 'audio', kind: 'work', people: ['R.'], title: 'kettle drone, take 4' });
    assert.equal(res.result.isError, true);
    assert.match(said(res), /needs a trace/, 'with no file at all it still asks for one');
    assert.equal(c.lines().length, 0);
  } finally { c.close(); }
});

test('words cards need no file, and two cards take two ids', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    const first = await call(c, { media: 'text', kind: 'work', people: ['R.'], title: 'chapter 7, rewritten', excerpt: { text: 'the door was already open.' } });
    assert.equal(said(first), 'm-001 · laid — the table has it');
    const second = await call(c, { media: 'note', kind: 'fieldnotes', people: ['Claude'], title: 'the fold and the drone are one problem' });
    assert.equal(said(second), 'm-002 · laid — the table has it');
    assert.equal(c.lines().length, 2);
    assert.deepEqual(c.assets(), [], 'words bring no assets');
  } finally { c.close(); }
});

test('stdout carries protocol and nothing else', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  const { c } = await open();
  try {
    await call(c, { media: 'hologram', kind: 'work', people: ['R.'], title: 'x' }); // logs to stderr
    await call(c, { media: 'note', kind: 'work', people: ['R.'], title: 'a line' });
    // every stdout line parsed as JSON-RPC in the reader above; a stray log
    // would have thrown there. The warning went to stderr instead:
    assert.ok(c.stderr.join('').includes('desk:'), 'the door narrates on stderr');
  } finally { c.close(); }
});

test('the door starts when its path is spelled another way — spaces, symlinks (D122)', { skip: !HAS_SDK && 'mcp/node_modules absent' }, async () => {
  // This repo's own name has spaces, and /tmp is a symlink to /private/tmp on
  // macOS. Either divergence used to leave the server silent: running, but
  // never connected, answering nothing at all.
  const link = join(mkdtempSync(join(tmpdir(), 'desk-link-')), 'desk');
  symlinkSync(ROOT, link);
  const root = mkdtempSync(join(tmpdir(), 'desk-viasym-'));
  writeFileSync(join(root, 'seed.json'), JSON.stringify(SEED));

  const child = spawn(process.execPath, [join(link, 'mcp', 'server.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DESK_ROOT: root },
  });
  try {
    const answered = await new Promise((resolve) => {
      let buf = '';
      const timer = setTimeout(() => resolve(null), 8000);
      child.stdout.on('data', (b) => {
        buf += String(b);
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        clearTimeout(timer);
        resolve(JSON.parse(buf.slice(0, nl)));
      });
      child.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      })}\n`);
    });
    assert.ok(answered, 'the door answered through a symlinked path');
    assert.equal(answered.result.serverInfo.name, 'desk');
  } finally { child.kill(); }
});
