import fs from "node:fs";

export function parseDirectorNumber(value) {
  if (value === undefined || value === "" || value === "<Void>" || value === "VOID") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function parseTraceFile(tracePath) {
  const text = fs.readFileSync(tracePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean).map(unwrapDirectorPut);
  if (lines.length < 2) throw new Error(`La traza ${tracePath} no contiene muestras.`);
  const headers = lines[0].split("\t");
  const samples = lines.slice(1).map((line) => {
    const values = line.split("\t");
    return normalizeSample(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  });
  return {
    schemaVersion: 1,
    source: "Macromedia Director 8 instrumented inside Windows Sandbox",
    sampleCount: samples.length,
    samples,
    events: deriveEvents(samples),
    snapshot: snapshotFromSample(samples.at(-1)),
  };
}

function unwrapDirectorPut(line) {
  const match = line.match(/^--\s*"([\s\S]*)"$/);
  return match ? match[1] : line;
}

function normalizeSample(row) {
  const numeric = [
    "sample", "ticks", "movieFrame", "gpsChannel", "pointX", "pointY", "velocityX", "velocityY",
    "spriteX", "spriteY", "stateFrameCount", "tries", "distance", "score", "highScore", "level", "stageInside", "flightInside",
    "targetContact",
  ];
  const result = { ...row };
  for (const key of numeric) result[key] = parseDirectorNumber(row[key]);
  result.frameLabel = ["", "0", "<Void>", "VOID"].includes(String(row.frameLabel ?? "")) ? null : String(row.frameLabel);
  result.state = String(row.state ?? "").replace(/^#/, "") || null;
  result.alert = ["", "<Void>", "VOID", "0"].includes(String(row.alert ?? ""))
    ? null
    : String(row.alert).replace(/^#/, "");
  result.planetInfluences = parseChannels(row.planetInfluences);
  result.planetContacts = parseChannels(row.planetContacts);
  result.planets = parsePlanets(row.planets);
  result.bonuses = parseBonuses(row.bonuses);
  return result;
}

function parseChannels(value = "") {
  if (!value) return [];
  return value.split("|").filter(Boolean).map((token) => {
    const [channel, distance, radius] = token.split(":");
    return { channel: Number(channel), distance: parseDirectorNumber(distance), radius: parseDirectorNumber(radius) };
  });
}

function parsePlanets(value = "") {
  if (!value) return [];
  return value.split("|").filter(Boolean).map((token) => {
    const [channel, x, y, mass, collisionRadius, gravityReach, orbitVX, orbitVY, floatX, floatY] = token.split(":");
    return {
      channel: Number(channel),
      point: { x: parseDirectorNumber(x), y: parseDirectorNumber(y) },
      mass: parseDirectorNumber(mass),
      collisionRadius: parseDirectorNumber(collisionRadius),
      gravityReach: parseDirectorNumber(gravityReach),
      orbit: orbitVX === "" || orbitVX === undefined ? null : {
        velocity: { x: parseDirectorNumber(orbitVX), y: parseDirectorNumber(orbitVY) },
        floatPoint: { x: parseDirectorNumber(floatX), y: parseDirectorNumber(floatY) },
      },
    };
  });
}

function parseBonuses(value = "") {
  if (!value) return [];
  return value.split("|").filter(Boolean).map((token) => {
    const [channel, state, valueText, memberNum, rotation, rotationVelocity] = token.split(":");
    return {
      channel: Number(channel), state: state.replace(/^#/, ""), value: parseDirectorNumber(valueText),
      memberNum: parseDirectorNumber(memberNum), rotation: parseDirectorNumber(rotation),
      rotationVelocity: parseDirectorNumber(rotationVelocity),
    };
  });
}

function deriveEvents(samples) {
  const events = [];
  let previous;
  let collected = new Set();
  for (const sample of samples) {
    if (previous && sample.state !== previous.state) {
      events.push({ sample: sample.sample, type: "state", from: previous.state, to: sample.state });
    }
    for (const contact of sample.planetContacts) {
      if (!previous?.planetContacts.some((old) => old.channel === contact.channel)) {
        events.push({ sample: sample.sample, type: "planet-collision", ...contact });
      }
    }
    if (sample.targetContact && !previous?.targetContact) events.push({ sample: sample.sample, type: "target-collision" });
    const nowCollected = new Set(sample.bonuses.filter((bonus) => bonus.state.toLowerCase() === "hit").map((bonus) => bonus.channel));
    for (const channel of nowCollected) {
      if (!collected.has(channel)) events.push({ sample: sample.sample, type: "bonus-collected", channel });
    }
    collected = nowCollected;
    previous = sample;
  }
  return events;
}

function snapshotFromSample(sample) {
  return {
    schemaVersion: 1,
    movieFrame: sample.movieFrame,
    frameLabel: sample.frameLabel || null,
    game: { score: sample.score, highScore: sample.highScore, level: sample.level, alert: sample.alert },
    gps: sample.gpsChannel
      ? {
          channel: sample.gpsChannel,
          state: sample.state,
          point: { x: sample.pointX, y: sample.pointY },
          velocity: { x: sample.velocityX, y: sample.velocityY },
          frameCount: sample.stateFrameCount,
          tries: sample.tries,
          distance: sample.distance,
        }
      : null,
    planets: sample.planets,
    bonuses: sample.bonuses,
  };
}
