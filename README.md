# Spaced Penguins Remastered

> A preservation-minded, faithful browser port of Big Idea's 2002 *Spaced
> Penguin* game.

[Play the live demo](https://spaced-penguins-remastered.vercel.app/) · [Report a bug](https://github.com/musantro/spaced-penguins-remastered/issues)

Spaced Penguins Remastered recreates the original Director game as a static
browser experience built with TypeScript, Canvas 2D and Web Audio. It keeps the
original 500 × 400 logical stage, 30 fps simulation, 25 playable levels,
menus, scoring flow and input quirks while adding support for current desktop
and mobile browsers.

## Status

The playable port is deployed at
<https://spaced-penguins-remastered.vercel.app/>.

The implementation is verified against independent traces and captures from
the original Director runtime. The port is intentionally a static site: it has
no application server, account system or global leaderboard. The high-score
form stays local to the browser and does not send personal data to the retired
Big Idea CGI endpoint.

## Distribution boundary

This public repository contains source code, tests, documentation, manifests
and reproducible tooling. It does **not** contain the original DCR/projector,
reconstructed DIR movie, extracted cast, generated web assets, screenshots,
Director installer or Sandbox output. Those files are third-party or local
reference material and are excluded from Git by design. See
[`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) for the complete boundary and
the clean-clone limitations.

Because the deployed bundle is built from locally held reference material, a
fresh public clone cannot recreate the live game's asset bundle until that
material has been obtained and verified locally. Do not commit those files.

## Play locally

If you only want to play, use the [live demo](https://spaced-penguins-remastered.vercel.app/).

To recreate the full local build, use Windows 11 Pro with Windows Sandbox
enabled, Node.js 22 or newer and pnpm 10:

```powershell
pnpm install
pnpm reference:prepare
pnpm assets:generate
pnpm dev
```

Open the URL printed by Vite. The stage always simulates at 500 × 400 logical
pixels and 30 frames per second, then scales uniformly to the available
viewport.

The supported setup path prepares and verifies the local reference material,
then runs the vintage runtime only inside a disconnected Windows Sandbox:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-environment.ps1
```

Never run `Spaced_Penguin.exe` or `Director.exe` directly on the host. The
reference workflow and its safety boundary are documented in
[`docs/FIDELITY.md`](docs/FIDELITY.md).

## Build and test

After the local reference material is prepared:

```text
pnpm build       # static production build in dist/
pnpm typecheck   # TypeScript validation
pnpm test:web    # deterministic core and rendering tests
pnpm test        # Director reference API contract tests
pnpm test:e2e    # Chromium browser and pixel tests
pnpm check:public # distribution policy, including reachable Git history
```

The reference API can inventory levels and screens, run isolated Director
queries and replay snapshots. Its commands and schemas are documented in
[`docs/TESTING_API.md`](docs/TESTING_API.md).

## Repository map

- `src/core/` — deterministic game state, physics and scoring;
- `src/director-compat/` — compatibility rules characterized against Director;
- `src/content/` — generated content loading and public content types;
- `src/render/` and `src/audio/` — Canvas 2D and Web Audio adapters;
- `tests/` and `src/**/*.test.ts` — browser, pixel and unit coverage;
- `tools/web/` — local asset/content generation;
- `tools/reference/` — isolated reference-runtime tooling;
- `docs/` — architecture, fidelity, extraction and distribution notes;
- `reference/manifests/` — provenance and hashes without the underlying files.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull
request. Small, evidence-backed changes are preferred, especially around
compatibility math, frame ordering, assets and input handling.

## License and attribution

The original source code, tests, documentation and tooling in this repository
are available under the [MIT License](LICENSE). The original *Spaced Penguin*
game, artwork, text, sound and Director materials are third-party works; they
are not included in this repository and are not relicensed here. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
