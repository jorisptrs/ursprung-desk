# The Desk — BRIEF.md
### Project brief and build plan. Lives in the repo root. Every Claude Code session reads this first and treats it as the source of intent.

---

## 1. What this is and who it's for

The desk is a communal projection surface for Ursprung, a recurring retreat where ~25 practitioners — artists, scientists, craftspeople, writers, instrument builders — live and work together for a few days in a castle in Italy. Everyone brings work they are in the middle of, ideally the most stuck of it. This October, Claude is present as an opt-in collaborator, and the desk is how that presence becomes *physical*: a dark field of light projected down onto a real wooden table, where the things made during the retreat — with or without Claude — accumulate as scattered, parchment-like objects over four days.

The desk is Claude's studio. The retreat's own framing: Claude attends as the 26th participant, with its own room in the chain of studios, and at the end you can ask what the 26th participant made, and with whom. The desk is the answer to that question, rendered continuously.

Two audiences, in order. Eventually: a cohort of experienced, sceptical masters — people with decades in their craft and no reason to flatter anyone — who will wander in the way they wander into each other's studios. Immediately: the retreat's organizers, meeting the desk as a short video and a live link on a phone. The first ten seconds of each carry disproportionate weight.

## 2. Lineage and philosophy

The desk descends from Dynamicland, Bret Victor's Oakland lab, whose principles are the design conscience here: the room is the computer; computing should be communal and accessible, not personal; people learn through awareness of each other's work, side by side, with their whole bodies; the medium is designed for agency, not apps. In 2019 the lab built six "dynalamps" — mic stand, lamp shade, projector, camera — to carry Dynamicland to other places. The desk inherits that gene: it is born portable, a projector, a folder, and a protocol. The retreat organizers tinkered with dynalamps at their last edition; this lineage is recognized and loved here.

We inherit the communal surface, physical things as handles for digital things, computation made visible in shared space, portability. We refuse to imitate Realtalk itself — no machine vision, no live object tracking; a weekend homage to a decade of research would be a diorama.

And we name the tension instead of hiding it: Dynamicland's deepest value is visibility — you can read and change all the computation. Claude is the opposite, an intelligence nobody can open. The desk is therefore an experiment Dynamicland would never run: an *illegible* intelligence placed inside a *legible*, communal vessel. What the desk makes visible is not Claude's computation but Claude's **conduct** — everything it co-made, with whom, failures included, laid out on a table the whole community can inspect. Social visibility standing in for mechanical visibility. Every design choice should serve that inspection.

## 3. The ethic (binding on all behavior)

**Deposits, never streams.** Nothing is captured automatically, ever. Every artifact enters by a deliberate act — a file handed over in a Claude session, an object carried to the room and photographed, a curator's placement — and the act itself is the consent. The desk receives offerings; it does not watch.

**Failures stay on the table.** The retreat promised an honest record: where Claude earned its place in expert hands and where it was no use at all. Failure cards are first-class citizens with their own dignity, not bugs to hide. The desk's credibility with sceptics rests entirely on this.

**The voice is dry.** Captions are short, factual, faintly warm, never promotional. "running · M. + Claude". "tried twice · stays up". No exclamation marks, no adjectives of enthusiasm, no flattery. The desk never advertises. A skill file in this repo defines the voice; use it whenever writing any text that appears on the table.

**What counts as Claude's work.** Claude appears on the table in exactly three registers: as *co-author inside other people's works* — a card credited "E. + Claude" is the person's work, Claude in service; as *author of the observation layer* — the field notes, the captions, and the proposed threads are Claude's own practice here, the view from every studio at once, and its field notes enter through the same deposit gesture as everyone else's work; and as *co-builder of the desk itself* (the meta card). The desk never displays autonomous Claude-generated artwork — no images, poems, or music under Claude's name alone. Its creative output *is* the cartography. Any design choice that has Claude producing decorative or artistic content for the table is wrong.

**The desk plays several roles at once** — slow archive (strata of accumulating days), cartographer (threads between things made together; nightly field notes — Claude's own work-in-progress, the view from every studio at once), Claude's body in the building, an instrument for the retreat's existing rituals (a live-seeded opening night, a closing-ceremony replay), a consent boundary made physical, the honest record, and an airlock where a sceptic can observe Claude for three minutes without anything being asked of them. When roles conflict, the consent boundary and the honest record win.

## 4. Design north stars (how to make choices I haven't specified)

The desk's physical form is a projector mounted above a real wooden table, casting straight down: the pool of light on the tabletop is the entire interface, and the browser page is a stand-in for that surface (fullscreen ≈ the projection). Hence the first rule — the projection must read as **objects lying on the wood, never as a screen**: the dark warm field sits inset from the table's edge so real wood visibly frames the light, and nothing screen-like appears inside it — no UI chrome, no cursors, no panels, no buttons. Warmth over coolness: a near-black warm field, parchment-toned cards, thin amber threads, an ashen register for failures, a bookish serif for titles, quiet small type for captions — the palette of candlelight and paper in a Renaissance castle, never the palette of a dashboard. The table is **still**: a card appears at its resting place — laid slightly askew, final — and never moves again; the one motion is the flip of a card picked up to read, and replay is the four days re-appearing at a compressed, legible cadence. Older material sinks in opacity, so time is visible as strata; position carries no meaning — someone put it there, that is all. Silence over decoration; when in doubt, choose the quieter option, remove rather than add, and apply the test: *would this choice survive a sceptical master of craft wandering in?* If a choice smells of tech demo, it is wrong. Note every non-obvious choice in README.md, one line each.

## 5. The card — what ingested things become

Two words, kept distinct on purpose: an **artifact** is the recorded work — the entry in the log, with its people, provenance, and consent; a **card** is how an artifact appears on the table — its rendered token, with a front and sometimes a back. The log holds artifacts; the field shows cards. **A card is a token of the work, never the work itself** — but the token is cut from the real thing. A card's surface is an **excerpt of the actual work**, chosen by the depositor: a detail of the photograph, bars of the real waveform, one sentence of the manuscript. The desk provides the plinth and the light; it never re-renders or stylizes the work. Tapping a card flips it — the back carries whatever the maker chose to attach, in the order they arranged it: text, full images, files, links, people, provenance. A card without a back simply does not open; no label — the closed card explains itself. Everything is a still (no playback, no scrolling); motion is spent only on the flip, at most one thing moving on the table at any moment. The gestures are placement, the flip, and, later, curation.

A card's anatomy is fixed: a parchment ground, a trace, a title, a caption — nothing else. The trace is the media-specific mark, and this mapping is design language, not implementation detail:

**image** — the photograph itself, set in a parchment frame. The one medium shown directly, because a photograph is already a token. This is also the universal door: everything analog — an instrument, a fold, a page of score, a carved thing — enters the desk as a photograph.
**audio** — a still waveform drawn from the actual recording. It does not play; it attests.
**video** — a strip of two or three stills cut from the actual footage, or a single frame, depositor-chosen; the frames are the excerpt. It does not play; like audio, it attests. The back may shelve the file or a link out.
**text** — one short sentence of the actual manuscript, chosen by the depositor. On a communal table anything legible is read by everyone, so the choice of the legible line belongs to the maker; withheld, the surface falls back to faint ruled lines and the title carries what's known.
**code** — a few real lines, depositor-chosen; withheld, faint monospace dashes.
**fold** — the crease pattern's linework, nearly full-bleed. The one medium whose content is already an abstraction, so it may be shown whole.
**model** (digital 3D) — a depositor-chosen viewpoint rendered as a still; wireframe or contour renders are welcome kin to the fold's linework. A physical three-dimensional work is not a model — it enters through the universal door, as a photograph.
**note** (quests, field notes, meta) — the words are the content and short enough to be read whole, so they are shown whole.

Size: roughly hand-sized against the table; images somewhat larger, notes smaller; the variation stays subtle — no artifact shouts.

The desk attests; it never performs. Nothing plays, spins, or scrolls on the table; backs shelve files and link outward, never embed players; the work itself is experienced in the studios. Consequence: the renderer only ever draws excerpts — attached files stay opaque. Fallback for any unlisted medium: reduce it to a still, silent excerpt — usually a photograph — and a caption.

## 6. Decisions (stated, not argued)

Deliverable: a short video (60–90 s), a brief plain note, the live link, and this repo — shared with the organizers, together with three practical questions (which room can go properly dark; who owns the dynalamps from edition IV; should the opening intro round seed the table live).

Projector: acquire a pico projector before the shoot (borrow / rent / buy; keep it — it becomes the testing rig afterward). If none is in hand by the shoot, plan B is a staged screen capture: fullscreen, dark room, slight camera angle, warm glow. Either way the deliverable ships complete.

**MCP is in scope for v0.** A minimal local MCP server is part of the build, not an extension: it makes the project's central sentence — *the desk is an MCP server; every Claude in the building connects to it* — literally true on camera, and it produces the demo's best shot: a terminal running Claude Code, the words "put this on your desk," and a card sliding onto the projected table. Scope discipline: the server is severable — the renderer, seed, replay, and deployed link must be finished and shippable before the MCP layer is touched, and if it isn't done in time, the video ships without the terminal shot and nothing else changes. The deployed web demo never depends on it. A deposit commits only on an explicit human go — Claude never auto-deposits. Through the shoot: a single deposit tool, called once, after the person confirms the proposed card in-session. The formal stage→confirm two-call protocol arrives with the room server (§7 step 5), where the tray already provides its staging half.

**The room machine serves the desk, and both networked doors are one build (§7 step 5).** The laptop driving the projector also answers on the local network, so a participant scans a printed QR and deposits from their own phone, *and* a participant working with Claude on their own laptop deposits through the same tool over HTTP. Without that step neither is real: the hand path reaches only a table tab in the same browser, and the stdio MCP door writes to the depositor's own disk rather than the room's. They are one build because they want one process owning the stream, the assets and the trays — small on purpose, files on the one machine standing in the room. Same scope discipline as everything else: severable, built after the shoot's deliverable is shippable, and the deployed demo never depends on it.

Tech: one static HTML page, vanilla JS, no framework, no bundler. Canvas or SVG at the implementer's discretion. The deployed demo is fully client-side: the deposit sheet — one small editor, reached by the `+`, by Enter or a tap of Space, or by dropping a file anywhere on the table — turns a visitor's work into a card in their session only (`push to table` lays it; `set aside` keeps it in the deck below the sheet), no backend; a tap on a card flips it where a back exists; holding the table, or the arrow keys, rushes through the stream. Local filming rig adds a keyboard demo-driver so arrivals can be triggered on cue. The MCP server exposes `deposit` (write an artifact into the watched folder; the page picks it up) on the official SDK. Its transport is **local stdio through step 4, then the room machine's HTTP door from step 5 on** — same tool, same rules, same log; only the pipe changes (step 5 below). Static hosting for the link — the deployed page never gains a backend; the room machine's local server is a separate thing that never touches it.

The deployed demo appends to a local copy of the stream only — a per-tab fork that never merges. Publishing means appending to the canonical stream, and only the three doors do that (MCP deposit, the hand path, the curator). The hand path is the deposit page for any work from your own device; photographing analog work is its most common act, not its definition. No fourth door: the web demo gets no save, no sign-in, no merge, ever.

Explicitly deferred and named as deferred in the note: hooks, the camera, castle-map mode, the lamp, semantic thread-finding, all origami features beyond one seeded crease-pattern card. They have their place in the chain in §7; none of them is in the shoot.

## Working rules (standing, every session)

Self-test thoroughly before asking for feedback, every time it's possible. Machine-checkable things are the implementer's to verify, never the reviewer's: run the determinism test, validate seed.json against the schema, fold at boundary t values (0, mid-event, past-end), exercise append rejections (forward thread refs, bad media, missing excerpt), exercise the flip on a card with a back and the non-response on the card without one, run the MCP deposit including the schema-reject path, load the page through the local server and confirm a clean console. Lightweight dev-only test scripts are encouraged; they don't ship. Never present something as done that hasn't been executed at least once. Stop for feedback only on what only an eye can judge — the flip's feel, warmth, composition — and open such stops with two lines: what was already verified and how, and the specific judgment needed.

## 7. The build, in order

One chain, by dependency and severability — not by calendar. Every step is severable: if it isn't done, the steps before it still stand on their own, and the deliverable of step 4 never depends on anything after it. The shoot is step 4 because it needs nothing later; it is a milestone in the chain, not the point of it.

**1 · The table (done).** Field + card rendering by media type → arrivals + strata → threads → seed content pass → replay + demo-driver + fullscreen → the sheet, the deck and the flip → deploy and verify on a phone. The desk-voice skill is written before the captions it governs.

**2 · The hand door, on one device (done).** The sheet is a page that becomes a card; the deck holds what is set aside; a push lays it on the table in the same browser. This is the whole deposit grammar, proven, before any of it crosses a network.

**3 · The MCP deposit door, local stdio (done).** One `deposit` tool on the official SDK, called once after an explicit human go. The keeper's own machine only: the session and the desk share a filesystem, and a card written by the terminal appears on the table beside it.

**4 · The shoot and the note to the organizers.** Dark room, raw wood, projector down, phone on a stand at a slight angle, exposure locked. Sequence: quiet field with quest cards → arrivals on cue → the terminal deposit via MCP → a thread appears → replay → the meta card lands last. Polish goes to the first ten seconds and the ending. Ships with the brief note, the live link, and this repo. *Everything below this line is for the retreat, not for the video.*

**5 · The room server — one process, two doors.** The laptop that drives the projector also serves the desk on the local network: it owns the canonical stream, the assets, and the trays, and it answers on a stable name (`desk.local`, mDNS — no IP to read off a screen, nothing to reconfigure when the router changes its mind).

Two front doors onto that one process, built together because they are the same infrastructure:
- *the hand door over the LAN* — a participant scans a printed QR, deposits from their own phone, and the card lands on the projected table in front of everyone. The everyday door, made real instead of simulated.
- *the MCP door over HTTP* — the same `deposit` tool, same rules, same log, carried on the SDK's streamable-HTTP transport instead of stdio. A participant working with Claude on their own laptop adds one line and deposits onto the room's table. Under stdio they cannot: the server is a local subprocess writing to a local file, so their cards land on their own disk and never reach the room.

Building them together is meaningfully cheaper than in sequence — the server, the asset store, and the single-writer discipline are shared — and it retires the concurrent-writer race the local build accepts, because one process owns the log again. It is also the natural place to settle identity: an HTTP door can see who is connecting, which answers "who made this" once per participant instead of once per card.

**6 · The `ursprung` plugin.** One command for a participant: the door's address and the per-practice mini-skills from the pre-retreat calls, together. It must come after step 5 and not before — a plugin that ships the stdio door would install twenty-five private desks that never reach the room. Distribution is its job; reach is step 5's.

**7 · The curator's door (door 3).** MCP tools on the same server, used from a Claude session — no separate UI. Deposit-on-behalf (only with the person's say-so), recaption, approve/reject proposed threads (thread events enter the stream only through here), review-and-release of field notes, retire, and a nightly review queue of today's arrivals and pending items. Append-only holds throughout: every correction is an appended event, never an edit of history. Night-0 quest cards are confirmed by their person the next morning through this same path.

**8 · Reading the desk from any studio.** `browse` and `read_field_notes` on the server — a Claude session asking "what's on the desk?" and answering from the log. The 26th-participant-readable-from-anywhere demo, and one more strong terminal shot if the video is ever recut.

**9 · The intelligence layer's first organs — both propose, a human confirms.** The captioner: a vision pass proposes a caption for a photographed deposit in the desk's voice. The semantic thread-finder: it proposes threads between works that turn out to be one problem, and they enter the stream only through the curator's review in step 7. Nothing either writes reaches the table unconfirmed — this is where the desk's cartography stops being hand-authored, and exactly why the confirmation step is not optional.

**10 · Hardening for a room full of people.** The store goes from demo-grade to castle-grade: many writers, an offline queue tested by pulling the plug, retention. Schema frozen. Deterministic people-threads. The system runs daily on my own desk through this stretch — a month of dogfooding by its least forgiving user.

**11 · Co-designed in the team calls, deliberately open until then.** Room choice; lamp vs. rig and the edition-IV dynalamps; touch on the physical table (an IR touch frame around the tabletop turns finger-taps into ordinary touch events — no camera, nothing watches, and the web tap gestures work unchanged); scatter vs. castle-map geometry; thread visuals; live-seeding mechanics for the opening night; closing-interview staging; origami affordances, only with Lang and only if he's curious; cohort accounts and the in-kind ask to Anthropic; the legal-wrapper question (a nonprofit entity unlocks Anthropic's nonprofit pricing and grant channels); the night-one consent sentence.

**12 · Setup days.** Darkness test before anything mounts; rig and calibrate 1:1; the LAN and the desk server; offline queue tested by pulling the plug; the plugin rehearsed on a volunteer machine; quest cards loaded; full dry run of the live seeding.

**13 · The retreat.** Live seeding and the consent sentence on night one; mornings open on overnight arrivals; three deposit doors; fifteen minutes of nightly curation; the Sunday studio walk; replay and log-grounded interview at the closing ceremony. The desk runs itself — its keeper is also the building's fixer.

**14 · After.** The log exported as a structured report plus dataset (the honest record, and the evidence pack for any future funding conversation); material to the film; the between-events web strata at a monthly-letter cadence, never a feed; the desk rides the van to the next edition.

## Architecture invariants (standing until amended)

- **Publishing is export, not transport.** The canonical stream stays on the room machine at the retreat. Publishing means a curator-run export: filter the stream to the public visibility tier, then push log + assets as a static, one-way copy to the web renderer — the deployed demo *is* that renderer. Opportunistic (nightly, if the castle wifi allows), never on the critical path, and no write path from the web back — ever. The same mechanism is the between-events commons.
- **Outage asymmetry is a design invariant.** If the internet dies, only the intelligence layer degrades — Claude calls pause, captions queue. The room — table, hand door, replay — keeps working entirely from the room machine. Nothing castle-critical may depend on the uplink.
- **The stream's home is portable by design.** Canonical on the room machine from step 5 onward — the laptop that drives the projector also serves the desk and holds the trays; promotable later to a small hosted server for a living between-events desk. Same doors, same consent machinery, same append-only waist wherever it sits.
- **The desk is on the room's network, not the internet.** The doors of step 5 answer on the LAN. Exposing them publicly is a separate decision with its own consent machinery, and is not implied by any step in this chain.

## 8. Repo layout

```
desk/
  BRIEF.md                     ← this file
  index.html  desk.js  desk.css
  seed.json                    ← the seeded event stream
  assets/                      ← photographed fold, jazz-coding shot, crease pattern
  mcp/                         ← the deposit server (small, severable)
  .claude/skills/desk-voice/   ← SKILL.md defining the caption voice, with examples
  README.md                    ← run/deploy notes + one-line decisions log
```

## 9. Data model (load-bearing; keep stable)

One append-only stream of events is the whole truth: deposits and threads are both events, the table's state is a pure function of the stream and the clock, and replay is nothing but playing the stream with time compressed. There is no separate timeline — the stream's order *is* the timeline. `night` is display metadata (strata, grouping), never ordering.

```json
{ "events": [
  { "e": "deposit", "night": 2,
    "artifact": {
      "id": "a-014",
      "media": "image | audio | video | text | code | fold | model | note",
      "kind": "quest | work | failure | fieldnotes | meta",
      "title": "kettle drone, take 4",
      "caption": "audio · B. + Claude",
      "people": ["B.", "Claude"],
      "provenance": "mcp | hand | curator",
      "visibility": "room | community | public",
      "excerpt": { "form": "crop | waveform | frames | sentence | lines | linework | render | words", "src": "assets/…", "text": "…" },
      "detail": { "composition": [], "assets": [], "links": [], "note": "" }
    } },
  { "e": "thread", "night": 3, "from": "a-006", "to": "a-014", "why": "same makers" },
  { "e": "roster", "night": 0, "people": ["B.", "M.", "E."] },
  { "e": "night", "night": 2 },
  { "e": "arrange", "night": 3,
    "places": { "B.": [0.31, 0.22], "M.": [0.55, 0.41], "B. + M.": [0.43, 0.31], "Claude": [0.18, 0.79] },
    "why": "B. and M. are both working on things that will not close." }
] }
```

Distinctions that carry weight: `media` says how the trace is *drawn*; `kind` says how the card *behaves* (quests spawn faded, failures take the ashen register, fieldnotes are Claude's own, the meta card closes the demo); `people` says whose studio the card lies in, which is why every card names its makers and why nothing arrives anonymously. There is no `practice` field — a self-chosen craft label was one more thing to fill in and a worse signal than the log already carries; **affinity is derived from who worked with whom, and from a reading of the work itself** (D145). `excerpt` is the surface and always present in one of its forms; `detail` is the optional back — absent means the card does not open, and that absence is the entire privacy signal. Hand deposits fill `detail.composition`, the maker's ordered arrangement (text, stills, links, files) rendered on the back exactly as laid out; the flat fields (`assets`, `links`, `note`) stay legal beside it. There is no separate `asset` field: surface assets live in `excerpt`, full assets in `detail`. `provenance` names the door — who performed the gesture — never the medium; media already says what the thing is. The enum grows only if a door does, and new doors trigger the full consent machinery. `visibility` exists from day one because consent tiers cannot be retrofitted; the prototype sets everything to `public`.

`night` says that yesterday ended. Everything else the desk works out for itself — an id from the log, a place from the arrangement, an author from the token — but no amount of reading the log tells you a day has passed, so somebody says so and it is recorded like any other fact. Both doors lay a card on whatever night the log is already on, which is why this is not optional: without it every card of a four-day retreat arrives on night 0 and the table never breaks into the waves it is built to show. It may only move forward — a night that went backwards would re-date every card laid after it. `node mcp/night.mjs next`, once a morning, until step 7 offers the same thing from a session.

`roster` says who the curator registered; the table opens as a room of named empty places rather than a void that fills, and a name written on the wood goes as soon as a card lands on it. Only names travel — the device tokens stay on the room machine.

`arrange` says where each **stack** stands tonight: a studio for each person, and one shared place for each set of hands that worked together, keyed by their names. Both are placed in one relaxation, as atoms holding each other off at arm's length — a person's pull comes from what they work on, a shared work's is the midpoint of its makers. A place is a fact in the log like everything else, so `fold` stays a pure function of the stream and never calls a reader. The judgment that produced it proposes **affinities with reasons, never coordinates**; a pure solver does the geometry. Arrangements accumulate: a night that moves three studios names three. A stack the arrangement has not heard of is placed by the same solver among those that are already right, so **a new stack costs a nudge and another card on a standing pile costs nothing**. No new arrangement — the uplink down, the reader silent — and the last one simply stands.

Removal is retirement — an appended event the fold ceases to display; the stream itself is never rewritten.

Why a stream rather than a mutable artifact store: retraction, curation edits, concurrent writers (MCP, hand path, curator), and the nightly "what happened today" question all fall out of append-only for free — and every past state of the table stays reconstructable, which is what makes the honest record and the eventual dataset trustworthy. One amendment, where the pattern must bend to the ethic: **facts are append-only, payloads are deletable.** Heavy media lives as files referenced by the log; a withdrawal appends a retract event *and deletes the referenced files* — the content is genuinely gone, the history stays honest. Local persistence is JSONL, one event per line: the MCP write path is "append one line," crashes cannot corrupt earlier history, seed.json is just a pre-written stream, and replay and live mode share one code path. Guardrail against costume-grade event sourcing: no snapshots, no event versioning — the fold from stream to table-state stays under a screen of code, and if it grows past that, the design has failed.

## 10. Seed set (content, adjust freely; captions obey the voice skill)

Quest cards, night-0, faded: "a fold that will not close" (R.) · "finish the piece" · "rebuild the zither" (Y.) · "the 1993 system" (M.) · "a chapter that resists" (E.).
Night-1: "jazz coding, resumed" — image — "one phone, six hands · the walk".
Night-2: "kettle drone, take 4" — audio — "audio · B. + Claude" · "the 1993 system" — code — "running · M. + Claude" (thread to its quest) · crease pattern — fold — "22.5° · flat-foldable".
Night-3: "chapter 7, rewritten" — text — "manuscript · E. + Claude" (thread to quest) · "fugue scoring — no use" — failure — "tried twice · stays up" · field notes — "the fold and the drone are one problem" · one work card carrying no back (it does not open — nothing announces this).
Night-4: "the piece, finished" — audio — thread back to its night-0 quest · field notes — "what leaves this room by van, what leaves by hand".
Last event in the stream: meta — "the desk, v0" — "[name] + Claude · Berlin, July".

Assets only a human can make: photograph a real folded crane on paper (truer than anything generated; it feeds two cards), stage the phone-in-hands shot, and render a genuine flat-foldable crease pattern as fine dark lines on parchment.
