---
name: run-desk
description: Launch and verify the desk — serve statically, check resources, headless screenshot, console check, node tests. Use to see any change working and before every stop for eye-feedback.
---

# Run & verify the desk

The page is ES modules — it must be served over http, never opened as `file://`.

## Serve

From the repo root:

```bash
python3 -m http.server 8123 &
```

Stop it with `lsof -ti:8123 -sTCP:LISTEN | xargs -r kill`. Views: `/` (deployed: opening pass, then live) · `/deposit.html` (the hand door standing alone; lays reach same-browser table tabs via BroadcastChannel) · `/?rig` (held, driver keys, `cursor: none`, faint `?` helper in the margin) · `/?specimens` (dev palette surface: every media, kind register, withheld fallback, and thread path — never linked) · `/?cursor=k` (fold at boundary k, motionless — the deterministic screenshot surface) · `&flip=<id>` (that card's back open, for back screenshots) · `&sheet` (the deposit sheet open; use `?cursor=k&sheet` for the byte-stable still — over `/` alone the pass moves beneath it) · append `&debug` for clock narration + the gesture-deadline canary.

## Verify (all machine-checkable — never hand these to the reviewer)

1. **Tests:** `npm test` from the repo root (`node --test`, auto-discovery; expect 0 fail). Covers fold determinism, boundary gating, the continuity bound and the every-boundary legibility floor (D49), append rejections, retirement, queue serialization/flush/deadline, the timeline action matrix and budget-first pacing, corner-radii determinism, specimen coverage.
2. **Resources:** every path returns 200:
   ```bash
   for p in / /deposit.html /desk.css /desk.js /js/stream.js /js/fold.js /js/timeline.js /js/queue.js /js/view.js /js/driver.js /js/cards.js /js/specimens.js /js/deposit.js /js/tray.js /js/editor.js /vendor/codemirror.js /seed.json; do
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
4. **Motion smoke:** load `/` (the pass) and `/?rig` with a virtual-time budget and grep the console — clean means the pass ran to rest without error. **Never pixel-judge motion under virtual time**: headless animation clocks follow real time there (D62), so mid-pass and end-of-pass frames show arriving cards frozen at first-frame opacity. Moving pixels are judged by eye at the stop; run `&debug` only in a real browser (deadline canaries are expected noise under virtual time).
5. **Hand-path end-to-end (after touching deposit/tray/desk wiring):** `node tests/hand-e2e.mjs` with the server up — drives the real sheet over CDP (words/image/audio intakes, push to table → arrival, the set-aside deck and its pick-up, deposit.html → BroadcastChannel → table, the no-table push that keeps the card) and drops eye-stop stills into `/tmp/desk-shots/`. Real-time run, ~90 s.

## Gotchas

- `node --test tests/` fails (tries to load the directory as a module) — use bare `node --test`.
- Screenshot at `--force-device-scale-factor=2` when corner/typography detail matters.
- The seed is 3 events until the seed pass; the full pass timing (~15 s, D60) only shows once the seed grows — don't mistake a ~5 s pass for a pacing bug.
