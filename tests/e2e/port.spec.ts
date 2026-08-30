import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const goldenRoot = path.resolve("reference/test-api/runs/all-levels-physics-and-screens-20260830-v2");

test.beforeEach(async ({ page }) => {
  await page.goto("/?test=1");
  await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
});

test("renders the independently captured Director intro within the vector rasterization budget", async ({ page }) => {
  const actual = PNG.sync.read(await page.locator("#game").screenshot());
  const expected = PNG.sync.read(fs.readFileSync(path.join(goldenRoot, "stage-entry-screen-intro.png")));
  const differences = pixelmatch(expected.data, actual.data, null, expected.width, expected.height, { threshold: 0.1 });
  console.info(`Director intro pixel difference: ${differences}/${expected.width * expected.height}`);
  expect(differences / (expected.width * expected.height)).toBeLessThan(0.001);
});

test("matches the independently captured non-gameplay screen matrix", async ({ page }) => {
  const cases = [
    { screen: "tips", golden: "stage-entry-screen-tips.png", score: 0 },
    { screen: "end-stats", golden: "stage-entry-screen-end-stats.png", score: 0 },
    { screen: "high-score-form", golden: "stage-entry-screen-high-score-form.png", score: 1562, ignoreRect: { left: 95, top: 140, right: 395, bottom: 237 } },
    { screen: "high-score-sending", golden: "stage-screen-high-score-sending.png", score: 1562 },
  ];
  for (const value of cases) {
    await page.evaluate(({ screen, score }) => (window as any).spacedPenguinTest.showScreen(screen, score, score), value);
    const actual = PNG.sync.read(await page.locator("#game").screenshot());
    const expected = PNG.sync.read(fs.readFileSync(path.join(goldenRoot, value.golden)));
    if (value.ignoreRect) maskRect(actual, expected, value.ignoreRect);
    const differences = pixelmatch(expected.data, actual.data, null, expected.width, expected.height, { threshold: 0.1 });
    console.info(`Director ${value.screen} pixel difference: ${differences}/${expected.width * expected.height}`);
    expect(differences / (expected.width * expected.height), value.screen).toBeLessThan(0.012);
  }
});

test("edits, submits and cancels the single Nickname high-score form", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
  await page.evaluate(() => (window as any).spacedPenguinTest.showScreen("high-score-form", 512368, 512368));

  const nickname = page.getByLabel("Nickname");
  await expect(nickname).toBeVisible();
  await expect(nickname).toBeFocused();
  await expect(page.getByLabel("First Name")).toHaveCount(0);
  await expect(page.getByLabel("State")).toHaveCount(0);

  await page.getByRole("button", { name: "Submit score" }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).spacedPenguinState().message)).toBe("Please enter a nickname.");
  await page.mouse.click(260, 250);
  await expect.poll(async () => page.evaluate(() => (window as any).spacedPenguinState().alert)).toBeNull();

  await nickname.fill("Kevin_42");
  await nickname.press("Enter");
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as any).spacedPenguinState();
    return { screen: state.screen, nickname: state.nickname };
  })).toEqual({ screen: "high-score-sending", nickname: "Kevin_42" });

  await page.evaluate(() => (window as any).spacedPenguinTest.showScreen("high-score-form", 512368, 512368));
  await page.getByRole("button", { name: "Cancel score" }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).spacedPenguinState().screen)).toBe("end-stats");
});

test("fits mobile viewports and supports touch launch and cancellation", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4173/");
    await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));

    let stageBox = await page.locator("#stage").boundingBox();
    expect(stageBox).not.toBeNull();
    expect(stageBox!.x).toBeCloseTo(0, 1);
    expect(stageBox!.width).toBeCloseTo(390, 1);
    expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(390.5);

    await page.touchscreen.tap(stageBox!.x + 410 / 500 * stageBox!.width, stageBox!.y + 340 / 400 * stageBox!.height);
    await expect.poll(async () => page.evaluate(() => (window as any).spacedPenguinState().screen)).toBe("level");

    let gameState = await page.evaluate(() => (window as any).spacedPenguinState());
    const touchStart = { x: gameState.gps.point.x - 25, y: gameState.gps.point.y };
    const pull = { x: 469, y: 355 };
    const client = await context.newCDPSession(page);
    const toClient = (point: { x: number; y: number }) => ({
      x: stageBox!.x + point.x / 500 * stageBox!.width,
      y: stageBox!.y + point.y / 400 * stageBox!.height,
    });
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...toClient(touchStart), id: 1 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...toClient(pull), id: 1 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as any).spacedPenguinState();
      return { pointerDown: state.pointer.down, tries: state.gps.tries, launched: !["iddle", "pullback"].includes(state.gps.state) };
    })).toEqual({ pointerDown: false, tries: 1, launched: true });

    await page.evaluate(() => (window as any).spacedPenguinTest.startLevel(1));
    gameState = await page.evaluate(() => (window as any).spacedPenguinState());
    const cancelStart = toClient(gameState.gps.point);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...cancelStart, id: 2 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...toClient(pull), id: 2 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as any).spacedPenguinState();
      return { pointerDown: state.pointer.down, tries: state.gps.tries, gps: state.gps.state };
    })).toEqual({ pointerDown: false, tries: 0, gps: "iddle" });

    const landscapeContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
    });
    try {
      const landscapePage = await landscapeContext.newPage();
      await landscapePage.goto("http://127.0.0.1:4173/");
      await landscapePage.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
      stageBox = await landscapePage.locator("#stage").boundingBox();
      expect(stageBox).not.toBeNull();
      expect(stageBox!.x).toBeGreaterThanOrEqual(-0.5);
      expect(stageBox!.y).toBeGreaterThanOrEqual(-0.5);
      expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(844.5);
      expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(390.5);
      expect(await landscapePage.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
    } finally {
      await landscapeContext.close();
    }
  } finally {
    await context.close();
  }
});

test("runs the canonical shot deterministically and advances with the Director score", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = (window as any).spacedPenguinTest;
    api.dispatch({ kind: "pointerUp", point: { x: 410, y: 340 } });
    api.dispatch({ kind: "pointerDown", point: { x: 413, y: 303 } });
    api.dispatch({ kind: "pointerMove", point: { x: 469, y: 355 } });
    api.dispatch({ kind: "pointerUp", point: { x: 469, y: 355 } });
    return api.advance(260);
  });
  expect(result.screen).toBe("level");
  expect(result.level).toBe(2);
  expect(result.score).toBe(318);
  expect(result.highScore).toBe(318);
});

test("never overlaps or leaves behind a scoring audio loop", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
  const result = await page.evaluate(() => {
    const probe = { active: new Set<number>(), loopStarts: 0, maxActive: 0, stops: 0, nextId: 0 };
    const ids = new WeakMap<AudioBufferSourceNode, number>();
    const originalStart = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const id = ++probe.nextId;
      ids.set(this, id);
      if (this.loop) {
        probe.active.add(id);
        probe.loopStarts += 1;
        probe.maxActive = Math.max(probe.maxActive, probe.active.size);
      }
      return (originalStart as any).apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      const id = ids.get(this);
      if (id !== undefined && probe.active.delete(id)) probe.stops += 1;
      return (originalStop as any).apply(this, args);
    };

    const api = (window as any).spacedPenguinTest;
    api.startLevel(1);
    api.dispatch({ kind: "pointerDown", point: { x: 413, y: 303 } });
    api.dispatch({ kind: "pointerMove", point: { x: 469, y: 355 } });
    api.dispatch({ kind: "pointerUp", point: { x: 469, y: 355 } });
    const state = api.advance(260);
    return {
      active: probe.active.size,
      loopStarts: probe.loopStarts,
      maxActive: probe.maxActive,
      stops: probe.stops,
      level: state.level,
      score: state.score,
    };
  });

  expect(result).toEqual({ active: 0, loopStarts: 4, maxActive: 1, stops: 4, level: 2, score: 318 });
});

test("stops the total-score loop when the player clicks to skip it", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
  const result = await page.evaluate(() => {
    const probe = { active: new Set<number>(), stops: 0, nextId: 0 };
    const ids = new WeakMap<AudioBufferSourceNode, number>();
    const originalStart = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const id = ++probe.nextId;
      ids.set(this, id);
      if (this.loop) probe.active.add(id);
      return (originalStart as any).apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      const id = ids.get(this);
      if (id !== undefined && probe.active.delete(id)) probe.stops += 1;
      return (originalStop as any).apply(this, args);
    };

    const api = (window as any).spacedPenguinTest;
    api.startLevel(1);
    api.dispatch({ kind: "pointerDown", point: { x: 413, y: 303 } });
    api.dispatch({ kind: "pointerMove", point: { x: 469, y: 355 } });
    api.dispatch({ kind: "pointerUp", point: { x: 469, y: 355 } });
    let state = api.advance(1);
    for (let frame = 0; frame < 400; frame += 1) {
      if (state.alert === "scoring" && state.gps.scorePhase === 4 && state.gps.scoreCurrent > 0 && state.gps.scoreCurrent < state.gps.scoreTarget) break;
      state = api.advance(1);
    }
    const activeBeforeSkip = probe.active.size;
    api.dispatch({ kind: "pointerDown", point: { x: 250, y: 200 } });
    state = api.dispatch({ kind: "pointerUp", point: { x: 250, y: 200 } });
    return {
      activeBeforeSkip,
      activeAfterSkip: probe.active.size,
      stops: probe.stops,
      level: state.level,
      score: state.score,
      pendingAudio: state.audioEvents,
    };
  });

  expect(result).toEqual({
    activeBeforeSkip: 1,
    activeAfterSkip: 0,
    stops: 4,
    level: 2,
    score: 318,
    pendingAudio: [{ name: "all", stop: true }],
  });
});

test("does not mistake a high-value level-five bonus for an orbit", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = (window as any).spacedPenguinTest;
    api.startLevel(5);
    api.dispatch({ kind: "pointerDown", point: { x: 401, y: 239 } });
    api.dispatch({ kind: "pointerMove", point: { x: 330, y: 170 } });
    api.dispatch({ kind: "pointerUp", point: { x: 330, y: 170 } });
    let state = api.advance(1);
    for (let frame = 0; frame < 60 && !state.bonuses[0].collected; frame += 1) state = api.advance(1);
    return { alert: state.alert, collected: state.bonuses[0].collected, distance: state.gps.distance, gps: state.gps.state };
  });

  expect(result).toMatchObject({ alert: null, collected: true, gps: "soaring" });
  expect(result.distance).toBeGreaterThan(5000);
});

test("offers the original unbounded continue-or-retry orbit flow on level four", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = (window as any).spacedPenguinTest;
    let state = api.startLevel(4);
    const pull = { x: state.gps.hoop.x, y: state.gps.hoop.y + 40 };
    api.dispatch({ kind: "pointerDown", point: state.gps.point });
    api.dispatch({ kind: "pointerMove", point: pull });
    api.dispatch({ kind: "pointerUp", point: pull });
    state = api.advance(180);
    const notified = {
      alert: state.alert,
      bonusCollected: state.bonuses[0].collected,
      gps: state.gps.state,
      frameCount: state.gps.frameCount,
    };
    api.dispatch({ kind: "pointerUp", point: { x: 260, y: 250 } });
    state = api.advance(600);
    const continued = { alert: state.alert, gps: state.gps.state, frameCount: state.gps.frameCount };
    api.dispatch({ kind: "pointerUp", point: { x: 100, y: 100 } });
    state = api.advance(1);
    return { notified, continued, retried: { alert: state.alert, gps: state.gps.state } };
  });

  expect(result.notified).toEqual({ alert: "message", bonusCollected: false, gps: "soaring", frameCount: 0 });
  expect(result.continued).toEqual({ alert: null, gps: "soaring", frameCount: 0 });
  expect(result.retried).toEqual({ alert: null, gps: "iddle" });
});

test("rounds a fractional five-attempt score to the nearest unit", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = (window as any).spacedPenguinTest;
    let state = api.startLevel(1);
    const hoop = state.gps.hoop;
    const finalPoint = { x: 469, y: 355 };
    const dx = finalPoint.x - hoop.x;
    const dy = finalPoint.y - hoop.y;
    const length = Math.hypot(dx, dy);
    const shortPoint = { x: hoop.x + dx * 15 / length, y: hoop.y + dy * 15 / length };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      api.dispatch({ kind: "pointerDown", point: state.gps.point });
      api.dispatch({ kind: "pointerMove", point: shortPoint });
      api.dispatch({ kind: "pointerUp", point: shortPoint });
      state = api.advance(1);
      for (let frame = 0; frame < 100 && state.gps.state !== "soaring"; frame += 1) state = api.advance(1);
      api.dispatch({ kind: "pointerUp", point: { x: 100, y: 100 } });
      state = api.advance(1);
    }

    api.dispatch({ kind: "pointerDown", point: state.gps.point });
    api.dispatch({ kind: "pointerMove", point: finalPoint });
    api.dispatch({ kind: "pointerUp", point: finalPoint });
    state = api.advance(1);
    for (let frame = 0; frame < 400 && state.alert !== "scoring"; frame += 1) state = api.advance(1);
    for (let frame = 0; frame < 400 && state.gps.scorePhase < 4; frame += 1) state = api.advance(1);
    for (let frame = 0; frame < 10 && state.gps.scoreCurrent !== state.gps.scoreTarget; frame += 1) state = api.advance(1);
    return {
      distance: Math.round(state.gps.distance),
      tries: state.gps.tries,
      scoreTarget: state.gps.scoreTarget,
      scoreFinal: state.gps.scoreFinal,
    };
  });

  expect(result).toEqual({ distance: 318, tries: 5, scoreTarget: 64, scoreFinal: 64 });
});

test("loads all 25 authored Score levels through the browser testing API", async ({ page }) => {
  const levels = await page.evaluate(() => {
    const api = (window as any).spacedPenguinTest;
    return Array.from({ length: 25 }, (_, index) => {
      const state = api.startLevel(index + 1);
      return { level: state.level, planets: state.planets.length, bonuses: state.bonuses.length, gps: Boolean(state.gps) };
    });
  });
  expect(levels).toHaveLength(25);
  expect(levels.every((level, index) => level.level === index + 1 && level.gps)).toBe(true);
  expect(levels.some((level) => level.planets > 1)).toBe(true);
  expect(levels.some((level) => level.bonuses > 0)).toBe(true);
});

test("coalesces dense browser pointer streams without trapping release or Quit", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
  await page.evaluate(() => (window as any).spacedPenguinTest.startLevel(1));
  await page.mouse.move(413, 303);
  await page.mouse.down();
  await page.evaluate(() => {
    const stage = document.querySelector("#stage")!;
    for (let index = 0; index < 360; index += 1) {
      const progress = index / 359;
      stage.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientX: 413 + 56 * progress,
        clientY: 303 + 52 * progress,
        pointerId: 1,
      }));
    }
  });
  await page.mouse.move(469, 355);
  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() => {
    const state = (window as any).spacedPenguinState();
    return !state.pointer.down && state.gps?.tries === 1 && !["iddle", "pullback"].includes(state.gps?.state);
  }), { timeout: 750 }).toBe(true);

  await page.evaluate(() => (window as any).spacedPenguinTest.startLevel(2));
  await page.mouse.click(483, 12);
  await expect.poll(async () => page.evaluate(() => (window as any).spacedPenguinState().alert), { timeout: 500 }).toBe("reallyquit");
});

test("remains responsive across repeated dense drag attempts", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).spacedPenguinTest));
  await page.evaluate(() => (window as any).spacedPenguinTest.startLevel(2));

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const drag = await page.evaluate(() => {
      const gps = (window as any).spacedPenguinState().gps;
      const dx = gps.point.x - gps.hoop.x;
      const dy = gps.point.y - gps.hoop.y;
      const length = Math.hypot(dx, dy);
      return {
        start: gps.point,
        end: { x: gps.hoop.x + dx / length * 100, y: gps.hoop.y + dy / length * 100 },
      };
    });
    await page.mouse.move(drag.start.x, drag.start.y);
    await page.mouse.down();
    await page.evaluate(({ start, end }) => {
      const stage = document.querySelector("#stage")!;
      for (let index = 0; index < 120; index += 1) {
        const progress = index / 119;
        stage.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          buttons: 1,
          clientX: start.x + (end.x - start.x) * progress,
          clientY: start.y + (end.y - start.y) * progress,
          pointerId: 1,
        }));
      }
    }, drag);
    await page.mouse.move(drag.end.x, drag.end.y);
    await page.mouse.up();
    await expect.poll(async () => page.evaluate(() => (window as any).spacedPenguinState().gps?.state), { timeout: 750 }).toBe("soaring");
    await page.mouse.click(250, 200);
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as any).spacedPenguinState();
      return { gps: state.gps?.state, tries: state.gps?.tries, pointerDown: state.pointer.down };
    }), { timeout: 750 }).toEqual({ gps: "iddle", tries: attempt, pointerDown: false });
  }
});

function maskRect(
  actual: PNG,
  expected: PNG,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const offset = (y * actual.width + x) * 4;
      expected.data.copy(actual.data, offset, offset, offset + 4);
    }
  }
}
