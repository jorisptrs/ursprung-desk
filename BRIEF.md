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

The desk's physical form is a projector mounted above a real wooden table, casting straight down: the pool of light on the tabletop is the entire interface, and the browser page is a stand-in for that surface (fullscreen ≈ the projection). Hence the first rule — the projection must read as **objects lying on the wood, never as a screen**: the dark warm field sits inset from the table's edge so real wood visibly frames the light, and nothing screen-like appears inside it — no UI chrome, no cursors, no panels, no buttons. Warmth over coolness: a near-black warm field, parchment-toned cards, thin amber threads, an ashen register for failures, a bookish serif for titles, quiet small type for captions — the palette of candlelight and paper in a Renaissance castle, never the palette of a dashboard. Motion is **furniture-slow** except at two moments: arrival (a card slides in from the edge and settles with a slight rotation, like someone placed it) and replay (four days re-run in a compressed, legible rush). Older material sinks — in opacity, toward the edges — so time is visible as strata. Silence over decoration; when in doubt, choose the quieter option, remove rather than add, and apply the test: *would this choice survive a sceptical master of craft wandering in?* If a choice smells of tech demo, it is wrong. Note every non-obvious choice in README.md, one line each.

## 5. The card — what ingested things become

Two words, kept distinct on purpose: an **artifact** is the recorded work — the entry in the log, with its people, provenance, and consent; a **card** is how an artifact appears on the table — its rendered token, with a front and sometimes a back. The log holds artifacts; the field shows cards. **A card is a token of the work, never the work itself** — but the token is cut from the real thing. A card's surface is an **excerpt of the actual work**, chosen by the depositor: a detail of the photograph, bars of the real waveform, one sentence of the manuscript. The desk provides the plinth and the light; it never re-renders or stylizes the work. Tapping a card flips it — the back carries whatever detail the maker chose to attach: full image, files, links, people, provenance. A card without a back simply does not open; no label — the closed card explains itself. At rest everything is a still (no playback, no scrolling); motion is spent only on arrival and the flip, at most one thing moving on the table at any moment. The gestures are placement, the flip, and, later, curation.

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

**MCP is in scope for v0.** A minimal local MCP server is part of the build, not an extension: it makes the project's central sentence — *the desk is an MCP server; every Claude in the building connects to it* — literally true on camera, and it produces the demo's best shot: a terminal running Claude Code, the words "put this on your desk," and a card sliding onto the projected table. Scope discipline: the server is severable — the renderer, seed, replay, and deployed link must be finished and shippable before the MCP layer is touched, and if it isn't done in time, the video ships without the terminal shot and nothing else changes. The deployed web demo never depends on it. A deposit commits only on an explicit human go — Claude never auto-deposits. v0: single deposit tool, called once, after the person confirms the proposed card in-session; the formal stage→confirm two-call protocol is August scope.

Tech: one static HTML page, vanilla JS, no framework, no bundler. Canvas or SVG at the implementer's discretion. The deployed demo is fully client-side: drag-and-drop (or tap-to-upload) turns a visitor's photo into a card in their session only — no persistence, no backend; a tap on a card flips it where a back exists, a tap on empty field uploads. Local filming rig adds a keyboard demo-driver so arrivals can be triggered on cue. The MCP server is local stdio, official SDK, exposing `deposit` (write an artifact into the watched folder; the page picks it up). Static hosting for the link.

The deployed demo appends to a local copy of the stream only — a per-tab fork that never merges. Publishing means appending to the canonical stream, and only the three doors do that (MCP deposit, the hand path, the curator). The hand path is the deposit page for any work from your own device; photographing analog work is its most common act, not its definition. No fourth door: the web demo gets no save, no sign-in, no merge, ever.

Explicitly deferred and named as deferred in the note: hooks, the plugin, the camera, castle-map mode, the lamp, semantic thread-finding, all origami features beyond one seeded crease-pattern card. These are September co-design material, on purpose.

## Working rules (standing, every session)

Self-test thoroughly before asking for feedback, every time it's possible. Machine-checkable things are the implementer's to verify, never the reviewer's: run the determinism test, validate seed.json against the schema, fold at boundary t values (0, mid-event, past-end), exercise append rejections (forward thread refs, bad media, missing excerpt), exercise the flip on a card with a back and the non-response on the card without one, run the MCP deposit including the schema-reject path, load the page through the local server and confirm a clean console. Lightweight dev-only test scripts are encouraged; they don't ship. Never present something as done that hasn't been executed at least once. Stop for feedback only on what only an eye can judge — motion feel, warmth, composition — and open such stops with two lines: what was already verified and how, and the specific judgment needed.

## 7. Time budget and build order

Budget: fast, focused build sessions, with the shoot and edit protected at the end. Order is by dependency and severability, not by clock:

**Core (must ship):** field + card rendering by media type → arrival, settle, drift, strata → threads → seed content pass → replay + demo-driver + fullscreen → client-side drop and flip interactions → deploy and verify on a phone.

**In scope after core is done:** the MCP `deposit` server + folder watcher, wired to the live local field; the desk-voice skill file used to write and polish all captions.

**Optional extensions, in order, only if time remains:** a `browse` tool on the MCP server (a Claude session asking "what's on the desk?" and answering from the log — the 26th-participant-readable-from-any-studio demo, one more strong terminal shot); a live vision captioner for local photo drops (Claude API proposes the caption, human confirms — the intelligence layer's first organ, demonstrated); nothing beyond these two.

**The shoot:** dark room, raw wood, projector down, phone on a stand at a slight angle, exposure locked. Sequence: quiet field with quest cards → arrivals on cue → the terminal deposit via MCP → a thread draws itself → replay → the meta card lands last. Polish budget goes to the first ten seconds and the ending.

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
      "practice": "music",
      "provenance": "mcp | hand | curator",
      "visibility": "room | community | public",
      "excerpt": { "form": "crop | waveform | frames | sentence | lines | linework | render | words", "src": "assets/…", "text": "…" },
      "detail": { "assets": [], "links": [], "note": "" }
    } },
  { "e": "thread", "night": 3, "from": "a-006", "to": "a-014", "why": "same makers" }
] }
```

Distinctions that carry weight: `media` says how the trace is *drawn*; `kind` says how the card *behaves* (quests spawn faded and edgeward, failures take the ashen register, fieldnotes stack in their corner, the meta card closes the demo); `practice` says which craft the work belongs to — music, origami, manuscript — in the depositor's own word, one per artifact, no imposed taxonomy. `practice` renders nothing in v0 but cannot be reconstructed later, and it is the axis the honest record ("where Claude helped, by practice"), cross-practice threads, and the future castle-map all hang on. `excerpt` is the surface and always present in one of its forms; `detail` is the optional back — absent means the card does not open, and that absence is the entire privacy signal. There is no separate `asset` field: surface assets live in `excerpt`, full assets in `detail`. `provenance` names the door — who performed the gesture — never the medium; media already says what the thing is. The enum grows only if a door does, and new doors trigger the full consent machinery. `visibility` exists from day one because consent tiers cannot be retrofitted; the prototype sets everything to `public`.

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

---

# Part B — The full desk (context: where this build is headed)

**August:** renderer matured on this codebase; MCP server grows `browse` and `read_field_notes`; hand/QR path; schema frozen; captioner with the voice skill; deterministic people-threads. The system runs daily on my own desk — a month of dogfooding by its least forgiving user.

**September (co-designed in the team calls, deliberately open until then):** room choice; lamp vs. rig and the edition-IV dynalamps; touch on the physical table (an IR touch frame around the tabletop turns finger-taps into ordinary touch events — no camera, nothing watches, and the web tap gestures work unchanged); scatter vs. castle-map geometry; thread visuals; live-seeding mechanics for the opening night; closing-interview staging; origami affordances, only with Lang and only if he's curious; cohort accounts and the in-kind ask to Anthropic; the legal-wrapper question (a nonprofit entity unlocks Anthropic's nonprofit pricing and grant channels); the night-one consent sentence. Built during September: the one-command `ursprung` plugin, per-practice mini-skills from the pre-retreat calls, the semantic thread-finder with curator review.

**Setup days:** darkness test before anything mounts; rig and calibrate 1:1; LAN with the desk server; offline queue tested by pulling the plug; plugin rehearsed on a volunteer machine; quest cards loaded; full dry run of the live seeding.

**The retreat:** live seeding and the consent sentence on night one; mornings open on overnight arrivals; three deposit doors; fifteen minutes of nightly curation; the Sunday studio walk; replay and log-grounded interview at the closing ceremony. The desk runs itself — its keeper is also the building's fixer.

**After:** the log exported as a structured report plus dataset (the honest record, and the evidence pack for any future funding conversation); material to the film; the between-events web strata at a monthly-letter cadence, never a feed; the desk rides the van to the next edition.
