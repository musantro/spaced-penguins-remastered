import assert from "node:assert/strict";
import test from "node:test";
import { createPhysicsRequest, createStateRequest, createVerificationRequest, validateRequest } from "../request.mjs";

test("physics request accepts polar launch", () => {
  const request = createPhysicsRequest({ id: "test", level: 1, distance: 100, angleDegrees: -137, frames: 120 });
  assert.equal(request.launch.distance, 100);
  assert.equal(request.capture.frames, 120);
});

test("physics request accepts a launch vector", () => {
  const request = createPhysicsRequest({ id: "vector", vector: { x: -12, y: 4 }, frames: 2 });
  assert.deepEqual(request.launch.vector, { x: -12, y: 4 });
});

test("request rejects an invalid level", () => {
  assert.throws(
    () => validateRequest({ schemaVersion: 1, id: "bad", operation: "state", target: { kind: "level", level: 26 }, capture: { frames: 1 } }),
    /entre 1 y 25/,
  );
});

test("request rejects a launch vector above Director's supported speed", () => {
  assert.throws(
    () => createPhysicsRequest({ id: "fast", vector: { x: 41, y: 0 }, frames: 2 }),
    /40/,
  );
});

test("screen snapshots may contain an unobserved velocity", () => {
  const request = createStateRequest({
    id: "intro-replay",
    target: { kind: "screen", label: "Intro" },
    initialState: {
      movieFrame: 3,
      game: { score: 0, highScore: 0, level: 1, alert: null },
      gps: { state: "iddle", point: { x: 74, y: 293 }, velocity: { x: null, y: null } },
      planets: [],
      bonuses: [],
    },
  });
  assert.equal(request.initialState.gps.velocity.x, null);
});

test("verification request combines levels and screens without duplicate ids", () => {
  const request = createVerificationRequest({
    id: "matrix",
    levels: [{ id: 1, movieFrame: 11, target: { kind: "level", level: 1 } }],
    screens: [{ id: "intro", label: "Intro", target: { kind: "screen", label: "Intro" } }],
  });
  assert.equal(request.operation, "verify-all");
  assert.deepEqual(request.targets.map((entry) => entry.id), ["level-01", "screen-intro"]);
  assert.equal(request.targets[0].expected.physics, true);
});
