import fs from "node:fs";
import path from "node:path";

const CAST_RIPPER_RELATIVE = path.join(
  "reference",
  "derived",
  "cast-ripper",
  "bigidea-20020806",
  "spacedpenguin_bigidea_20020806",
);

const KNOWN_SCREENS = Object.freeze([
  {
    id: "load",
    label: "Load",
    kind: "loading",
    evidence: "Director 8 labelList captured inside Windows Sandbox.",
  },
  {
    id: "intro",
    label: "Intro",
    kind: "menu",
    evidence: "Game_Looping.keyUp compares the current frame with Intro.",
  },
  {
    id: "tips",
    label: "Tips",
    kind: "instructions",
    evidence: "Director 8 labelList captured inside Windows Sandbox.",
  },
  {
    id: "levels",
    label: "Levels",
    kind: "gameplay-entry",
    evidence: "Director 8 labelList captured inside Windows Sandbox.",
  },
  {
    id: "high-score-form",
    label: "HS FM",
    kind: "form",
    evidence: "Main.endGame navigates to HS FM.",
  },
  {
    id: "end-stats",
    label: "End_Stats",
    kind: "end",
    evidence: "Main.endGame and post_HS navigate to End_Stats.",
  },
  {
    id: "high-score-sending",
    label: "HS_Sending",
    kind: "network-status",
    evidence: "Director 8 labelList captured inside Windows Sandbox.",
  },
]);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const [headers = [], ...values] = rows;
  return values.map((fields) =>
    Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""])),
  );
}

function requireDerivedCatalog(projectRoot) {
  const catalogRoot = path.join(projectRoot, CAST_RIPPER_RELATIVE);
  if (!fs.existsSync(catalogRoot)) {
    throw new Error(
      `No se encuentra el inventario extraido en ${catalogRoot}. Ejecuta pnpm reference:prepare.`,
    );
  }
  return catalogRoot;
}

export function listAssets(projectRoot, filters = {}) {
  const catalogRoot = requireDerivedCatalog(projectRoot);
  const casts = parseCsv(fs.readFileSync(path.join(catalogRoot, "Casts.csv"), "utf8"));
  const files = fs.readdirSync(catalogRoot);
  const assets = [];

  for (const cast of casts) {
    const csvPath = path.join(catalogRoot, `${cast.Name}_Members.csv`);
    if (!fs.existsSync(csvPath)) continue;

    for (const member of parseCsv(fs.readFileSync(csvPath, "utf8"))) {
      const number = Number(member.Number);
      const prefix = `${cast.Name}_${number}_`;
      const memberFiles = files
        .filter((file) => file.startsWith(prefix) && !file.endsWith("_Members.csv"))
        .sort()
        .map((file) => path.join(catalogRoot, file));
      const asset = {
        id: `${cast.Name}:${number}`,
        cast: cast.Name,
        number,
        type: member.Type,
        name: member.Name,
        registrationPoint: member["Registration Point"],
        files: memberFiles,
      };
      if (filters.cast && asset.cast.toLowerCase() !== filters.cast.toLowerCase()) continue;
      if (filters.type && asset.type.toLowerCase() !== filters.type.toLowerCase()) continue;
      if (filters.name && !asset.name.toLowerCase().includes(filters.name.toLowerCase())) continue;
      assets.push(asset);
    }
  }

  return {
    schemaVersion: 1,
    source: "canonical Big Idea DCR extracted by the preservation pipeline",
    count: assets.length,
    assets,
  };
}

export function listLevels() {
  const levels = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    movieFrame: index + 11,
    target: { kind: "level", level: index + 1 },
  }));
  return {
    schemaVersion: 1,
    source: "Director 8 verification found the GPS gameplay behavior on frames 11 through 35; frame 35 is the last level.",
    count: levels.length,
    levels,
  };
}

export function listScreens(projectRoot) {
  const discovered = discoverRuntimeLabels(projectRoot);
  const byLabel = new Map(KNOWN_SCREENS.map((screen) => [screen.label, { ...screen }]));
  for (const label of discovered) {
    if (!byLabel.has(label)) {
      byLabel.set(label, {
        id: slugify(label),
        label,
        kind: "runtime-label",
        evidence: "Director 8 labelList captured inside Windows Sandbox.",
      });
    }
  }

  return {
    schemaVersion: 1,
    source:
      discovered.length > 0
        ? "decompiled navigation plus the newest Director 8 runtime labelList"
        : "decompiled navigation; run any sandbox API job to attach Director's full labelList",
    count: byLabel.size,
    screens: [...byLabel.values()].map((screen) => ({
      ...screen,
      target: { kind: "screen", label: screen.label },
    })),
  };
}

function discoverRuntimeLabels(projectRoot) {
  const runsRoot = path.join(projectRoot, "reference", "test-api", "runs");
  if (!fs.existsSync(runsRoot)) return [];
  const catalogs = [];
  for (const run of fs.readdirSync(runsRoot)) {
    const catalogPath = path.join(runsRoot, run, "movie-labels.txt");
    if (fs.existsSync(catalogPath)) catalogs.push(catalogPath);
  }
  catalogs.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (catalogs.length === 0) return [];
  const runtimeOutput = fs
    .readFileSync(catalogs[0], "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^--\s*"/, "")
    .replace(/"$/, "");
  return runtimeOutput
    .split(/\r?\n|,/)
    .map((label) => label.trim())
    .filter((label) => label && !label.startsWith("--"));
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
