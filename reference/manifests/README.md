# Reference capture manifests

The images and traces produced by the original projector remain in the ignored
`reference/captures/` directory. A tracked manifest records which canonical
program, scenario, harness, and output set produced an accepted oracle run.

`captureSetSha256` uses `sha256-lines-v1`: sort included files by relative path,
write one UTF-8 line per file as `relative/path<TAB>lowercase-file-sha256<LF>`,
then SHA-256 the resulting byte sequence. Paths use `/` separators.

Structured Director API runs are documented by
`testing-api-baseline-20260830.json`. The complete-matrix capture set includes
its request, verification report, movie labels, injected-source count, all 32
raw and normalized traces, and all 39 Stage PNGs. Individual physics and state
replay baselines retain their own request and trace hashes. These files live in
the ignored `reference/test-api/runs/` directory, keeping vintage runtime
output and working movies out of Git while retaining reproducible provenance.
