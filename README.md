# Spaced Penguins Remastered

A faithful browser port of Big Idea's 2002 Macromedia Director game *Spaced
Penguin*.

The project is currently in its preservation and verification phase. Original
art, sound, text, Lingo, bytecode, and member metadata can already be recovered
reproducibly; production gameplay work begins after the original runtime oracle
can emit an authoritative trajectory trace.

Start with:

- `docs/PORTING_PLAN.md` for milestones;
- `docs/FIDELITY.md` for the verification contract;
- `docs/ARCHITECTURE.md` for the target browser design;
- `reference/originals/README.md` for provenance and checksums.

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
