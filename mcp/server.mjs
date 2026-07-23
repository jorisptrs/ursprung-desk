// The desk's deposit door, over stdio (BRIEF §6, D34). One tool, called once,
// after a person has confirmed the card in the session — the go lives in the
// tool description itself, where the model reads it.
//
// This file is protocol only: every rule lives in core.mjs, where it is tested
// without the SDK. stdout belongs to JSON-RPC — all logging goes to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { bytesToFile, depositCard, isMainModule, MAX_ASSET_BYTES, Refusal, ROOT } from './core.mjs';

const warn = (msg) => process.stderr.write(`desk: ${msg}\n`);

// The load-bearing sentence is the second one (D34): the human go, stated in
// the description, is the only thing standing between a session and the table.
//
// Two transports, one tool. Over stdio the session and the desk share a disk,
// so the excerpt is a path; over the room server's HTTP door the work sits on
// the depositor's own laptop, so it rides as bytes. And where the room
// recognised whoever is connecting, the author is already known and the tool
// stops asking for it (D123).
export function describe({ author = null, remote = false } = {}) {
  return [
    'Lay one card on the desk — the table this room projects.',
    '',
    'Call only after the person has confirmed this exact card in this session: propose it, wait for their yes, call once. Never on inference, never in bulk, never to test.',
    'If nothing here is ready to lay down, ask what they want to put on the desk. Never go looking for a candidate.',
    '',
    'media: image · audio · video · text · code · fold · model · note',
    "kind: work · failure · quest · fieldnotes — failure is Claude's own; meta is the curator's",
    remote
      ? 'excerpt: for image/audio/video/fold/model, read the file and send it as excerpt.bytes (base64) with excerpt.name — a recording or a take is cut into its trace on the desk. For text/code/note, one short sentence, or nothing.'
      : 'excerpt: for image/audio/video/fold/model, the path to the file itself — a recording or a take is cut here into its trace. For text/code/note, one short sentence, or nothing.',
    'A card carries a title, a caption, or a line — any one is enough.',
    author
      // The rule the code actually keeps: people is who MADE the work, and it
      // replaces the default rather than adding to it. Said plainly, because
      // the obvious wording ("put other makers in people") loses the person
      // their own card.
      ? `This desk knows you as ${author}. Leave people out and the card is yours. If you fill it in, it must name everyone who made the work — including ${author} where they did.`
      : 'Every card names its author — put whoever made the work in people. Required: the desk signs for nobody. If you do not know, ask.',
    '',
    'The desk sets id, night, provenance and visibility. Refusals come back in plain words.',
  ].join('\n');
}

export const DESCRIPTION = describe();

// Loose on purpose (D107): the shape's judge is js/stream.js, replayed over the
// real log. passthrough matters — fields the desk owns must ARRIVE so the door
// can refuse them in words, rather than being quietly stripped here.
const INPUT = z.object({
  media: z.string().describe('image · audio · video · text · code · fold · model · note'),
  kind: z.string().describe('work · failure · quest · fieldnotes'),
  title: z.string().optional().describe('a plain noun phrase, often "thing, state"'),
  caption: z.string().optional().describe('fragments joined by " · " — medium, state, credit'),
  people: z.array(z.string()).optional().describe('required — who made the work; initials are the house style, Claude only where Claude was in it'),
  excerpt: z.object({
    path: z.string().optional().describe('the file on this machine — a still is used as it is, a recording or take is cut'),
    bytes: z.string().optional().describe('the file itself, base64 — for a desk across the network, where a path means nothing'),
    name: z.string().optional().describe('the filename the bytes came under; its extension says what the file is'),
    text: z.string().optional().describe('one short sentence of the actual work'),
    form: z.string().optional().describe('defaults from the media'),
  }).passthrough().optional(),
  detail: z.object({}).passthrough().optional().describe('the back — absent means the card does not open'),
}).passthrough();

export function createServer({ root = ROOT, author = null, remote = false } = {}) {
  const server = new McpServer({ name: 'desk', version: '0.1.0' });

  server.registerTool('deposit', {
    title: 'deposit a card on the desk',
    description: describe({ author, remote }),
    inputSchema: INPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => {
    // Bytes become a file under the depositor's own filename, and from there
    // the path the door has always taken — every guard, the cut and the
    // refusals apply unchanged.
    let upload = null;
    try {
      const raw = input?.excerpt?.bytes;
      if (typeof raw === 'string' && raw.trim()) {
        const bytes = Buffer.from(raw, 'base64');
        if (!bytes.length) throw new Refusal('the bytes did not decode — send the file base64 under excerpt.bytes');
        if (bytes.length > MAX_ASSET_BYTES) throw new Refusal('that file is over 25 MB');
        upload = bytesToFile(bytes, input.excerpt.name ?? 'upload');
        input = { ...input, excerpt: { ...input.excerpt, path: upload.path, bytes: undefined } };
      }
      const { id } = depositCard(input, { root, warn, author });
      return { content: [{ type: 'text', text: `${id} · laid — the table has it` }] };
    } catch (err) {
      // Refused, never coerced (D34) — the door's words or the stream's,
      // handed back as they are so the person hears the real reason.
      const words = String(err?.message ?? err).replace(/^stream reject: /, '');
      if (!(err instanceof Refusal)) warn(`refused — ${words}`);
      return { content: [{ type: 'text', text: `refused — ${words}` }], isError: true };
    } finally {
      upload?.dispose(); // the copy was only ever a way in; the desk kept its own
    }
  });

  return server;
}

// D122's rule, stated once in core.mjs and used by both entrypoints.
if (isMainModule(import.meta.url)) {
  // DESK_ROOT points the door at another desk — the tests use it; the castle
  // may later. Unset, it writes into this repo, which is the usual case.
  const server = createServer({ root: process.env.DESK_ROOT || ROOT });
  await server.connect(new StdioServerTransport());
  warn('deposit door open');
}
