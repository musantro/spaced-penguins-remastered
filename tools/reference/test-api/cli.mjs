#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  createPhysicsRequest,
  createStateRequest,
  createVerificationRequest,
  listAssets,
  listLevels,
  listScreens,
  parseTraceFile,
  projectRoot,
  runReferenceRequest,
  validateRequest,
} from "./index.mjs";

const argumentsWithoutSeparators = process.argv.slice(2).filter((token) => token !== "--");
const [command = "help", ...tokens] = argumentsWithoutSeparators;
const options = parseOptions(tokens);

try {
  let result;
  if (command === "assets") {
    result = listAssets(projectRoot, { cast: options.cast, type: options.type, name: options.name });
  } else if (command === "screens") {
    result = listScreens(projectRoot);
  } else if (command === "levels") {
    result = listLevels();
  } else if (command === "verify-all") {
    const levelCatalog = listLevels().levels;
    const screenCatalog = listScreens(projectRoot).screens;
    const request = createVerificationRequest({
      id: options.id,
      levels: selectLevels(levelCatalog, options.levels),
      screens: selectScreens(screenCatalog, options.screens),
    });
    result = options.run ? runReferenceRequest(request, { timeoutSeconds: integer(options.timeout, 600) }) : request;
  } else if (command === "physics") {
    const request = createPhysicsRequest({
      id: options.id,
      level: integer(options.level, 1),
      distance: options.distance,
      angleDegrees: options.angle,
      vector: options.vx !== undefined || options.vy !== undefined ? { x: number(options.vx), y: number(options.vy) } : undefined,
      frames: integer(options.frames, 120),
      screenshotFrames: listOfIntegers(options.screenshots),
      initialState: options.snapshot ? loadSnapshot(options.snapshot) : undefined,
    });
    result = options.run ? runReferenceRequest(request, { timeoutSeconds: integer(options.timeout, 240) }) : request;
  } else if (command === "state") {
    const target = targetFromOptions(options);
    const request = createStateRequest({
      id: options.id,
      target,
      frames: integer(options.frames, 1),
      screenshotFrames: listOfIntegers(options.screenshots ?? "0"),
      initialState: options.snapshot ? loadSnapshot(options.snapshot) : undefined,
    });
    result = options.run ? runReferenceRequest(request, { timeoutSeconds: integer(options.timeout, 240) }) : request;
  } else if (command === "run") {
    const requestPath = options._[0];
    if (!requestPath) throw new Error("Uso: run <request.json>");
    const request = validateRequest(JSON.parse(fs.readFileSync(path.resolve(requestPath), "utf8")));
    result = runReferenceRequest(request, { timeoutSeconds: integer(options.timeout, 240) });
  } else if (command === "normalize") {
    const tracePath = options._[0];
    if (!tracePath) throw new Error("Uso: normalize <raw-trace.tsv>");
    result = parseTraceFile(path.resolve(tracePath));
  } else {
    printHelp();
    process.exitCode = command === "help" ? 0 : 1;
    process.exit();
  }

  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), json, "utf8");
  else process.stdout.write(json);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}

function parseOptions(tokens) {
  const options = { _: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (["run"].includes(key)) options[key] = true;
    else options[key] = tokens[++index];
  }
  return options;
}

function targetFromOptions(options) {
  if (options.level !== undefined) return { kind: "level", level: integer(options.level) };
  if (options.label !== undefined) return { kind: "screen", label: options.label };
  if (options.frame !== undefined) return { kind: "frame", frame: integer(options.frame) };
  throw new Error("Indica --level, --label o --frame.");
}

function number(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Valor numérico no válido: ${value}`);
  return result;
}

function integer(value, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  const result = number(value);
  if (!Number.isInteger(result)) throw new Error(`Se esperaba un entero: ${value}`);
  return result;
}

function listOfIntegers(value) {
  if (value === undefined || value === "") return [];
  return value.split(",").map((item) => integer(item.trim()));
}

function selectLevels(levels, selection) {
  if (selection === undefined) return levels;
  if (selection.toLowerCase() === "none") return [];
  const wanted = new Set(listOfIntegers(selection));
  const selected = levels.filter((level) => wanted.has(level.id));
  if (selected.length !== wanted.size) throw new Error(`Selección de niveles no válida: ${selection}`);
  return selected;
}

function selectScreens(screens, selection) {
  if (selection === undefined) return screens;
  if (selection.toLowerCase() === "none") return [];
  const wanted = selection.split(",").map((value) => value.trim().toLowerCase());
  const selected = screens.filter((screen) => wanted.includes(screen.id.toLowerCase()) || wanted.includes(screen.label.toLowerCase()));
  if (selected.length !== new Set(wanted).size) throw new Error(`Selección de pantallas no válida: ${selection}`);
  return selected;
}

function loadSnapshot(snapshotPath) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), "utf8").replace(/^\uFEFF/, ""));
  return parsed.snapshot ?? parsed;
}

function printHelp() {
  process.stdout.write(`API de referencia de Spaced Penguin\n\n` +
    `  assets [--cast Internal] [--type bitmap] [--name ship]\n` +
    `  screens\n` +
    `  levels\n` +
    `  verify-all [--levels 1,2] [--screens Intro,Tips|none] [--run]\n` +
    `  physics --level 1 --distance 100 --angle -137 --frames 120 [--run]\n` +
    `  physics --level 1 --vx -20 --vy -18 --frames 120 [--run]\n` +
    `  state (--level N | --label LABEL | --frame N) [--frames N] [--run]\n` +
    `  run request.json\n` +
    `  normalize raw-trace.tsv\n`);
}
