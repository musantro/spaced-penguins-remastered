import { describe, expect, it } from "vitest";

import { loadContent } from "../content/load";
import { createInitialState, startLevel } from "../core/game";
import { scoringDisplayValues } from "./renderer";

const content = loadContent();

describe("Director scoring display phases", () => {
  it("animates each operand only during its own phase", () => {
    const state = startLevel(createInitialState(), content, 4);
    const gps = state.gps!;
    gps.distance = 317.728;
    gps.tries = 2;

    gps.scorePhase = 1;
    gps.scoreCurrent = 270;
    expect(scoringDisplayValues(state)).toEqual({ distance: 270, level: 0, tries: 0, equationScore: 0, totalScore: 0 });

    gps.scorePhase = 2;
    gps.scoreCurrent = 2.75;
    expect(scoringDisplayValues(state)).toEqual({ distance: 318, level: 2, tries: 0, equationScore: 0, totalScore: 0 });

    gps.scorePhase = 3;
    gps.scoreCurrent = 1.25;
    expect(scoringDisplayValues(state)).toEqual({ distance: 318, level: 4, tries: 1, equationScore: 0, totalScore: 0 });

    gps.scorePhase = 4;
    gps.scoreCurrent = 125;
    expect(scoringDisplayValues(state)).toEqual({ distance: 318, level: 4, tries: 2, equationScore: 125, totalScore: 125 });
  });

  it("rounds the completed equation to the nearest unit", () => {
    const state = startLevel({ ...createInitialState(), score: 10, highScore: 10 }, content, 2);
    const gps = state.gps!;
    gps.distance = 101.9;
    gps.tries = 3;
    gps.scorePhase = 4;
    gps.scoreCurrent = 68;

    expect(scoringDisplayValues(state)).toEqual({ distance: 102, level: 2, tries: 3, equationScore: 68, totalScore: 78 });
  });
});
