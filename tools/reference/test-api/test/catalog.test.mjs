import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listLevels, listScreens, parseCsv } from "../catalog.mjs";

test("parseCsv preserves quoted commas and quotes", () => {
  assert.deepEqual(parseCsv('Number,Name\r\n1,"a,b"\r\n2,"a""b"\r\n'), [
    { Number: "1", Name: "a,b" },
    { Number: "2", Name: 'a"b' },
  ]);
});

test("levels map the verified GPS gameplay frames 11 through 35", () => {
  const catalog = listLevels();
  assert.equal(catalog.count, 25);
  assert.deepEqual(catalog.levels[0], { id: 1, movieFrame: 11, target: { kind: "level", level: 1 } });
  assert.equal(catalog.levels.at(-1).movieFrame, 35);
});

test("the confirmed screen catalog is complete without relying on a previous run", () => {
  const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), "sp-screens-"));
  const catalog = listScreens(emptyProject);
  assert.equal(catalog.count, 7);
  assert.deepEqual(catalog.screens.map((screen) => screen.label), [
    "Load", "Intro", "Tips", "Levels", "HS FM", "End_Stats", "HS_Sending",
  ]);
});
