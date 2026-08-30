import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { DirectorFile } from "projectorrays/node";

const projectRoot = resolve(import.meta.dirname, "../..");
const originalsDir = join(projectRoot, "reference", "originals", "files");
const outputDir = join(projectRoot, "reference", "derived", "projectorrays");

const defaultInputs = [
  join(originalsDir, "spacedpenguin_bigidea_20020806.dcr"),
  join(originalsDir, "spacedpenguin_albinoblacksheep.dcr"),
];

const inputs = process.argv.slice(2).map((path) => resolve(path));

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return {
      byteLength: value.byteLength,
      base64: Buffer.from(value).toString("base64"),
    };
  }

  return value;
}

function safeFilename(value) {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").replaceAll(/^_+|_+$/g, "");
}

async function inspect(inputPath) {
  const directorFile = await DirectorFile.readFromPath(inputPath);

  try {
    const fileStats = await stat(inputPath);
    const rawChunks = directorFile.dumpChunks();
    const scriptDump = directorFile.dumpScripts();
    const report = {
      input: basename(inputPath),
      fileSize: fileStats.size,
      isCast: directorFile.isCast(),
      chunkInventory: rawChunks.map(({ fourCC, id, data }) => ({
        fourCC,
        id,
        byteLength: data.byteLength,
      })),
      scripts: scriptDump,
      chunks: directorFile.dumpJSON(),
    };

    const inputOutputDir = join(outputDir, basename(inputPath));
    const scriptsOutputDir = join(inputOutputDir, "lingo");
    await mkdir(scriptsOutputDir, { recursive: true });

    const scriptSummary = [];
    for (const cast of scriptDump.casts) {
      for (const script of cast.scripts) {
        const stem = [
          safeFilename(cast.name),
          String(script.scriptId).padStart(3, "0"),
          safeFilename(script.memberName),
        ].join("_");

        await writeFile(join(scriptsOutputDir, `${stem}.ls`), script.lingo, "utf8");
        await writeFile(
          join(scriptsOutputDir, `${stem}.lasm`),
          script.bytecode,
          "utf8",
        );
        scriptSummary.push({
          cast: cast.name,
          scriptId: script.scriptId,
          memberId: script.memberId,
          memberName: script.memberName,
          scriptType: script.scriptType,
          lingoFile: `lingo/${stem}.ls`,
          bytecodeFile: `lingo/${stem}.lasm`,
        });
      }
    }

    const outputPath = join(inputOutputDir, "report.json");
    await writeFile(
      outputPath,
      `${JSON.stringify(report, jsonReplacer, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(inputOutputDir, "scripts.json"),
      `${JSON.stringify(scriptSummary, null, 2)}\n`,
      "utf8",
    );
    console.log(`${basename(inputPath)} -> ${outputPath}`);
  } finally {
    directorFile.destroy();
  }
}

await mkdir(outputDir, { recursive: true });

for (const inputPath of inputs.length > 0 ? inputs : defaultInputs) {
  await inspect(inputPath);
}
