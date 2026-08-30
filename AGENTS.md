# Project instructions

Read `docs/PORTING_PLAN.md`, `docs/FIDELITY.md`, and `docs/ARCHITECTURE.md`
before changing game or reference code.

- Do not run `Spaced_Penguin.exe` on the host operating system.
- Treat the original Big Idea DCR as the canonical program.
- Preserve original logical coordinates, frame ordering, assets, text, and
  quirks unless a deviation is explicitly approved.
- Keep simulation code deterministic and independent of the browser clock.
- Do not generate expected conformance data from the implementation under test.
- Every Director compatibility rule needs an independent reference trace or a
  focused characterization test.
- Keep downloaded originals, extracted assets, captures, and local tools out of
  Git; record their provenance and hashes instead.
- Prefer small vertical slices that can be checked against the original runtime
  before broad implementation.
