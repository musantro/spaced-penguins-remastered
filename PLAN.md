# Project roadmap

The complete static browser port is implemented and deployed at
<https://spaced-penguins-remastered.vercel.app/>. The remaining work is
maintenance and preservation rather than a missing gameplay phase.

## Completed

- preserved and independently characterized the original Director runtime;
- implemented all 25 playable levels and the authored menu/end-screen flow;
- kept the simulation deterministic at 500 × 400 logical pixels and 30 fps;
- added isolated Director reference tooling, state traces and pixel checks;
- deployed a static browser build for desktop and mobile pointer input;
- documented the distribution boundary for third-party and local reference
  material.

## Next maintenance slices

1. Expand focused characterization coverage when a compatibility rule changes.
2. Keep Chromium baselines green and add cross-browser checks where rasterizing
   behavior can be made stable.
3. Refresh the deployment only from verified local reference material.
4. Improve public documentation without changing the authored game surface.

See [`docs/PORTING_PLAN.md`](docs/PORTING_PLAN.md) for the detailed technical
history and [`docs/FIDELITY.md`](docs/FIDELITY.md) for the conformance contract.
