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

## Reference testing boundary

`tools/reference/test-api/` is a development oracle, not production runtime
code. Its host CLI validates requests and inventories extracted data. Dynamic
requests create a disposable Windows Sandbox with networking, clipboard, and
input-device redirection disabled; original files and the Director cache are
mounted read-only, while one ignored run directory is the only writable host
mapping.

Inside the guest, the harness copies the reconstructed DIR, injects the tracked
observer, drives the original GPS behavior, and emits raw Director values. The
host normalizer turns those observations into the same frame-oriented contract
that the future `core` will implement. Snapshots are explicit data: restoring
one never consults browser time and can be followed by either continued
simulation or a new launch.

This separation keeps conformance expectations independent from the port. The
reference API may observe or control Director, but production code must not
import it or use it to calculate expected results at test time.

Matrix verification reuses one disposable Sandbox while resetting Director's
movie state before each target. The guest publishes its terminal JSON by
atomic rename. Only then does the host request a normal window close and accept
the discard confirmation; it never kills an active remote-desktop connection.
Director Message commands are considered committed only after a guest-written
acknowledgement proves the source length or target configuration.
Stage captures raise the Stage's native container above Director's other child
windows and fail if any visible sibling still overlaps its 500 by 400 surface.

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
