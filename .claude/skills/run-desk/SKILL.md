---
name: run-desk
description: Launch and verify the desk — serve statically, check resources, headless screenshot, console check, node tests. Use to see any change working and before every stop for eye-feedback.
---

# Run & verify the desk

The page is ES modules — it must be served over http, never opened as `file://`.

## Serve

From the repo root:

```bash
mkdir -p drop/assets && touch drop/stream.jsonl   # the MCP door's file — a ?live tab warns without it
python3 -m http.server 8123 &
```

Stop it with `lsof -ti:8123 -sTCP:LISTEN | xargs -r kill`. Views: `/` (deployed: opening pass, then live) · `/deposit.html` (the hand door standing alone; lays reach same-browser table tabs via BroadcastChannel) · `/?rig` (held, driver keys, `cursor: none`, faint `?` helper in the margin) · `/?specimens` (dev palette surface: every media, kind register, withheld fallback, and thread path — never linked) · `/?castle` (dev crowd surface: 25 people, 101 cards, the density that broke the scatter — the only place the legibility floor is visible; still at `?castle&cursor=102`) · `/?cursor=k` (fold at boundary k, motionless — the deterministic screenshot surface) · `&flip=<id>` (that card's back open, for back screenshots) · `&sheet` (the deposit sheet open; use `?cursor=k&sheet` for the byte-stable still — over `/` alone the pass moves beneath it) · `&live` (watches the MCP drop file — local only, D105) · `&tail=k` (holds the last k events back until `m`, D111) · append `&debug` for clock narration + the gesture-deadline canary.

## Verify (all machine-checkable — never hand these to the reviewer)

1. **Tests:** `npm test` from the repo root (`node --test`, auto-discovery; expect 0 fail). Covers fold determinism, boundary gating, the continuity bound and the every-boundary legibility floor (D49), append rejections, retirement, queue serialization/flush/deadline, the timeline action matrix and budget-first pacing, corner-radii determinism, specimen coverage.
2. **Resources:** every path returns 200:
   ```bash
   for p in / /deposit.html /desk.css /desk.js /js/stream.js /js/fold.js /js/timeline.js /js/queue.js /js/view.js /js/driver.js /js/cards.js /js/specimens.js /js/deposit.js /js/tray.js /js/editor.js /js/live.js /vendor/codemirror.js /seed.json /drop/stream.jsonl; do
     printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8123$p")" "$p"; done
   ```
3. **Render + console.** No chromium-cli or playwright npm package on this machine; use the cached Playwright headless shell directly:
   ```bash
   SHELL_BIN="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
   "$SHELL_BIN" --headless --disable-gpu --window-size=1440,900 --force-device-scale-factor=2 \
     --hide-scrollbars --enable-logging=stderr --v=0 --virtual-time-budget=4000 \
     --screenshot=/tmp/desk.png "http://localhost:8123/?cursor=3" 2>&1 | grep -E "CONSOLE|ERROR"
   ```
   The grep must print nothing (console clean). Screenshot **stills** via `?cursor=k` (empty `0`, a mid boundary, the full stream), `?specimens`, `?cursor=k&sheet`, and `/deposit.html`; these are pixel-stable — two runs of the same view must byte-match (`cmp`; the headless shell's fresh profile keeps the tray empty). Then **look at the PNGs** — a blank frame is a failure to launch, and the screenshots are what accompany any stop for eye-feedback (BRIEF "Working rules").
4. **Motion smoke:** load `/` (the pass), `/?rig`, and `/?live` with a virtual-time budget and grep the console — clean means the pass ran to rest without error. **Never pixel-judge motion under virtual time**: headless animation clocks follow real time there (D62), so mid-pass and end-of-pass frames show arriving cards frozen at first-frame opacity. Moving pixels are judged by eye at the stop; run `&debug` only in a real browser (deadline canaries are expected noise under virtual time).
5. **Hand-path end-to-end (after touching deposit/tray/desk wiring):** `node tests/hand-e2e.mjs` with the server up — drives the real sheet over CDP (words/image/audio intakes, push to table → arrival, the set-aside deck and its pick-up, deposit.html → BroadcastChannel → table, the no-table push that keeps the card) and drops eye-stop stills into `/tmp/desk-shots/`. Real-time run, ~90 s.
6. **MCP door (after touching `mcp/`, `js/live.js`, or the `?live`/`?tail` wiring):** `npm test` already covers the core, the reader, and the protocol over real stdio (the protocol suite skips itself until `cd mcp && npm install` has run). Then `node tests/mcp-e2e.mjs` with the server up — truncates the drop file, drives `/?live&tail=1` over CDP, deposits through the real server, and walks the whole take: arrival within a poll, the held-wait, the re-deal, `m` landing meta last, a refusal that never reaches the table. Stills land in `/tmp/desk-shots/mcp-*.png`. ~40 s.
7. **The pile's two-beat (after touching `js/view.js`'s spread, `js/fold.js`'s piles, or the tap wiring in `desk.js`):** `node tests/pile-e2e.mjs` with the server up — drives `?castle` (never `?cursor=`, which returns before any hand is attached, D62), waits for the table to stop moving (the last event is the arrangement, which moves every studio at once), then taps a studio open, reads a card out of it, and taps the wood to lay it back. Stills land in `/tmp/desk-shots/pile-*.png`. ~30 s.
8. **The room server (after touching `mcp/room.mjs`, `mcp/people.mjs`, `httpSink`, or the static allowlist):** `npm test` covers the core rules and the whole HTTP surface (`tests/room-core.test.js`, `tests/room-http.test.mjs` — the latter skips itself until `cd mcp && npm install` has run, and starts a real server on an ephemeral port). Then `node tests/room-e2e.mjs` — no static server needed, it runs its own room on its own log under `drop/e2e-room/`: two browser windows stand for two devices, a phone writes at `deposit.html?t=…`, pushes, and the card appears on the table. Stills land in `/tmp/desk-shots/room-*.png`. ~25 s. **What none of this can check** is two real devices on one wifi — do that by hand before trusting it in a room, and test `.local` on an Android phone specifically.
9. **Set it up as a stranger (after touching `mcp/`, `.mcp.json`, or the install story):** the tests all pass from inside a working checkout, so they cannot see a broken setup. Copy the tree without its installed parts and start from nothing:
   ```bash
   rsync -a --exclude node_modules --exclude drop --exclude .git ./ /tmp/fresh-desk/
   (cd /tmp/fresh-desk/mcp && npm ci)   # then speak to /tmp/fresh-desk/mcp/server.mjs over stdio
   ```
   This is how D122 was found — the door started, said nothing, and answered nothing, because `/tmp` is a symlink. A silent server passes every test in the suite.
10. **The fold is untouched:** after any change outside the render path, prove the stills did not move — serve a pristine `HEAD` worktree beside the working tree and byte-compare:
   ```bash
   git worktree add --detach /tmp/desk-baseline HEAD && (cd /tmp/desk-baseline && python3 -m http.server 8124 &)
   # screenshot ?cursor=0,7,15,22 · ?specimens on both ports, then `cmp` each pair
   git worktree remove /tmp/desk-baseline
   ```

## Gotchas

- `node --test tests/` fails (tries to load the directory as a module) — use bare `node --test`.
- Screenshot at `--force-device-scale-factor=2` when corner/typography detail matters.
- The seed is 3 events until the seed pass; the full pass timing (~15 s, D60) only shows once the seed grows — don't mistake a ~5 s pass for a pacing bug.
