# Contributing

Thanks for helping preserve this small browser game.

## Before opening a pull request

- explain the user-visible or preservation-related reason for the change;
- keep the 500 × 400 logical stage, 30 fps simulation and authored behavior
  unchanged unless the pull request documents an intentional deviation;
- add or update an independent characterization test when changing Director
  compatibility behavior;
- run the relevant tests and include the commands and results in the PR;
- do not add original DCR/DIR/projector files, extracted assets, generated
  assets, captures, installers, Sandbox output or secrets to Git.

## Reference-runtime safety

The vintage projector and Director authoring environment must run only through
the disconnected Windows Sandbox scripts. Never launch `Spaced_Penguin.exe` or
`Director.exe` directly on the host. See [`docs/FIDELITY.md`](docs/FIDELITY.md)
and [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

## Pull requests

Keep changes focused and easy to review. For rendering or interaction changes,
describe the affected screen, input path or frame boundary. For generated
content changes, include the updated provenance/hash manifest rather than the
underlying third-party files.
