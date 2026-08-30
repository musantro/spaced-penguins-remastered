#!/usr/bin/env node

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { listAssets } from "../reference/test-api/catalog.mjs";
import { parseScoreFiles } from "../reference/test-api/score.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const castRoot = path.join(projectRoot, "reference", "derived", "cast-ripper", "bigidea-20020806", "spacedpenguin_bigidea_20020806");
const scorePrimary = path.join(projectRoot, "reference", "test-api", "runs", "score-inventory-final-64-20260830");
const scoreFallbackA = path.join(projectRoot, "reference", "test-api", "runs", "score-inventory-64-20260830");
const scoreFallbackB = path.join(projectRoot, "reference", "test-api", "runs", "score-inventory-final-61-64-20260830");
const matrixRoot = path.join(projectRoot, "reference", "test-api", "runs", "all-levels-physics-and-screens-20260830-v2");
const generatedContent = path.join(projectRoot, "src", "content", "generated");
const originalAssets = path.join(projectRoot, "public", "assets", "original");
const generatedAssets = path.join(projectRoot, "public", "assets", "generated");

for (const required of [castRoot, matrixRoot]) {
  if (!fs.existsSync(required)) throw new Error(`Falta el material de referencia local: ${required}`);
}

fs.mkdirSync(generatedContent, { recursive: true });
fs.mkdirSync(originalAssets, { recursive: true });
fs.mkdirSync(path.join(generatedAssets, "screens"), { recursive: true });
fs.mkdirSync(path.join(generatedAssets, "sprites"), { recursive: true });

const swfPaths = fs.readdirSync(castRoot).filter((name) => name.endsWith(".swf")).map((name) => path.join(castRoot, name));
const conversion = spawnSync(process.execPath, [path.join(projectRoot, "tools", "web", "convert-swf-vectors.mjs"), ...swfPaths], {
  cwd: projectRoot,
  encoding: "utf8",
});
if (conversion.status !== 0) throw new Error(conversion.stderr || conversion.stdout || "Falló la conversión de SWF.");

const scorePaths = resolveScorePaths();
const score = parseScoreFiles(scorePaths);
if (score.summary.frameCount !== 64) throw new Error(`El inventario del Score solo contiene ${score.summary.frameCount} fotogramas.`);
const catalog = listAssets(projectRoot);
const matteBitmapIds = new Set(score.frames.flatMap((frame) => frame.sprites)
  .filter((sprite) => sprite.ink === 8 && sprite.memberType === "bitmap")
  .map((sprite) => `${sprite.cast}:${sprite.memberNum}`));
for (const member of catalog.assets) {
  // Director keeps the sprite's ink when Lingo swaps its member. Those
  // runtime-only frames never appear as ink-8 Score rows, so inherit the
  // matte from the authored ship/Kevin sprite explicitly.
  if (member.type === "bitmap" && (/^KevinSpin_/i.test(member.name) || member.name === "ship_open")) {
    matteBitmapIds.add(member.id);
  }
}

const webAssets = [];
const provenance = [];
for (const member of catalog.assets) {
  const candidates = [...member.files];
  if (member.type === "vectorShape") {
    const swf = candidates.find((candidate) => candidate.endsWith(".swf"));
    if (swf) candidates.push(swf.replace(/\.swf$/i, ".svg"));
  }
  const copied = [];
  for (const source of candidates.filter((candidate) => /\.(png|svg|wav|swf)$/i.test(candidate))) {
    if (!fs.existsSync(source)) continue;
    const fileName = path.basename(source);
    const destination = path.join(originalAssets, fileName);
    fs.copyFileSync(source, destination);
    copied.push(`/assets/original/${encodeURIComponent(fileName)}`);
    provenance.push(fileRecord(source, path.relative(projectRoot, destination)));
  }
  const text = readMemberText(member);
  let image = copied.find((value) => /\.(png|svg)$/i.test(decodeURIComponent(value))) ?? null;
  if (image && image.endsWith(".png") && matteBitmapIds.has(member.id)) {
    const source = candidates.find((candidate) => candidate.endsWith(".png"));
    if (source) {
      const destination = path.join(generatedAssets, "sprites", `${path.parse(source).name}-matte.png`);
      writeBackgroundTransparentPng(source, destination);
      const matteHash = crypto.createHash("sha256").update(fs.readFileSync(destination)).digest("hex").slice(0, 12);
      image = `/assets/generated/sprites/${encodeURIComponent(path.basename(destination))}?v=${matteHash}`;
      provenance.push(generatedFileRecord(source, destination, "Director ink 8 dominant-perimeter matte transparency"));
    }
  }
  webAssets.push({
    id: member.id,
    cast: member.cast,
    number: member.number,
    type: member.type,
    name: member.name,
    registrationPoint: parsePoint(member.registrationPoint),
    files: copied,
    image,
    audio: copied.find((value) => /\.wav$/i.test(decodeURIComponent(value))) ?? null,
    text,
  });
}

const screenDefinitions = {
  intro: { patches: [[350, 303, 36, 68]] },
  tips: { patches: [[350, 303, 36, 68]] },
  "end-stats": { patches: [[190, 318, 36, 82]] },
  "high-score-form": { patches: [[314, 299, 38, 101]] },
  "high-score-sending": { patches: [] },
};
const screens = {};
for (const [name, definition] of Object.entries(screenDefinitions)) {
  const source = path.join(matrixRoot, `stage-screen-${name}.png`);
  const entry = path.join(matrixRoot, `stage-entry-screen-${name}.png`);
  const destination = path.join(generatedAssets, "screens", `${name}.png`);
  if (definition.patches.length > 0) writePatchedScreen(source, entry, destination, definition.patches);
  else fs.copyFileSync(source, destination);
  screens[name] = `/assets/generated/screens/${name}.png`;
  provenance.push(definition.patches.length > 0
    ? generatedFileRecord(source, destination, `Removed Director orbiting sprites with patches from ${path.basename(entry)}`)
    : fileRecord(source, path.relative(projectRoot, destination)));
}

writeJson(path.join(generatedContent, "score.json"), score);
writeJson(path.join(generatedContent, "assets.json"), { schemaVersion: 1, count: webAssets.length, assets: webAssets });
writeJson(path.join(generatedContent, "screens.json"), { schemaVersion: 1, screens });
writeJson(path.join(projectRoot, "public", "assets", "manifest.json"), {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "Canonical Big Idea DCR exports and Director 8 Score oracle",
  canonicalDcrSha256: "22d7a9f9455467c277a0ea920cf1042073f7744446aaecb40476f586941df102",
  score: score.summary,
  files: provenance.sort((left, right) => left.output.localeCompare(right.output)),
});

process.stdout.write(`Generated ${webAssets.length} member records, ${swfPaths.length} SVG conversions and ${score.summary.frameCount} Score frames.\n`);

function resolveScorePaths() {
  const primary = Array.from({ length: 64 }, (_, index) => path.join(scorePrimary, `score-frame-${String(index + 1).padStart(2, "0")}.tsv`));
  if (primary.every(fs.existsSync)) return primary;
  const fallback = [
    ...Array.from({ length: 60 }, (_, index) => path.join(scoreFallbackA, `score-frame-${String(index + 1).padStart(2, "0")}.tsv`)),
    ...Array.from({ length: 4 }, (_, index) => path.join(scoreFallbackB, `score-frame-${String(index + 61).padStart(2, "0")}.tsv`)),
  ];
  if (fallback.every(fs.existsSync)) return fallback;
  throw new Error("No existe un inventario completo del Score. Ejecuta pnpm reference:score -- --run.");
}

function readMemberText(member) {
  const htmlPath = member.files.find((candidate) => candidate.endsWith(".htm"));
  const textPath = member.files.find((candidate) => candidate.endsWith(".txt") && !candidate.endsWith(".ls"));
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "latin1") : null;
  const plain = textPath && fs.existsSync(textPath) ? fs.readFileSync(textPath, "latin1").replace(/\r\n/g, "\n") : null;
  return html || plain ? { html, plain } : null;
}

function parsePoint(value) {
  const match = String(value).match(/\((-?[\d.]+),\s*(-?[\d.]+)\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

function fileRecord(source, output) {
  const bytes = fs.readFileSync(source);
  return {
    source: path.relative(projectRoot, source).replaceAll("\\", "/"),
    output: output.replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function generatedFileRecord(source, destination, transform) {
  const bytes = fs.readFileSync(destination);
  return {
    source: path.relative(projectRoot, source).replaceAll("\\", "/"),
    output: path.relative(projectRoot, destination).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    transform,
  };
}

function writeBackgroundTransparentPng(source, destination) {
  const png = PNG.sync.read(fs.readFileSync(source));
  const { width, height, data } = png;
  const perimeterColors = new Map();
  const countColor = (x, y) => {
    const offset = (y * width + x) * 4;
    const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    perimeterColors.set(key, (perimeterColors.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x += 1) { countColor(x, 0); countColor(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { countColor(0, y); countColor(width - 1, y); }
  const dominant = [...perimeterColors.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "0,0,0";
  const background = dominant.split(",").map(Number);
  const visited = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    const offset = pixel * 4;
    const delta = Math.abs(data[offset] - background[0]) + Math.abs(data[offset + 1] - background[1]) + Math.abs(data[offset + 2] - background[2]);
    if (delta > 72) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    data[pixel * 4 + 3] = 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  fs.writeFileSync(destination, PNG.sync.write(png));
}

function writePatchedScreen(source, patchSource, destination, patches) {
  const output = PNG.sync.read(fs.readFileSync(source));
  const clean = PNG.sync.read(fs.readFileSync(patchSource));
  if (output.width !== clean.width || output.height !== clean.height) throw new Error(`Capturas incompatibles: ${source}`);
  for (const [left, top, width, height] of patches) {
    for (let y = top; y < Math.min(output.height, top + height); y += 1) {
      for (let x = left; x < Math.min(output.width, left + width); x += 1) {
        const offset = (y * output.width + x) * 4;
        clean.data.copy(output.data, offset, offset, offset + 4);
      }
    }
  }
  fs.writeFileSync(destination, PNG.sync.write(output));
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
