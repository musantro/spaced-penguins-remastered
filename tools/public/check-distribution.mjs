#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const forbidden = /(?:^|\/)(?:dist|node_modules|\.vercel|\.tools|captures|runs)(?:\/|$)|\.(?:dcr|dir|exe|swf|wav|png|zip)$/i;

const result = spawnSync("git", ["rev-list", "--objects", "--all"], {
  encoding: "utf8",
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "No se pudo inspeccionar el historial de Git.\n");
  process.exit(result.status || 1);
}

const violations = result.stdout
  .split(/\r?\n/)
  .map((line) => line.replace(/^[0-9a-f]+\s+/, ""))
  .filter((path) => path && forbidden.test(path));

if (violations.length > 0) {
  process.stderr.write("Se encontraron paths no publicables en el historial de Git:\n");
  for (const path of [...new Set(violations)]) process.stderr.write(`- ${path}\n`);
  process.exit(1);
}

process.stdout.write("Public distribution check passed: no prohibited artifact paths found.\n");
