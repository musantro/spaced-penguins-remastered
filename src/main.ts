import "./style.css";

import { AudioEngine } from "./audio/audio";
import { createInitialState, showScreen as enterScreen, startLevel, tick } from "./core/game";
import type { GameInput, GameState, Screen } from "./core/types";
import { loadContent } from "./content/load";
import { enqueueInput, takeInput } from "./input/queue";
import { ImageStore } from "./render/assets";
import { Renderer } from "./render/renderer";

const STEP = 1000 / 30;
const canvas = required<HTMLCanvasElement>("game");
const stage = required<HTMLDivElement>("stage");
const status = required<HTMLParagraphElement>("status");
const form = required<HTMLFormElement>("high-score-form");
const nickname = required<HTMLInputElement>("nickname");
const cancelScore = required<HTMLButtonElement>("score-cancel");
const submitScore = required<HTMLButtonElement>("score-submit");
const content = loadContent();
const images = new ImageStore();
const audio = new AudioEngine();
let state: GameState = createInitialState(content);
let inputs: GameInput[] = [];
let lastTime = performance.now();
let accumulator = 0;
let highScoreFormVisible = false;
let highScoreFormDisabled = false;
let stageScale = 1;
let activePointerId: number | null = null;
let activePointerStart = { x: 0, y: 0 };
let activePointerPoint = { x: 0, y: 0 };
let activePointerMoved = false;
const testMode = new URL(window.location.href).searchParams.has("test");

const context = canvas.getContext("2d", { alpha: false });
if (!context) throw new Error("Canvas 2D no está disponible.");
const renderer = new Renderer(context, content, images);

await Promise.all([images.load(content), audio.load(content)]);
status.textContent = "Original assets loaded — 500×400 at 30 fps";
renderNow();
resize();
if (!testMode) requestAnimationFrame(loop);

stage.addEventListener("pointerdown", (event) => {
  if (isHighScoreControlEvent(event)) return;
  if (activePointerId !== null) {
    event.preventDefault();
    return;
  }
  activePointerId = event.pointerId;
  activePointerStart = logicalPoint(event);
  activePointerPoint = activePointerStart;
  activePointerMoved = false;
  stage.setPointerCapture(event.pointerId);
  enqueueInput(inputs, {
    kind: "pointerDown",
    point: activePointerPoint,
    hitRadius: event.pointerType === "touch" ? Math.max(20, 24 / stageScale) : undefined,
  });
  void audio.unlock();
  event.preventDefault();
});
stage.addEventListener("pointermove", (event) => {
  if (isHighScoreControlEvent(event)) return;
  if (event.pointerId !== activePointerId) return;
  activePointerPoint = logicalPoint(event);
  if (Math.hypot(activePointerPoint.x - activePointerStart.x, activePointerPoint.y - activePointerStart.y) > 4) {
    activePointerMoved = true;
  }
  enqueueInput(inputs, { kind: "pointerMove", point: activePointerPoint });
  event.preventDefault();
});
stage.addEventListener("pointerup", (event) => {
  if (isHighScoreControlEvent(event)) return;
  if (event.pointerId !== activePointerId) return;
  const rawPoint = logicalPoint(event);
  const point = event.pointerType === "touch" && !activePointerMoved ? touchAccessiblePoint(rawPoint) : rawPoint;
  if (state.screen === "high-score-form" && state.alert !== "message" && within(point, 285, 320, 475, 390)) {
    enqueueInput(inputs, { kind: "submitScore", nickname: nickname.value });
  } else if (state.screen === "high-score-form" && state.alert !== "message" && within(point, 30, 330, 125, 380)) {
    enqueueInput(inputs, { kind: "cancelScore" });
  } else enqueueInput(inputs, { kind: "pointerUp", point });
  finishPointer(event.pointerId);
  event.preventDefault();
});
stage.addEventListener("pointercancel", (event) => {
  if (isHighScoreControlEvent(event)) return;
  if (event.pointerId !== activePointerId) return;
  enqueueInput(inputs, { kind: "pointerCancel", point: activePointerPoint });
  finishPointer(event.pointerId);
  event.preventDefault();
});
stage.addEventListener("lostpointercapture", (event) => {
  if (event.pointerId !== activePointerId) return;
  enqueueInput(inputs, { kind: "pointerCancel", point: activePointerPoint });
  clearPointer();
});
stage.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("keydown", (event) => {
  if (isHighScoreControlEvent(event)) return;
  enqueueInput(inputs, { kind: "key", key: event.key });
  if ([" ", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
});
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
window.visualViewport?.addEventListener("scroll", resize);
window.addEventListener("blur", cancelPointer);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelPointer();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  enqueueInput(inputs, { kind: "submitScore", nickname: nickname.value });
});
cancelScore.addEventListener("click", () => enqueueInput(inputs, { kind: "cancelScore" }));

function loop(time: number) {
  accumulator += Math.min(250, time - lastTime);
  lastTime = time;
  while (accumulator >= STEP) {
    const input = takeInput(inputs);
    step(input);
    accumulator -= STEP;
  }
  renderNow();
  requestAnimationFrame(loop);
}

function step(input: GameInput) {
  state = tick(state, input, content);
  if (!testMode) audio.play(state.audioEvents);
}

function renderNow() {
  const visible = state.screen === "high-score-form";
  const disabled = state.alert === "message";
  const shouldFocus = visible && (!highScoreFormVisible || (highScoreFormDisabled && !disabled));
  form.hidden = !visible;
  nickname.disabled = disabled;
  cancelScore.disabled = disabled;
  submitScore.disabled = disabled;
  if (visible && !highScoreFormVisible) nickname.value = state.nickname;
  if (shouldFocus) queueMicrotask(() => {
    if (!form.hidden && !nickname.disabled) {
      nickname.focus();
      nickname.select();
    }
  });
  highScoreFormVisible = visible;
  highScoreFormDisabled = disabled;
  renderer.render(state);
}

function logicalPoint(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * 500 / rect.width, y: (event.clientY - rect.top) * 400 / rect.height };
}

function resize() {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  stageScale = Math.min(width / 500, height / 400);
  stage.style.left = `${left + width / 2}px`;
  stage.style.top = `${top + height / 2}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${stageScale})`;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta #${id}.`);
  return element as T;
}

function within(point: { x: number; y: number }, left: number, top: number, right: number, bottom: number) {
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function isHighScoreControlEvent(event: Event) {
  return event.target instanceof Node && form.contains(event.target);
}

function finishPointer(pointerId: number) {
  clearPointer();
  if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
}

function clearPointer() {
  activePointerId = null;
  activePointerMoved = false;
}

function cancelPointer() {
  if (activePointerId === null) return;
  enqueueInput(inputs, { kind: "pointerCancel", point: activePointerPoint });
  finishPointer(activePointerId);
}

function touchAccessiblePoint(point: { x: number; y: number }) {
  const targets = touchTargets();
  const minimumSize = 48 / stageScale;
  for (const target of targets) {
    const width = target.right - target.left;
    const height = target.bottom - target.top;
    const horizontalPadding = Math.max(0, (minimumSize - width) / 2);
    const verticalPadding = Math.max(0, (minimumSize - height) / 2);
    if (within(point, target.left - horizontalPadding, target.top - verticalPadding, target.right + horizontalPadding, target.bottom + verticalPadding)) {
      return { x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 };
    }
  }
  return point;
}

function touchTargets() {
  if (state.alert === "message") return [{ left: 215, top: 225, right: 310, bottom: 280 }];
  if (state.alert === "reallyquit") return [
    { left: 185, top: 220, right: 250, bottom: 270 },
    { left: 255, top: 220, right: 330, bottom: 270 },
  ];
  if (state.screen === "intro") return [
    { left: 350, top: 300, right: 480, bottom: 380 },
    { left: 420, top: 225, right: 485, bottom: 275 },
    { left: 20, top: 335, right: 140, bottom: 385 },
  ];
  if (state.screen === "tips") return [
    { left: 55, top: 255, right: 155, bottom: 310 },
    { left: 350, top: 300, right: 480, bottom: 380 },
    { left: 20, top: 335, right: 140, bottom: 385 },
  ];
  if (state.screen === "end-stats") return [{ left: 165, top: 335, right: 355, bottom: 400 }];
  if (state.screen === "high-score-form") return [
    { left: 30, top: 330, right: 125, bottom: 380 },
    { left: 285, top: 320, right: 475, bottom: 390 },
  ];
  if (state.screen === "level") return [{ left: 465, top: 0, right: 500, bottom: 24 }];
  return [];
}

declare global {
  interface Window {
    spacedPenguinState?: () => GameState;
    spacedPenguinTest?: {
      advance(frames: number, input?: GameInput): GameState;
      dispatch(input: GameInput): GameState;
      startLevel(level: number): GameState;
      showScreen(screen: Exclude<Screen, "level">, score?: number, highScore?: number): GameState;
    };
  }
}
window.spacedPenguinState = () => structuredClone(state);
window.spacedPenguinTest = {
  advance(frames, input = { kind: "none" }) {
    for (let index = 0; index < frames; index += 1) step(index === 0 ? input : { kind: "none" });
    renderNow();
    return structuredClone(state);
  },
  dispatch(input) {
    step(input);
    renderNow();
    return structuredClone(state);
  },
  startLevel(level) {
    state = startLevel(state, content, level);
    renderNow();
    return structuredClone(state);
  },
  showScreen(screen, score = state.score, highScore = state.highScore) {
    state = enterScreen({ ...state, score, highScore }, screen, content);
    renderNow();
    return structuredClone(state);
  },
};
