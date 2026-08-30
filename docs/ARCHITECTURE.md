# Target architecture

## Technology decision

Use vanilla TypeScript, Canvas 2D, Web Audio, Vite, Vitest, and Playwright.
Avoid a UI framework: the original is a fixed Director stage driven by a score,
sprites, and frame handlers, so a small deterministic runtime is a better fit
than a component lifecycle. Rust and WebAssembly remain options only if later
profiling identifies a real need.

## Runtime boundaries

- `core`: pure deterministic state and one-frame transitions;
- `director-compat`: observed Director 8 math, point, rectangle, random,
  collision, and conversion semantics;
- `content`: levels, frame labels, sprite placements, behavior parameters,
  text, links, and asset metadata extracted into reviewed data;
- `render`: a 500 by 400 Canvas renderer with explicit registration points,
  palettes, inks, visibility, rotation, scaling, and draw order;
- `audio`: decoded original samples and a frame-indexed event scheduler;
- `input`: browser events quantized into game-frame input records;
- `shell`: boot, loading, focus, scaling, and optional debugging controls that
  do not alter the game stage.

The core exposes `tick(input): FrameSnapshot`. Tests can advance it without a
browser or wall clock. The browser loop accumulates elapsed time and calls the
same fixed-step function; it never feeds variable delta time into game physics.

## Fidelity-oriented rules

- Preserve original logical coordinates and registration points.
- Keep raw extracted assets immutable; transformations are generated.
- Store levels and timeline data as data, not hand-positioned rendering code.
- Centralize every compatibility quirk in `director-compat` and attach a
  reference trace or test to it.
- Never use browser frame rate as the simulation clock.
- Never generate golden expected values from production implementation code.
- Do not substitute recreated art, audio, or copy where an original asset is
  available.
- Keep optional debug overlays outside captured stage pixels.
