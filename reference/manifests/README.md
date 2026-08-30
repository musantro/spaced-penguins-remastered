# Reference capture manifests

The images and traces produced by the original projector remain in the ignored
`reference/captures/` directory. A tracked manifest records which canonical
program, scenario, harness, and output set produced an accepted oracle run.

`captureSetSha256` uses `sha256-lines-v1`: sort included files by relative path,
write one UTF-8 line per file as `relative/path<TAB>lowercase-file-sha256<LF>`,
then SHA-256 the resulting byte sequence. Paths use `/` separators.

