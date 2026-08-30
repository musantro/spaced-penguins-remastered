import fs from "node:fs";

const NUMERIC_FIELDS = new Set([
  "movieFrame", "channel", "castLibNum", "memberNum", "locH", "locV", "width", "height",
  "rotation", "skew", "blend", "visible", "ink", "rectLeft", "rectTop", "rectRight", "rectBottom",
]);

export function parseScoreFiles(paths) {
  const sprites = paths.flatMap(parseScoreFile);
  const frames = [...Map.groupBy(sprites, (sprite) => sprite.movieFrame)].map(([movieFrame, frameSprites]) => ({
    movieFrame,
    frameLabel: frameSprites[0]?.frameLabel || null,
    sprites: frameSprites,
  })).sort((left, right) => left.movieFrame - right.movieFrame);
  return {
    schemaVersion: 1,
    source: "Macromedia Director 8 Score exported inside Windows Sandbox",
    summary: {
      frameCount: frames.length,
      spriteCount: sprites.length,
      occupiedChannels: new Set(sprites.map((sprite) => sprite.channel)).size,
      memberCount: new Set(sprites.map((sprite) => `${sprite.castLibNum}:${sprite.memberNum}`)).size,
    },
    frames,
  };
}

function parseScoreFile(scorePath) {
  const lines = fs.readFileSync(scorePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(unwrapDirectorPut);
  if (lines.length < 2) throw new Error(`El Score ${scorePath} no contiene sprites.`);
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    for (const field of NUMERIC_FIELDS) row[field] = parseDirectorNumber(row[field]);
    row.frameLabel = row.frameLabel || null;
    row.memberType = row.memberType.replace(/^#/, "");
    row.visible = row.visible !== 0;
    row.cast = ({ 1: "Internal", 2: "scripts", 3: "Text" })[row.castLibNum] ?? String(row.castLibNum);
    return row;
  });
}

function unwrapDirectorPut(line) {
  const match = line.match(/^--\s*"([\s\S]*)"$/);
  return match ? match[1] : line;
}

function parseDirectorNumber(value) {
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}
