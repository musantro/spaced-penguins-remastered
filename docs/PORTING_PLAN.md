# Porting plan

## Decisions

- Fidelity: complete behavior and presentation, including original quirks.
- Platform: current desktop and mobile browsers only.
- Stage: fixed 500 by 400 logical pixels with uniform scaling.
- Method: hybrid reverse engineering. Decompile the target and extract its
  assets, implement the port independently, and validate it against the
  original runtime.
- Scope: the complete game, including menus, instructions, alerts, credits,
  end screens, high-score flow, and links.
- Priority: reach a verified functional replica before explanatory polish.

## Phase 0 — Preservation baseline

Status: complete.

- Download and hash the DVD projector, original-site DCR, and mirror DCR.
- Reconstruct editable DIR files.
- Export Lingo, bytecode, member metadata, bitmaps, vector members, audio, and
  text.
- Establish the original-site DCR as canonical and compare both versions.
- Make the entire preparation process repeatable with repository scripts.

Exit condition: a fresh checkout can reproduce the same inventories and asset
counts without running vintage game code on the host.

## Phase 1 — Reference oracle

Status: complete for the browser-port conformance surface.

- [x] Enable the isolated Windows reference environment.
- [x] Verify the original projector starts, renders, and accepts input.
- [x] Confirm the canonical stage geometry and movie tempo: 500 by 400 at 30
  fps.
- [x] Record a timed level-1 launch through target entry and scoring.
- [x] Recover all five source samples and their Lingo start/stop/loop sites.
- [x] Capture every level entry plus focused end-to-end gameplay scenarios.
- [x] Position, execute, and capture every non-gameplay frame label.
- Obtain a compatible Director authoring environment in the VM and run the
  reconstructed DIR.
- [x] Capture an automated Director-native Lingo trace for handler, statement,
  and evaluated-value ordering.
- [x] Add non-invasive structured state logging and validate its output against
  the untouched projector's observable checkpoints.
- Record the characterization scenarios in `docs/FIDELITY.md`.

Exit condition: at least one launch produces a reproducible per-frame state
trace and matching stage captures from the original runtime.

## Phase 2 — Complete content inventory

Status: complete.

- Decode the score/timeline, frame labels, tempo changes, sprite channels,
  behavior attachments, and per-level parameters.
- Inventory all 110 internal cast members plus the script and text casts.
- Convert vector members into deterministic Canvas-compatible generated assets
  while retaining their original SWFs.
- Record fonts, text metrics, palettes, registration points, inks, and draw
  order.
- Catalog all original external pages and link targets from archived site
  captures.

Exit condition: every original level and screen can be reconstructed from the
inventory without manually guessing coordinates or parameters.

## Phase 3 — Deterministic vertical slice

Status: complete.

- Create the TypeScript fixed-step core and Director compatibility helpers.
- Implement one representative level from load through launch, gravity,
  collision, target entry, and scoring.
- Render it at 500 by 400 with original art and audio.
- Replay the first original trace and close every state and pixel discrepancy.

Exit condition: one canonical input replay passes physics, event, screenshot,
and audio-event tests.

## Phase 4 — Complete game

Status: complete, with the retired high-score CGI handled locally as documented
in `docs/EXTRACTION_REPORT.md`.

- Port all levels and orbiting behavior.
- Port bonuses, crash/bounce, trails, off-screen arrow, animations, and scoring.
- Port title, instructions, alerts, forms, credits, high-score, and end screens.
- Preserve external-link behavior safely; obsolete network services receive an
  explicitly documented compatibility treatment.
- Add keyboard, mouse, and pointer handling without changing original game
  rules.

Exit condition: every inventory item and user-visible branch is implemented.

## Phase 5 — Conformance and browser delivery

Status: complete for Chromium and the static production build. Firefox/WebKit
cross-browser raster baselines remain optional follow-up coverage.

- Run the full numeric trace suite and golden 500 by 400 screenshot suite.
- Verify Chromium, Firefox, and WebKit at multiple CSS scale factors.
- Verify audio unlock, focus loss, pause/resume, and pointer behavior.
- Produce a static, cacheable browser build with no server dependency for game
  logic.
- Document only confirmed deviations from Director 8.

Exit condition: the fidelity contract passes in all supported browsers and the
remaining deviations, if any, are explicit and approved.

## Current maintenance gate

Changes to compatibility math, Score interpretation, asset transforms, or frame
ordering must keep the Director trace and pixel suites green. New browser
features must remain outside the 500 by 400 captured stage unless a deviation
is explicitly approved.
