# Spaced Penguins Remastered

A faithful, static browser port of Big Idea's 2002 Macromedia Director game
*Spaced Penguin*. The production build is framework-free HTML, CSS, Canvas 2D,
Web Audio, and JavaScript compiled from vanilla TypeScript. It contains all 25
authored levels and uses the original art, text, and sound.

Start with:

- `docs/PORTING_PLAN.md` for milestones;
- `docs/FIDELITY.md` for the verification contract;
- `docs/ARCHITECTURE.md` for the target browser design;
- `docs/TESTING_API.md` for the isolated Director testing API;
- `docs/EXTRACTION_REPORT.md` for the extracted content and port evidence;
- `reference/originals/README.md` for provenance and checksums.

## Run the browser port

After the reference material has been prepared once, generate the ignored web
assets and start Vite:

```text
pnpm install
pnpm assets:generate
pnpm dev
```

Open the URL printed by Vite. The stage always simulates at 500 by 400 logical
pixels and 30 frames per second, then scales uniformly to the window. A static
release is written to `dist/` with:

```text
pnpm build
```

No application server is required for the release. To run the deterministic
state tests, Director-reference API tests, and browser/pixel tests:

```text
pnpm test:web
pnpm test
pnpm test:e2e
```

The original Big Idea high-score CGI no longer forms part of the static build.
Completing the game opens the locally adapted single-Nickname score form and
keeps the sending transition, but does not transmit personal data.

## Set up a fresh clone

On Windows 11 Pro with Windows Sandbox enabled, run the environment bootstrap
from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-environment.ps1
```

If pnpm is already available, the equivalent package command is:

```text
pnpm setup:environment
```

The script installs the locked Node.js dependencies; downloads and verifies the
originals and tools; reconstructs the canonical DIR; and downloads the verified
Director 8 trial. On a clean clone it then opens the disconnected Windows
Sandbox, installs Director once, creates `.tools/director8-cache/`, and leaves
Director open with the reconstructed game loaded. The script is idempotent:
later runs validate and reuse a matching cache. Use `-RebuildDirectorCache` only
when an intentional clean rebuild is required; the previous cache is retained
under a timestamped `.tools/director8-cache.invalid-*` backup.

## Prepare local reference material

Install Node.js 22 or newer and pnpm, then run:

```text
pnpm install
pnpm reference:prepare
```

Those lower-level commands remain useful when only the preserved material is
needed; a new development machine should normally use the setup script above.

Generated original and derived files are intentionally ignored by Git. Never
run the downloaded vintage projector directly on the host; use the isolated
reference setup described in the fidelity document.

With Windows Sandbox enabled, close any existing Sandbox window and run:

```text
pnpm reference:capture
```

This starts the original only inside the disconnected Sandbox, replays the
tracked first-level scenario, and writes timestamped 500 by 400 captures under
the ignored `reference/captures/` directory.

To build the isolated Director 8 authoring oracle, inject the reference
observer, discover debugger commands, and verify native Lingo tracing without
screenshots, run:

```text
pnpm reference:authoring
```

The first run installs Director inside Windows Sandbox and writes a reusable,
ignored application cache under `.tools/director8-cache/`. Later runs restore
that cache, keep the writable `reference/authoring/spacedpenguin_instrumented.dir`
movie, and open it directly in Director; the vintage installer is not run
again. The cache is writable only while it is first prepared and is mapped
read-only on later runs. Windows Sandbox itself remains disposable, with
networking and host clipboard access disabled. Delete the local cache only
when an intentional clean reinstall is required.

## Query the Director reference runtime

The testing API runs Director only inside the disconnected Windows Sandbox and
returns normalized JSON. It can inventory assets, screens, and levels; launch
Kevin from polar or vector input; capture per-frame trajectories and events;
and restore a prior gameplay snapshot.

```text
pnpm reference:assets -- --name ship
pnpm reference:screens
pnpm reference:levels
pnpm reference:verify-all
pnpm reference:physics -- --level 1 --distance 100 --angle -148.36 --frames 120
pnpm reference:state -- --level 1 --snapshot reference/test-api/runs/<run>/trace.json --frames 30
```

Run directories and screenshots are local evidence under the ignored
`reference/test-api/runs/` tree. See `docs/TESTING_API.md` for the request and
trace schemas, capture ordering, and safety boundary.
