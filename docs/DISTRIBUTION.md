# Public distribution policy

This repository is intended to be readable and safe to publish as source,
while the original game's reference files remain local preservation material.

## Included in Git

- TypeScript source, tests and browser shell;
- reference schemas, scenarios, instrumentation and hash manifests;
- scripts that reproduce the local extraction and verification workflow;
- technical documentation and project configuration.

## Intentionally excluded from Git

The following are ignored and must stay out of every public branch and release:

- the original Big Idea DCR and `Spaced_Penguin.exe` projector;
- reconstructed Director `DIR` movies and decompiled/extracted cast output;
- original and generated web assets, including PNG, SWF and WAV files;
- Windows Sandbox captures, traces, temporary run directories and caches;
- downloaded installers, archives, local Vercel state and environment files.

The tracked manifests record provenance and SHA-256 hashes without redistributing
the corresponding files. `reference/originals/README.md` describes the
canonical inputs and their sources.

## Clean-clone expectations

The full game build depends on locally prepared reference material. A fresh
clone therefore has the source and verification tooling, but not the original
or generated asset bundle required by `pnpm assets:generate`. The command fails
early when that material is absent instead of silently creating an incomplete
build. The Vercel deployment is a separately produced static artifact.

Authorized local setup is documented in the README and in
[`docs/FIDELITY.md`](FIDELITY.md). The vintage runtime must run only inside the
disconnected Windows Sandbox workflow; never launch it directly on the host.

## Rights boundary

The MIT license applies to the project-authored source code, tests,
documentation and tooling. It does not grant rights to the original game or
its artwork, text, sound, Director files or other third-party material. Anyone
redistributing a build must independently confirm that they have the rights
needed for the included assets.

## Before publishing a branch

Run these checks from the repository root:

```powershell
git status --short
git ls-files | Select-String '\.(dcr|dir|exe|swf|wav|png|zip)$'
git ls-files | Select-String '(^|/)(dist|node_modules|\.vercel|\.tools|captures|runs)/'
git log --all --stat
```

The two `Select-String` commands should return no paths. If a prohibited file
was ever committed, remove it from the entire repository history before
changing visibility; deleting it only from the latest tree is not enough.
