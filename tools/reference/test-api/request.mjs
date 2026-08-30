import crypto from "node:crypto";

const GPS_STATES = new Set([
  "iddle",
  "pullback",
  "snapping",
  "soaring",
  "crashed",
  "hitTarget",
  "scoring",
  "next_level",
]);

export function createPhysicsRequest({
  id,
  level = 1,
  distance,
  angleDegrees,
  vector,
  frames = 120,
  screenshotFrames = [],
  initialState,
} = {}) {
  const launch = vector
    ? { vector: { x: Number(vector.x), y: Number(vector.y) } }
    : { distance: Number(distance), angleDegrees: Number(angleDegrees) };

  const request = {
    schemaVersion: 1,
    id: id || `physics-${crypto.randomUUID()}`,
    operation: "physics",
    target: { kind: "level", level: Number(level) },
    launch,
    capture: {
      frames: Number(frames),
      screenshotFrames: screenshotFrames.map(Number),
    },
  };
  if (initialState) request.initialState = initialState;
  return validateRequest(request);
}

export function createStateRequest({ id, target, frames = 1, screenshotFrames = [0], initialState } = {}) {
  const request = {
    schemaVersion: 1,
    id: id || `state-${crypto.randomUUID()}`,
    operation: "state",
    target,
    capture: { frames: Number(frames), screenshotFrames: screenshotFrames.map(Number) },
  };
  if (initialState) request.initialState = initialState;
  return validateRequest(request);
}

export function createVerificationRequest({ id, levels, screens } = {}) {
  const targets = [
    ...levels.map((level) => ({
      id: `level-${String(level.id).padStart(2, "0")}`,
      target: level.target,
      expected: { movieFrame: level.movieFrame, level: level.id, physics: true },
    })),
    ...screens.map((screen) => ({
      id: `screen-${screen.id}`,
      target: screen.target,
      expected: {
        entryFrameLabel: screen.label,
        frameLabel: screen.label === "Load" ? "Intro" : screen.label,
      },
    })),
  ];
  return validateRequest({
    schemaVersion: 1,
    id: id || `verify-all-${crypto.randomUUID()}`,
    operation: "verify-all",
    targets,
    capture: { frames: 0, screenshotFrames: [0] },
  });
}

export function createScoreInventoryRequest({ id, firstFrame = 1, lastFrame = 64 } = {}) {
  const targets = [];
  for (let frame = Number(firstFrame); frame <= Number(lastFrame); frame += 1) {
    targets.push({
      id: `frame-${String(frame).padStart(2, "0")}`,
      target: { kind: "frame", frame },
      // Some authored frames immediately navigate elsewhere when playback
      // begins (notably Load). The acknowledged pre-play frame is what the
      // Score export records, so no post-play frame assertion belongs here.
      expected: {},
    });
  }
  return validateRequest({
    schemaVersion: 1,
    id: id || `score-${crypto.randomUUID()}`,
    operation: "score",
    targets,
    capture: { frames: 0, screenshotFrames: [0] },
  });
}

export function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("La petición debe ser un objeto JSON.");
  if (value.schemaVersion !== 1) fail("schemaVersion debe ser 1.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value.id ?? "")) {
    fail("id debe contener solo letras, números, punto, guion o guion bajo (máximo 120)." );
  }
  if (!new Set(["physics", "state", "verify-all", "score"]).has(value.operation)) {
    fail("operation debe ser physics, state, verify-all o score.");
  }
  if (value.operation === "verify-all" || value.operation === "score") validateVerificationTargets(value.targets);
  else validateTarget(value.target);

  const frames = value.capture?.frames;
  if (!Number.isInteger(frames) || frames < 0 || frames > 10000) {
    fail("capture.frames debe ser un entero entre 0 y 10000.");
  }
  const screenshotFrames = value.capture?.screenshotFrames ?? [];
  if (!Array.isArray(screenshotFrames) || screenshotFrames.some((frame) => !Number.isInteger(frame) || frame < 0 || frame > frames)) {
    fail("capture.screenshotFrames debe contener enteros entre 0 y capture.frames.");
  }

  if (value.operation === "physics") validateLaunch(value.launch);
  if (value.initialState) validateSnapshot(value.initialState);
  return value;
}

function validateVerificationTargets(targets) {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 100) {
    fail("targets debe contener entre 1 y 100 verificaciones.");
  }
  const ids = new Set();
  for (const entry of targets) {
    if (!entry || typeof entry !== "object" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(entry.id ?? "")) {
      fail("Cada verificación necesita un id seguro.");
    }
    if (ids.has(entry.id)) fail(`Id de verificación duplicado: ${entry.id}.`);
    ids.add(entry.id);
    validateTarget(entry.target);
    if (!entry.expected || typeof entry.expected !== "object") fail(`Falta expected para ${entry.id}.`);
    if (entry.expected.movieFrame !== undefined && (!Number.isInteger(entry.expected.movieFrame) || entry.expected.movieFrame < 1)) {
      fail(`expected.movieFrame no es válido para ${entry.id}.`);
    }
    if (entry.expected.level !== undefined && (!Number.isInteger(entry.expected.level) || entry.expected.level < 1 || entry.expected.level > 25)) {
      fail(`expected.level no es válido para ${entry.id}.`);
    }
    for (const field of ["entryFrameLabel", "frameLabel"]) {
      if (entry.expected[field] !== undefined && typeof entry.expected[field] !== "string") {
        fail(`expected.${field} no es válido para ${entry.id}.`);
      }
    }
    if (entry.expected.physics !== undefined && typeof entry.expected.physics !== "boolean") {
      fail(`expected.physics no es válido para ${entry.id}.`);
    }
  }
}

function validateTarget(target) {
  if (!target || typeof target !== "object") fail("target es obligatorio.");
  if (target.kind === "level") {
    if (!Number.isInteger(target.level) || target.level < 1 || target.level > 25) {
      fail("target.level debe estar entre 1 y 25.");
    }
    return;
  }
  if (target.kind === "screen") {
    if (typeof target.label !== "string" || target.label.length < 1 || target.label.length > 100) {
      fail("target.label debe ser una etiqueta no vacía.");
    }
    return;
  }
  if (target.kind === "frame") {
    if (!Number.isInteger(target.frame) || target.frame < 1) fail("target.frame debe ser positivo.");
    return;
  }
  fail("target.kind debe ser level, screen o frame.");
}

function validateLaunch(launch) {
  if (!launch || typeof launch !== "object") fail("launch es obligatorio para physics.");
  const hasPolar = Number.isFinite(launch.distance) && Number.isFinite(launch.angleDegrees);
  const hasVector = Number.isFinite(launch.vector?.x) && Number.isFinite(launch.vector?.y);
  if (hasPolar === hasVector) fail("launch debe usar distance+angleDegrees o vector, pero no ambos.");
  if (hasPolar && (launch.distance < 10 || launch.distance > 120)) {
    fail("launch.distance debe estar entre 10 y 120; Director aplicará además el límite propio del nivel.");
  }
  if (hasVector && Math.hypot(launch.vector.x, launch.vector.y) === 0) fail("launch.vector no puede ser cero.");
  if (hasVector && Math.hypot(launch.vector.x, launch.vector.y) > 40) {
    fail("La velocidad de launch.vector no puede superar 40, el máximo físico del tirachinas original.");
  }
}

function validateSnapshot(snapshot) {
  if (!Number.isInteger(snapshot.movieFrame) || snapshot.movieFrame < 1) fail("initialState.movieFrame no es válido.");
  if (!snapshot.game || typeof snapshot.game !== "object" || Array.isArray(snapshot.game)) {
    fail("initialState.game es obligatorio.");
  }
  if (snapshot.gps?.state && !GPS_STATES.has(snapshot.gps.state)) fail("initialState.gps.state no es válido.");
  for (const field of ["point", "velocity"]) {
    const value = snapshot.gps?.[field];
    if (!value) continue;
    const isUnobserved = value.x == null && value.y == null;
    if (!isUnobserved && (!Number.isFinite(value.x) || !Number.isFinite(value.y))) {
      fail(`initialState.gps.${field} debe contener x e y numéricos.`);
    }
  }
  if (snapshot.planets !== undefined && !Array.isArray(snapshot.planets)) fail("initialState.planets debe ser una lista.");
  if (snapshot.bonuses !== undefined && !Array.isArray(snapshot.bonuses)) fail("initialState.bonuses debe ser una lista.");
}

function fail(message) {
  throw new Error(message);
}
