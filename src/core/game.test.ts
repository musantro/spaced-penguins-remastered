import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadContent } from "../content/load";
import { createInitialState, launchFromPolar, showScreen, startLevel, tick } from "./game";

const content = loadContent();

describe("canonical level-one Director trace", () => {
  it("matches every one of the 121 independently recorded state boundaries", () => {
    const trace = JSON.parse(fs.readFileSync(path.resolve("reference/test-api/runs/canonical-api-120/trace.json"), "utf8"));
    let state = launchFromPolar(startLevel(createInitialState(), content, 1), 100, -148.36);
    for (let sample = 0; sample < trace.samples.length; sample += 1) {
      const expected = trace.samples[sample];
      compareGps(state, expected, 1, sample);
      expect(state.score, `sample ${sample} score`).toBeCloseTo(expected.score, 3);
      expect(state.highScore, `sample ${sample} high score`).toBeCloseTo(expected.highScore, 3);
      expect(state.alert, `sample ${sample} alert`).toBe(expected.alert);
      if (sample + 1 < trace.samples.length) state = tick(state, { kind: "none" }, content);
    }
  });

  it("reproduces launch, snapping and target entry", () => {
    let state = startLevel(createInitialState(), content, 1);
    state = launchFromPolar(state, 100, -148.36);
    expect(state.gps?.point.x).toBeCloseTo(468.1361, 3);
    expect(state.gps?.point.y).toBeCloseTo(354.458, 3);
    expect(state.gps?.velocity.x).toBeCloseTo(-33.8791, 3);
    expect(state.gps?.velocity.y).toBeCloseTo(-20.726, 3);
    expect(state.gps?.frameCount).toBe(4);

    state = tick(state, { kind: "none" }, content);
    expect(state.gps?.point.x).toBeCloseTo(434.257, 3);
    expect(state.gps?.point.y).toBeCloseTo(333.732, 3);
    expect(state.gps?.frameCount).toBe(3);

    for (let sample = 2; sample <= 12; sample += 1) state = tick(state, { kind: "none" }, content);
    expect(state.gps?.state).toBe("hitTarget");
    expect(state.gps?.point.x).toBeCloseTo(61.5869, 3);
    expect(state.gps?.point.y).toBeCloseTo(105.746, 3);
    expect(state.gps?.distance).toBeCloseTo(317.728, 2);
  });

  it("settles the canonical score at 318 and advances to level two", () => {
    let state = launchFromPolar(startLevel(createInitialState(), content, 1), 100, -148.36);
    for (let frame = 0; frame < 260 && state.level === 1; frame += 1) state = tick(state, { kind: "none" }, content);
    expect(state.level).toBe(2);
    expect(state.score).toBe(318);
    expect(state.highScore).toBe(318);
  });

  it("uses one-shot target audio and stops every scoring loop at its target", () => {
    let state = launchFromPolar(startLevel(createInitialState(), content, 1), 100, -148.36);
    expect(state.audioEvents).toEqual([{ name: "snd_launch" }]);
    const events: Array<{ name: string; loop?: boolean; stop?: boolean }> = [];
    for (let frame = 0; frame < 260 && events.filter((event) => event.stop).length < 4; frame += 1) {
      state = tick(state, { kind: "none" }, content);
      events.push(...state.audioEvents);
    }

    expect(events.find((event) => event.name === "snd_enterShip")).toEqual({ name: "snd_enterShip" });
    expect(events.filter((event) => event.loop).map((event) => event.name)).toEqual(["Arp", "snd_enterShip", "snd_enterShip", "Arp"]);
    expect(events.filter((event) => event.stop)).toHaveLength(4);
  });

  it("preserves the audio stop when a click skips the total-score animation", () => {
    let state = launchFromPolar(startLevel(createInitialState(), content, 1), 100, -148.36);
    for (let frame = 0; frame < 260; frame += 1) {
      state = tick(state, { kind: "none" }, content);
      if (state.alert === "scoring" && state.gps!.scorePhase === 4 && state.gps!.scoreCurrent > 0 && state.gps!.scoreCurrent < state.gps!.scoreTarget) break;
    }
    expect(state.gps!.scorePhase).toBe(4);
    expect(state.gps!.scoreCurrent).toBeLessThan(state.gps!.scoreTarget);

    state = tick(state, { kind: "pointerUp", point: { x: 250, y: 200 } }, content);
    expect(state.level).toBe(2);
    expect(state.score).toBe(318);
    expect(state.audioEvents).toEqual([{ name: "all", stop: true }]);
  });
});

describe("moving Director sprites", () => {
  it("matches bonus collection, spin-down and reset for 31 boundaries", () => {
    const trace = JSON.parse(fs.readFileSync(path.resolve("reference/test-api/runs/conformance-level02-bonus-20260830/trace.json"), "utf8"));
    let state = startLevel(createInitialState(), content, 2);
    state = tick(state, { kind: "none" }, content);
    for (const bonus of state.bonuses) bonus.rotation += 3;
    state = launchFromPolar(state, 100, -158);
    for (let sample = 0; sample < trace.samples.length; sample += 1) {
      const expected = trace.samples[sample];
      compareGps(state, expected, 2, sample);
      const actualBonus = state.bonuses[0];
      const expectedBonus = expected.bonuses[0];
      expect(actualBonus.collected ? "Hit" : "notHit", `sample ${sample} bonus state`).toBe(expectedBonus.state);
      expect(actualBonus.memberNum, `sample ${sample} bonus member`).toBe(expectedBonus.memberNum);
      expect(actualBonus.rotation, `sample ${sample} bonus rotation`).toBeCloseTo(expectedBonus.rotation, 1);
      expect(actualBonus.rotationVelocity, `sample ${sample} bonus velocity`).toBeCloseTo(expectedBonus.rotationVelocity, 2);
      if (sample + 1 < trace.samples.length) state = tick(state, { kind: "none" }, content);
    }
  });

  it("matches the level-17 target, planets and bonus orbit for 61 boundaries", () => {
    const trace = JSON.parse(fs.readFileSync(path.resolve("reference/test-api/runs/conformance-level17-target-orbit-20260830/trace.json"), "utf8"));
    let state = startLevel(createInitialState(), content, 17);
    state = tick(state, { kind: "none" }, content);
    for (const bonus of state.bonuses) bonus.rotation += 3;
    state = launchFromPolar(state, 100, -137);
    for (let sample = 0; sample < trace.samples.length; sample += 1) {
      const expected = trace.samples[sample];
      compareGps(state, expected, 17, sample);
      expect(state.gps!.targetPoint.x, `sample ${sample} target.x`).toBeCloseTo(expected.targetX, 3);
      expect(state.gps!.targetPoint.y, `sample ${sample} target.y`).toBeCloseTo(expected.targetY, 3);
      for (const expectedPlanet of expected.planets) {
        const actual = state.planets.find((planet) => planet.channel === expectedPlanet.channel)!;
        expect(actual.point.x, `sample ${sample} planet ${actual.channel} x`).toBeCloseTo(expectedPlanet.point.x, 3);
        expect(actual.point.y, `sample ${sample} planet ${actual.channel} y`).toBeCloseTo(expectedPlanet.point.y, 3);
        expect(actual.orbit!.velocity.x).toBeCloseTo(expectedPlanet.orbit.velocity.x, 3);
        expect(actual.orbit!.velocity.y).toBeCloseTo(expectedPlanet.orbit.velocity.y, 3);
        expect(actual.floatPoint.x).toBeCloseTo(expectedPlanet.orbit.floatPoint.x, 3);
        expect(actual.floatPoint.y).toBeCloseTo(expectedPlanet.orbit.floatPoint.y, 3);
      }
      for (const expectedBonus of expected.bonuses) {
        const actual = state.bonuses.find((bonus) => bonus.channel === expectedBonus.channel)!;
        expect(actual.point.x, `sample ${sample} bonus ${actual.channel} x`).toBeCloseTo(expectedBonus.point.x, 3);
        expect(actual.point.y, `sample ${sample} bonus ${actual.channel} y`).toBeCloseTo(expectedBonus.point.y, 3);
        expect(actual.orbit!.velocity.x).toBeCloseTo(expectedBonus.orbit.velocity.x, 3);
        expect(actual.orbit!.velocity.y).toBeCloseTo(expectedBonus.orbit.velocity.y, 3);
        expect(actual.floatPoint.x).toBeCloseTo(expectedBonus.orbit.floatPoint.x, 3);
        expect(actual.floatPoint.y).toBeCloseTo(expectedBonus.orbit.floatPoint.y, 3);
      }
      if (sample + 1 < trace.samples.length) state = tick(state, { kind: "none" }, content);
    }
  });

  it("matches the level-22 four-body orbit and hoop-orbiting target for 31 boundaries", () => {
    const trace = JSON.parse(fs.readFileSync(path.resolve("reference/test-api/runs/conformance-level22-multi-orbit-20260830/trace.json"), "utf8"));
    let state = startLevel(createInitialState(), content, 22);
    state = tick(state, { kind: "none" }, content);
    state = launchFromPolar(state, 100, -137);
    for (let sample = 0; sample < trace.samples.length; sample += 1) {
      const expected = trace.samples[sample];
      compareGps(state, expected, 22, sample);
      expect(state.gps!.targetPoint.x, `sample ${sample} target.x`).toBeCloseTo(expected.targetX, 3);
      expect(state.gps!.targetPoint.y, `sample ${sample} target.y`).toBeCloseTo(expected.targetY, 3);
      for (const expectedPlanet of expected.planets) {
        const actual = state.planets.find((planet) => planet.channel === expectedPlanet.channel)!;
        expect(actual.point.x, `sample ${sample} planet ${actual.channel} x`).toBeCloseTo(expectedPlanet.point.x, 3);
        expect(actual.point.y, `sample ${sample} planet ${actual.channel} y`).toBeCloseTo(expectedPlanet.point.y, 3);
        expect(actual.orbit!.velocity.x).toBeCloseTo(expectedPlanet.orbit.velocity.x, 3);
        expect(actual.orbit!.velocity.y).toBeCloseTo(expectedPlanet.orbit.velocity.y, 3);
      }
      if (sample + 1 < trace.samples.length) state = tick(state, { kind: "none" }, content);
    }
  });
});

describe("complete extracted game content", () => {
  it("matches the independent Director launch boundary for all 25 levels", () => {
    for (let level = 1; level <= 25; level += 1) {
      const tracePath = path.resolve(`reference/test-api/runs/all-levels-physics-and-screens-20260830-v2/trace-level-${String(level).padStart(2, "0")}.json`);
      const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
      let state = launchFromPolar(startLevel(createInitialState(), content, level), 100, -137);
      compareGps(state, trace.samples[0], level, 0);
      state = tick(state, { kind: "none" }, content);
      compareGps(state, trace.samples[1], level, 1);
      for (const expected of trace.samples[1].planets) {
        const actual = state.planets.find((planet) => planet.channel === expected.channel);
        expect(actual, `level ${level} planet ${expected.channel}`).toBeDefined();
        expect(actual!.mass).toBeCloseTo(expected.mass, 5);
        expect(actual!.collisionRadius).toBeCloseTo(expected.collisionRadius, 5);
        expect(actual!.gravityReach).toBeCloseTo(expected.gravityReach, 5);
        expect(actual!.point.x, `level ${level} planet ${expected.channel} x`).toBeCloseTo(expected.point.x, 3);
        expect(actual!.point.y, `level ${level} planet ${expected.channel} y`).toBeCloseTo(expected.point.y, 3);
        if (expected.orbit) {
          expect(actual!.orbit, `level ${level} planet ${expected.channel} orbit`).not.toBeNull();
          expect(actual!.orbit!.velocity.x).toBeCloseTo(expected.orbit.velocity.x, 3);
          expect(actual!.orbit!.velocity.y).toBeCloseTo(expected.orbit.velocity.y, 3);
          expect(actual!.floatPoint.x).toBeCloseTo(expected.orbit.floatPoint.x, 3);
          expect(actual!.floatPoint.y).toBeCloseTo(expected.orbit.floatPoint.y, 3);
        }
      }
      for (const expected of trace.samples[1].bonuses) {
        const actual = state.bonuses.find((bonus) => bonus.channel === expected.channel);
        expect(actual, `level ${level} bonus ${expected.channel}`).toBeDefined();
        expect(actual!.value).toBe(expected.value);
      }
    }
  });

  it("constructs and advances every one of the 25 authored levels without non-finite state", () => {
    for (let level = 1; level <= 25; level += 1) {
      let state = launchFromPolar(startLevel(createInitialState(), content, level), 70, -135);
      for (let frame = 0; frame < 180 && state.screen === "level"; frame += 1) {
        state = tick(state, { kind: "none" }, content);
        if (state.gps) {
          expect(Number.isFinite(state.gps.point.x), `level ${level} point.x`).toBe(true);
          expect(Number.isFinite(state.gps.point.y), `level ${level} point.y`).toBe(true);
          expect(Number.isFinite(state.gps.velocity.x), `level ${level} velocity.x`).toBe(true);
          expect(Number.isFinite(state.gps.velocity.y), `level ${level} velocity.y`).toBe(true);
        }
        for (const planet of state.planets) {
          expect(Number.isFinite(planet.point.x), `level ${level} planet ${planet.channel} x`).toBe(true);
          expect(Number.isFinite(planet.point.y), `level ${level} planet ${planet.channel} y`).toBe(true);
        }
      }
    }
  });

  it("reproduces the authored menu orbit and Tips high-score navigation", () => {
    let state = createInitialState(content);
    expect(state.menuOrbiters.map((orbiter) => orbiter.point)).toEqual([{ x: 408, y: 288 }, { x: 408, y: 388 }]);
    state = tick(state, { kind: "none" }, content);
    expect(state.menuOrbiters.map((orbiter) => orbiter.point)).toEqual([{ x: 404, y: 288 }, { x: 404, y: 388 }]);
    state = tick(state, { kind: "pointerUp", point: { x: 450, y: 250 } }, content);
    expect(state.screen).toBe("tips");
    state = tick(state, { kind: "pointerUp", point: { x: 75, y: 360 } }, content);
    expect(state.screen).toBe("end-stats");
  });

  it("accepts one nickname and keeps the local sending transition", () => {
    let state = showScreen({ ...createInitialState(content), score: 1562, highScore: 1562 }, "high-score-form", content);
    state = tick(state, { kind: "submitScore", nickname: "   " }, content);
    expect(state.alert).toBe("message");
    expect(state.message).toBe("Please enter a nickname.");

    state = tick(state, { kind: "pointerUp", point: { x: 260, y: 250 } }, content);
    expect(state.alert).toBeNull();
    state = tick(state, { kind: "submitScore", nickname: "  Kevin_42  " }, content);
    expect(state.screen).toBe("high-score-sending");
    expect(state.nickname).toBe("Kevin_42");
    expect(state.sendingFrames).toBe(90);
  });

  it("makes the authored high-score form reachable after the final level", () => {
    let state = startLevel({ ...createInitialState(), score: 5000, highScore: 5000 }, content, 25);
    state.gps!.state = "next_level";
    state = tick(state, { kind: "none" }, content);
    expect(state.screen).toBe("high-score-form");
    expect(state.gps).toBeNull();
  });

  it("accepts an accessible touch radius and safely cancels a pullback", () => {
    let state = startLevel(createInitialState(), content, 1);
    const start = { x: state.gps!.point.x - 25, y: state.gps!.point.y };
    state = tick(state, { kind: "pointerDown", point: start, hitRadius: 30 }, content);
    expect(state.gps!.state).toBe("pullback");
    expect(state.pointer.down).toBe(true);

    state = tick(state, { kind: "pointerMove", point: { x: 469, y: 355 } }, content);
    state = tick(state, { kind: "pointerCancel", point: { x: 469, y: 355 } }, content);
    expect(state.gps!.state).toBe("iddle");
    expect(state.gps!.tries).toBe(0);
    expect(state.pointer.down).toBe(false);
  });

  it("enables the orbit notification only on the Score frame that owns behavior 16", () => {
    const enabledLevels = Array.from({ length: 25 }, (_, index) => startLevel(createInitialState(), content, index + 1))
      .filter((state) => state.gps!.orbitNotificationEnabled)
      .map((state) => state.level);
    expect(enabledLevels).toEqual([4]);
  });

  it("shows the level-four orbit warning once and allows an unbounded continuation or a retry", () => {
    let state = startLevel(createInitialState(), content, 4);
    state.gps!.state = "soaring";
    state.gps!.point = { x: 250, y: 200 };
    state.gps!.distance = 1501;
    state.gps!.velocity = { x: 0, y: 0 };
    state.planets = [];
    state.bonuses = [];
    state = tick(state, { kind: "none" }, content);
    expect(state.alert).toBe("message");
    expect(state.message).toContain("Looks like you're in an orbit");
    const frozen = structuredClone(state.gps!.point);
    state = tick(state, { kind: "key", key: "x" }, content);
    expect(state.gps!.point).toEqual(frozen);

    state = tick(state, { kind: "pointerUp", point: { x: 260, y: 250 } }, content);
    expect(state.alert).toBeNull();
    expect(state.message).toBeNull();
    expect(state.gps!.state).toBe("soaring");

    for (let frame = 0; frame < 600; frame += 1) state = tick(state, { kind: "none" }, content);
    expect(state.gps!.state).toBe("soaring");
    expect(state.gps!.frameCount).toBe(0);
    expect(state.alert).toBeNull();

    state = tick(state, { kind: "pointerUp", point: { x: 100, y: 100 } }, content);
    expect(state.gps!.state).toBe("iddle");
    expect(state.alert).toBeNull();
  });

  it("does not mistake a high-value bonus on another level for an orbit", () => {
    let state = startLevel(createInitialState(), content, 5);
    state.gps!.state = "soaring";
    state.gps!.distance = 5100;
    state.gps!.velocity = { x: 1, y: 0 };
    state = tick(state, { kind: "none" }, content);
    expect(state.gps!.orbitNotificationEnabled).toBe(false);
    expect(state.alert).toBeNull();
    expect(state.gps!.state).toBe("soaring");
  });

  it("rounds a fractional level score to the nearest unit", () => {
    let state = startLevel({ ...createInitialState(), score: 10, highScore: 10 }, content, 2);
    state.gps!.state = "hitTarget";
    state.gps!.frameCount = -1;
    state.gps!.distance = 101.9;
    state.gps!.tries = 3;

    state = tick(state, { kind: "none" }, content);
    expect(state.gps!.scoreFinal).toBe(78);
    for (let frame = 0; frame < 500 && state.gps!.scorePhase < 4; frame += 1) {
      state = tick(state, { kind: "none" }, content);
    }
    expect(state.gps!.scorePhase).toBe(4);
    expect(state.gps!.scoreTarget).toBe(68);
  });
});

function compareGps(state: ReturnType<typeof createInitialState>, expected: any, level: number, sample: number) {
  expect(state.gps, `level ${level} sample ${sample} GPS`).not.toBeNull();
  expect(state.gps!.state, `level ${level} sample ${sample} state`).toBe(expected.state);
  expect(state.gps!.point.x, `level ${level} sample ${sample} point.x`).toBeCloseTo(expected.pointX, 3);
  expect(state.gps!.point.y, `level ${level} sample ${sample} point.y`).toBeCloseTo(expected.pointY, 3);
  expect(state.gps!.velocity.x, `level ${level} sample ${sample} velocity.x`).toBeCloseTo(expected.velocityX, 3);
  expect(state.gps!.velocity.y, `level ${level} sample ${sample} velocity.y`).toBeCloseTo(expected.velocityY, 3);
  expect(state.gps!.frameCount, `level ${level} sample ${sample} frame count`).toBe(expected.stateFrameCount);
  expect(state.gps!.tries, `level ${level} sample ${sample} tries`).toBe(expected.tries);
  expect(state.gps!.distance, `level ${level} sample ${sample} distance`).toBeCloseTo(expected.distance, 3);
}
