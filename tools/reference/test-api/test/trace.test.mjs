import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseTraceFile } from "../trace.mjs";

test("trace parser derives collision and bonus events", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sp-trace-"));
  const tracePath = path.join(directory, "trace.tsv");
  const header = "sample\tticks\tmovieFrame\tframeLabel\tphase\tgpsChannel\tstate\tpointX\tpointY\tvelocityX\tvelocityY\tspriteX\tspriteY\tstateFrameCount\ttries\tdistance\tscore\talert\tstageInside\tflightInside\ttargetContact\tplanetInfluences\tplanetContacts\tplanets\tbonuses\tevent";
  const row0 = "0\t1\t11\t\tinitial\t36\t#soaring\t1\t2\t3\t4\t1\t2\t0\t1\t0\t0\t0\t1\t1\t0\t5:20:100\t\t5:10:10:100:20:100::::\t20:#notHit:50:1:0:3\t";
  const row1 = "1\t2\t11\t\texitFrame\t36\t#crashed\t4\t6\t3\t4\t4\t6\t300\t1\t5\t0\t0\t1\t1\t0\t5:5:100\t5:5:20\t5:10:10:100:20:100::::\t20:#Hit:50:2:30:29.9\tplanet";
  fs.writeFileSync(tracePath, `-- "${header}"\n-- "${row0}"\n-- "${row1}"\n`);
  const trace = parseTraceFile(tracePath);
  assert.equal(trace.sampleCount, 2);
  assert.equal(trace.samples[0].frameLabel, null);
  assert.deepEqual(trace.events.map((event) => event.type), ["state", "planet-collision", "bonus-collected"]);
  assert.equal(trace.snapshot.gps.state, "crashed");
});
