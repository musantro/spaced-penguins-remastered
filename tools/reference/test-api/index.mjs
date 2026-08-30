import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { listAssets, listLevels, listScreens } from "./catalog.mjs";
export { createPhysicsRequest, createScoreInventoryRequest, createStateRequest, createVerificationRequest, validateRequest } from "./request.mjs";
export { parseTraceFile } from "./trace.mjs";

import { validateRequest } from "./request.mjs";
import { parseTraceFile } from "./trace.mjs";
import { parseScoreFiles } from "./score.mjs";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function runReferenceRequest(request, { timeoutSeconds = 240 } = {}) {
  validateRequest(request);
  const runsRoot = path.join(projectRoot, "reference", "test-api", "runs");
  fs.mkdirSync(runsRoot, { recursive: true });
  const runDirectory = path.join(runsRoot, request.id);
  if (fs.existsSync(runDirectory)) {
    throw new Error(`Ya existe una ejecución con id ${request.id}: ${runDirectory}`);
  }
  fs.mkdirSync(runDirectory);
  const requestPath = path.join(runDirectory, "request.json");
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

  const script = path.join(projectRoot, "tools", "reference", "start-test-api-sandbox.ps1");
  const execution = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-RunDirectory", runDirectory, "-TimeoutSeconds", String(timeoutSeconds)],
    { cwd: projectRoot, encoding: "utf8", timeout: (timeoutSeconds + 20) * 1000 },
  );
  if (execution.error) throw execution.error;
  if (execution.status !== 0) {
    throw new Error([execution.stderr, execution.stdout].filter(Boolean).join("\n").trim());
  }

  const statusPath = path.join(runDirectory, "result.json");
  if (!fs.existsSync(statusPath)) throw new Error("El Sandbox terminó sin producir result.json.");
  const status = JSON.parse(fs.readFileSync(statusPath, "utf8").replace(/^\uFEFF/, ""));
  if (status.status !== "completed") throw new Error(status.message || "La ejecución de Director falló.");

  if (request.operation === "verify-all") {
    const verification = normalizeVerificationRun(request, status, runDirectory);
    const verificationPath = path.join(runDirectory, "verification.json");
    fs.writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");
    if (!verification.passed) {
      const failedIds = verification.entries.filter((entry) => !entry.passed).map((entry) => entry.id);
      throw new Error(`Falló la verificación de ${failedIds.join(", ")}. Informe: ${verificationPath}`);
    }
    return { ...status, runDirectory, verification: verificationPath, summary: verification.summary };
  }
  if (request.operation === "score") {
    const scorePaths = (Array.isArray(status.scoreEntries) ? status.scoreEntries : [status.scoreEntries])
      .filter(Boolean)
      .map((entry) => path.join(runDirectory, entry.score));
    const score = parseScoreFiles(scorePaths);
    const scorePath = path.join(runDirectory, "score.json");
    fs.writeFileSync(scorePath, `${JSON.stringify(score, null, 2)}\n`, "utf8");
    return { ...status, runDirectory, score: scorePath, summary: score.summary };
  }

  const tracePath = path.join(runDirectory, status.rawTrace);
  const trace = parseTraceFile(tracePath);
  const traceJsonPath = path.join(runDirectory, "trace.json");
  fs.writeFileSync(traceJsonPath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return { ...status, runDirectory, trace: traceJsonPath, snapshot: trace.snapshot };
}

function normalizeVerificationRun(request, status, runDirectory) {
  const producedEntries = Array.isArray(status.verificationEntries)
    ? status.verificationEntries
    : status.verificationEntries
      ? [status.verificationEntries]
      : [];
  const statusById = new Map(producedEntries.map((entry) => [entry.id, entry]));
  const entries = request.targets.map((requested) => {
    const produced = statusById.get(requested.id);
    if (!produced) {
      return { id: requested.id, target: requested.target, expected: requested.expected, passed: false, checks: { outputProduced: false } };
    }
    const rawTracePath = path.join(runDirectory, produced.rawTrace);
    const trace = parseTraceFile(rawTracePath);
    const tracePath = path.join(runDirectory, `trace-${requested.id}.json`);
    fs.writeFileSync(tracePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    const first = trace.samples[0];
    const last = trace.samples.at(-1);
    const screenshotPath = path.join(runDirectory, produced.screenshot);
    const dimensions = readPngDimensions(screenshotPath);
    const entryScreenshotDimensions = produced.entryScreenshot
      ? readPngDimensions(path.join(runDirectory, produced.entryScreenshot))
      : null;
    const checks = {
      outputProduced: true,
      entryMovieFrame:
        requested.expected.movieFrame === undefined || produced.acknowledgedFrame === requested.expected.movieFrame,
      entryFrameLabel:
        requested.expected.entryFrameLabel === undefined || produced.acknowledgedFrameLabel === requested.expected.entryFrameLabel,
      sampleCount: trace.sampleCount === (requested.expected.physics ? 2 : 1),
      movieFrame: requested.expected.movieFrame === undefined || first.movieFrame === requested.expected.movieFrame,
      frameLabel: requested.expected.frameLabel === undefined || first.frameLabel === requested.expected.frameLabel,
      level: requested.expected.level === undefined || first.level === requested.expected.level,
      gpsReady: requested.target.kind !== "level" || (first.gpsChannel > 0 && first.state !== null),
      physicsStarted:
        !requested.expected.physics ||
        (first.state === "snapping" && Number.isFinite(first.velocityX) && Number.isFinite(first.velocityY)),
      screenshotSample: produced.requestedSample === produced.observedSample,
      screenshotSize: dimensions.width === 500 && dimensions.height === 400,
      entryScreenshotSize:
        requested.target.kind !== "screen" ||
        (entryScreenshotDimensions?.width === 500 && entryScreenshotDimensions?.height === 400),
    };
    return {
      id: requested.id,
      target: requested.target,
      expected: requested.expected,
      observed: {
        movieFrame: first.movieFrame,
        frameLabel: first.frameLabel,
        level: first.level,
        state: first.state,
        gpsChannel: first.gpsChannel,
        planetCount: first.planets.length,
        bonusCount: first.bonuses.length,
        finalState: last.state,
        finalPoint: { x: last.pointX, y: last.pointY },
      },
      rawTrace: produced.rawTrace,
      trace: path.basename(tracePath),
      screenshot: produced.screenshot,
      score: produced.score ?? null,
      screenshotDimensions: dimensions,
      entryScreenshot: produced.entryScreenshot ?? null,
      entryScreenshotDimensions,
      acknowledgedTarget: {
        movieFrame: produced.acknowledgedFrame,
        frameLabel: produced.acknowledgedFrameLabel,
      },
      checks,
      passed: Object.values(checks).every(Boolean),
    };
  });
  const levelEntries = entries.filter((entry) => entry.target.kind === "level");
  const screenEntries = entries.filter((entry) => entry.target.kind === "screen");
  return {
    schemaVersion: 1,
    source: "Macromedia Director 8 Trial in disconnected Windows Sandbox",
    requestId: request.id,
    passed: entries.every((entry) => entry.passed),
    summary: {
      total: entries.length,
      passed: entries.filter((entry) => entry.passed).length,
      failed: entries.filter((entry) => !entry.passed).length,
      levels: { total: levelEntries.length, passed: levelEntries.filter((entry) => entry.passed).length },
      screens: { total: screenEntries.length, passed: screenEntries.filter((entry) => entry.passed).length },
    },
    entries,
  };
}

function readPngDimensions(pngPath) {
  const bytes = fs.readFileSync(pngPath);
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`La captura no es un PNG válido: ${pngPath}`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
