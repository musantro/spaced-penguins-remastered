# Original reference artifacts

The original game files are downloaded into the ignored `files/` directory.
They are reference material and are not committed to this repository.

Run `pnpm reference:prepare` to download, verify, decompile, inspect, and
extract them. Do not run the vintage `Spaced_Penguin.exe` projector directly
on the host operating system; use the isolated reference environment described
in `docs/FIDELITY.md`.

## Canonical inputs

| File | Bytes | SHA-256 | Provenance |
| --- | ---: | --- | --- |
| `Doom_Funnel.zip` | 5,133,916 | `9621b27df00f8c055621aa67a5b6d2312cd4d2aaa706241d6f4b7ba594049d6c` | Internet Archive item `BIDVD2005` |
| `spacedpenguin_bigidea_20020806.dcr` | 92,896 | `22d7a9f9455467c277a0ea920cf1042073f7744446aaecb40476f586941df102` | 2002-08-06 capture of the original Big Idea site |
| `spacedpenguin_albinoblacksheep.dcr` | 94,820 | `1b9b2c3878de8bc04551b21a2923352b8f4ae688ea6966aa7fc68731498cb614` | Albino Blacksheep mirror |
| `Spaced_Penguin.exe` | 3,115,448 | `318c0d9c2cb8357c006c017fb3875e75808754b3a2571a54b5f66f5fa9149584` | Extracted from `Doom_Funnel.zip`; both copies in the ZIP are identical |

The Big Idea DCR is the canonical web version because its provenance is the
original publisher's site. The mirror is retained as an independent secondary
copy. Their gameplay, physics, planet, scoring, bonus, and looping Lingo scripts
are identical. The differences found so far are limited to high-score network
configuration and an orbiting notification.

## Tools pinned by the preparation scripts

| Tool | Version | SHA-256 / integrity source | Purpose |
| --- | --- | --- | --- |
| ProjectorRays | 0.2.0 | `e9814428ee503cf129b6f5cff54524177b7bdd63201a9095d8d19433535c70db` | Reconstruct editable DIR files |
| `projectorrays` npm package | 1.1.1 | `pnpm-lock.yaml` | Export Lingo, bytecode, and chunk inventories |
| Director Cast Ripper D10 | 2.7 | `e91de4c786c5a4e31ab960709596b93c20f1e3eb874aa252519f520b1cc6be2f` | Export bitmap, vector, audio, text, and member metadata |
