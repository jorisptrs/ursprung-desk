// The desk's deposit door, over stdio (BRIEF §6, D34). One tool, called once,
// after a person has confirmed the card in the session — the go lives in the
// tool description itself, where the model reads it.
//
// This file is protocol only: every rule lives in core.mjs, where it is tested
// without the SDK. stdout belongs to JSON-RPC — all logging goes to stderr.

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { depositCard, Refusal, ROOT } from './core.mjs';

const warn = (msg) => process.stderr.write(`desk: ${msg}\n`);

// The load-bearing sentence is the second one (D34): the human go, stated in
// the description, is the only thing standing between a session and the table.
export const DESCRIPTION = [
  'Lay one card on the desk — the table this room projects.',
  '',
  'Call only after the person has confirmed this exact card in this session: propose it, wait for their yes, call once. Never on inference, never in bulk, never to test.',
  'If nothing here is ready to lay down, ask what they want to put on the desk. Never go looking for a candidate.',
  '',
  'media: image · audio · video · text · code · fold · model · note',
  "kind: work · failure · quest · fieldnotes — failure is Claude's own; meta is the curator's",
  'excerpt: for image/audio/video/fold/model, the path to the file itself — a recording or a take is cut here into its trace. For text/code/note, one short sentence, or nothing.',
  'A card carries a title, a caption, or a line — any one is enough.',
  'Every card names its author — put whoever made the work in people. Required: the desk signs for nobody. If you do not know, ask.',
  '',
  'The desk sets id, night, provenance and visibility. Refusals come back in plain words.',
].join('\n');

// Loose on purpose (D107): the shape's judge is js/stream.js, replayed over the
// real log. passthrough matters — fields the desk owns must ARRIVE so the door
// can refuse them in words, rather than being quietly stripped here.
const INPUT = z.object({
  media: z.string().describe('image · audio · video · text · code · fold · model · note'),
  kind: z.string().describe('work · failure · quest · fieldnotes'),
  title: z.string().optional().describe('a plain noun phrase, often "thing, state"'),
  caption: z.string().optional().describe('fragments joined by " · " — medium, state, credit'),
  people: z.array(z.string()).optional().describe('required — who made the work; initials are the house style, Claude only where Claude was in it'),
  practice: z.string().optional().describe("the craft, in the depositor's own word"),
  excerpt: z.object({
    path: z.string().optional().describe('the file on this machine — a still is used as it is, a recording or take is cut'),
    text: z.string().optional().describe('one short sentence of the actual work'),
    form: z.string().optional().describe('defaults from the media'),
  }).passthrough().optional(),
  detail: z.object({}).passthrough().optional().describe('the back — absent means the card does not open'),
}).passthrough();

export function createServer({ root = ROOT } = {}) {
  const server = new McpServer({ name: 'desk', version: '0.1.0' });

  server.registerTool('deposit', {
    title: 'deposit a card on the desk',
    description: DESCRIPTION,
    inputSchema: INPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => {
    try {
      const { id } = depositCard(input, { root, warn });
      return { content: [{ type: 'text', text: `${id} · laid — the table has it` }] };
    } catch (err) {
      // Refused, never coerced (D34) — the door's words or the stream's,
      // handed back as they are so the person hears the real reason.
      const words = String(err?.message ?? err).replace(/^stream reject: /, '');
      if (!(err instanceof Refusal)) warn(`refused — ${words}`);
      return { content: [{ type: 'text', text: `refused — ${words}` }], isError: true };
    }
  });

  return server;
}

// "Was this file run directly?" is fiddlier than it looks, and getting it wrong
// means the server starts, says nothing, and answers nothing. Two ways the two
// spellings of one path diverge, both met in practice: import.meta.url
// percent-encodes the spaces in this repo's own name, and a path under a
// symlink (macOS /tmp → /private/tmp) resolves differently on each side. So
// compare real paths, and fall back to running rather than staying silent.
const isMain = (() => {
  if (!process.argv[1]) return false;
  const here = fileURLToPath(import.meta.url);
  const invoked = resolve(process.argv[1]);
  if (here === invoked) return true;
  try {
    return realpathSync(here) === realpathSync(invoked);
  } catch {
    return false;
  }
})();
if (isMain) {
  // DESK_ROOT points the door at another desk — the tests use it; the castle
  // may later. Unset, it writes into this repo, which is the usual case.
  const server = createServer({ root: process.env.DESK_ROOT || ROOT });
  await server.connect(new StdioServerTransport());
  warn('deposit door open');
}
