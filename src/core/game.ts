import type { Content, Point, ScoreSprite } from "../content/types";
import { parseBehaviors } from "../content/load";
import { add, directorInteger, distance, distanceBetween, findPoint, inside, rotationAngle, subtract } from "../director-compat/math";
import { roundedLevelScore } from "./scoring";
import type { BonusState, GameInput, GameState, GPSRuntime, MenuOrbiter, OrbitState, PlanetState, Screen } from "./types";

const GRAVITY = 0.9;
const TRACE_COLORS = ["#00ffff", "#0000ff", "#ff00ff", "#ff0000", "#ffff00", "#00ff00", "#c8c8c8"];

export function createInitialState(content?: Content): GameState {
  const state: GameState = {
    screen: "intro", frame: 0, level: 0, score: 0, highScore: 0, alert: null, message: null, levelFrame: 0,
    gps: null, planets: [], bonuses: [], trail: [], pointer: { down: false, point: { x: 0, y: 0 } },
    sendingFrames: 0, nickname: "", menuFrame: 0, menuOrbiters: [], audioEvents: [],
  };
  return content ? enterMenuScreen(state, "intro", content) : state;
}

export function showScreen(previous: GameState, screen: Exclude<Screen, "level">, content: Content): GameState {
  const next = structuredClone(previous) as GameState;
  next.gps = null;
  next.planets = [];
  next.bonuses = [];
  next.trail = [];
  return enterMenuScreen(next, screen, content);
}

export function startLevel(previous: GameState, content: Content, level: number): GameState {
  const frame = content.frames.get(level + 10);
  if (!frame) throw new Error(`No existe el nivel ${level}.`);
  const gpsSprite = frame.sprites.find((sprite) => parseBehaviors(sprite.scriptList).has(2));
  if (!gpsSprite) throw new Error(`El nivel ${level} no contiene GPS.`);
  const gpsProperties = parseBehaviors(gpsSprite.scriptList).get(2) ?? {};
  const targetChannel = numeric(gpsProperties.pTarget, 7);
  const targetSprite = frame.sprites.find((sprite) => sprite.channel === targetChannel);
  if (!targetSprite) throw new Error(`El nivel ${level} no contiene el objetivo ${targetChannel}.`);
  const hoopSprite = frame.sprites.find((sprite) => sprite.channel === gpsSprite.channel + 2);
  if (!hoopSprite) throw new Error(`El nivel ${level} no contiene el aro superior.`);
  const hoop = { x: hoopSprite.locH, y: hoopSprite.locV };
  const hoopAngle = hoopSprite.rotation;
  const planets = frame.sprites.filter((sprite) => parseBehaviors(sprite.scriptList).has(4)).map(createPlanet);
  const bonuses = frame.sprites.filter((sprite) => parseBehaviors(sprite.scriptList).has(13)).map(createBonus);
  const orbitNotificationEnabled = frame.sprites.some((sprite) => parseBehaviors(sprite.scriptList).has(16));
  const animationMin = 75 + 12 * ((level - 1) % 3);
  const gps: GPSRuntime = {
    channel: gpsSprite.channel,
    targetChannel,
    targetPoint: { x: targetSprite.locH, y: targetSprite.locV },
    targetFloatPoint: { x: targetSprite.locH, y: targetSprite.locV },
    targetWidth: targetSprite.width,
    targetHeight: targetSprite.height,
    targetOrbit: createOrbit(targetSprite),
    border: numeric(gpsProperties.pBorder, 100),
    lastLevel: Boolean(numeric(gpsProperties.plastLevel, 0)),
    stretchLimit: numeric(gpsProperties.pStretchLimit, 100),
    state: "iddle",
    point: findPoint(hoop, hoopAngle, 30),
    velocity: { x: 0, y: 0 },
    frameCount: 0,
    tries: 0,
    distance: 0,
    hoop,
    hoopAngle,
    kevinMember: animationMin,
    animationMin,
    animationMax: animationMin + 11,
    animationDirection: level % 2 ? 1 : -1,
    animationSwap: true,
    targetOpen: false,
    scorePhase: 0,
    scoreCurrent: 0,
    scoreTarget: 0,
    scoreRate: 0,
    scoreHold: 0,
    scoreFinal: previous.score,
    orbitNotificationEnabled,
    orbitNotified: false,
  };
  return {
    ...previous,
    screen: "level",
    level,
    levelFrame: level + 10,
    alert: null,
    message: null,
    gps,
    planets,
    bonuses,
    trail: [],
    menuFrame: 0,
    menuOrbiters: [],
    pointer: { down: false, point: gps.point },
    audioEvents: [],
  };
}

export function tick(state: GameState, input: GameInput, content: Content): GameState {
  const next = structuredClone(state) as GameState;
  next.frame += 1;
  next.audioEvents = [];
  if (next.screen !== "level") return tickScreen(next, input, content);
  if (!next.gps) return next;
  handleLevelInput(next, input, content);
  if (next.screen !== "level") return enterMenuScreen(next, next.screen, content);
  for (const bonus of next.bonuses) {
    if (bonus.rotationVelocity > 3) bonus.rotationVelocity -= 0.1;
    bonus.rotation += bonus.rotationVelocity;
  }
  updateOrbits(next, content);
  prepareGps(next, content);
  if (next.gps.state === "next_level") {
    if (next.gps.lastLevel || next.level >= 25) {
      const finished = { ...next, gps: null, planets: [], bonuses: [] };
      // The original consulted an obsolete Big Idea CGI threshold here. The
      // self-contained build treats a completed run as locally qualifying so
      // the authored high-score form remains reachable without network I/O.
      return enterMenuScreen(finished, "high-score-form", content);
    }
    const followingLevel = startLevel(next, content, next.level + 1);
    // `finishScoring` may have stopped a channel on this same frame. Starting
    // the next Score frame must not discard that browser-facing side effect.
    followingLevel.audioEvents = next.audioEvents;
    return followingLevel;
  }
  return next;
}

export function launchFromPolar(state: GameState, distanceValue: number, launchAngle: number): GameState {
  const next = structuredClone(state) as GameState;
  const gps = requiredGps(next);
  const clamped = Math.max(10, Math.min(distanceValue, gps.stretchLimit));
  gps.hoopAngle = launchAngle + 180;
  gps.point = findPoint(gps.hoop, gps.hoopAngle, clamped);
  gps.state = "pullback";
  setUpSnapping(next);
  return next;
}

function tickScreen(state: GameState, input: GameInput, content: Content): GameState {
  if (state.screen === "high-score-sending") {
    state.sendingFrames -= 1;
    if (state.sendingFrames <= 0) return enterMenuScreen(state, "end-stats", content);
  }
  if (input.kind === "key" && state.screen === "intro" && input.key.toLowerCase() === "s") return startLevel(state, content, 1);
  if (input.kind === "submitScore" && state.screen === "high-score-form") {
    submitHighScore(state, input.nickname ?? "", content);
  }
  if (input.kind === "cancelScore" && state.screen === "high-score-form") enterMenuScreen(state, "end-stats", content);
  if (input.kind !== "pointerUp") {
    updateMenuOrbiters(state);
    return state;
  }
  const { x, y } = input.point;
  if (state.alert === "message") {
    if (within(x, y, 215, 225, 310, 280)) {
      state.alert = null;
      state.message = null;
    }
    return state;
  }
  if (state.screen === "intro") {
    if (within(x, y, 350, 300, 480, 380)) return startLevel(state, content, 1);
    if (within(x, y, 420, 225, 485, 275)) enterMenuScreen(state, "tips", content);
    else if (within(x, y, 20, 335, 140, 385)) enterMenuScreen(state, "end-stats", content);
  } else if (state.screen === "tips") {
    if (within(x, y, 55, 255, 155, 310)) enterMenuScreen(state, "intro", content);
    else if (within(x, y, 350, 300, 480, 380)) return startLevel(state, content, 1);
    else if (within(x, y, 20, 335, 140, 385)) enterMenuScreen(state, "end-stats", content);
  } else if (state.screen === "end-stats") {
    if (within(x, y, 165, 335, 355, 400)) return startLevel({ ...state, score: 0 }, content, 1);
  } else if (state.screen === "high-score-form") {
    if (within(x, y, 30, 330, 125, 380)) enterMenuScreen(state, "end-stats", content);
  }
  updateMenuOrbiters(state);
  return state;
}

function submitHighScore(state: GameState, nickname: string, content: Content) {
  const name = nickname.trim();
  let message: string | null = null;
  if (name.length < 1) message = "Please enter a nickname.";
  else if (name.length > 20) message = "Your nickname must be 20 characters or fewer.";
  if (message) {
    state.alert = "message";
    state.message = message;
    return;
  }
  state.alert = null;
  state.message = null;
  state.nickname = name;
  enterMenuScreen(state, "high-score-sending", content);
  state.sendingFrames = 90;
}

function handleLevelInput(state: GameState, input: GameInput, content: Content) {
  const gps = requiredGps(state);
  if (input.kind === "key") {
    if (input.key.toLowerCase() === "q") state.alert = state.alert === "reallyquit" ? null : "reallyquit";
    else if (state.alert === "reallyquit" && input.key.toLowerCase() === "y") state.screen = "end-stats";
    else if (state.alert === "reallyquit" && input.key.toLowerCase() === "n") state.alert = null;
    else if (state.alert) return;
    else if (gps.state !== "pullback" && gps.state !== "snapping") resetGps(state);
    return;
  }
  if (input.kind === "pointerDown") {
    state.pointer = { down: true, point: input.point };
    if (state.alert === "scoring") return;
    if (state.alert) return;
    const hitRadius = input.hitRadius ?? 20;
    if (distanceBetween(input.point, gps.point) <= hitRadius && gps.state === "iddle") gps.state = "pullback";
    else if (distanceBetween(input.point, gps.point) <= hitRadius && gps.state === "soaring") {
      gps.state = "crashed";
      gps.frameCount = 1;
    }
  } else if (input.kind === "pointerMove") {
    state.pointer.point = input.point;
  } else if (input.kind === "pointerCancel") {
    state.pointer = { down: false, point: input.point };
    if (gps.state === "pullback") resetGps(state);
  } else if (input.kind === "pointerUp") {
    state.pointer = { down: false, point: input.point };
    if (state.alert === "message") {
      if (within(input.point.x, input.point.y, 215, 225, 310, 280)) {
        state.alert = null;
        state.message = null;
      }
      return;
    }
    if (state.alert === "reallyquit") {
      if (within(input.point.x, input.point.y, 185, 220, 250, 270)) state.screen = "end-stats";
      else if (within(input.point.x, input.point.y, 255, 220, 330, 270)) state.alert = null;
      return;
    }
    if (state.alert === "scoring") {
      finishScoring(state);
      return;
    }
    if (gps.state === "pullback") setUpSnapping(state);
    else if (gps.state === "soaring") resetGps(state);
    if (within(input.point.x, input.point.y, 465, 0, 500, 24)) state.alert = "reallyquit";
  }
  void content;
}

function prepareGps(state: GameState, content: Content) {
  if (state.alert && state.alert !== "scoring") return;
  const gps = requiredGps(state);
  if (gps.state === "pullback") pullbackFrame(state);
  else if (gps.state === "snapping") snappingFrame(state, content);
  else if (gps.state === "soaring") soaringFrame(state, content);
  else if (gps.state === "crashed") crashedFrame(state, content);
  else if (gps.state === "hitTarget") hitTargetFrame(state);
  else if (gps.state === "scoring") scoringFrame(state);
}

function pullbackFrame(state: GameState) {
  const gps = requiredGps(state);
  if (!state.pointer.down) {
    setUpSnapping(state);
    return;
  }
  const angle = rotationAngle(subtract(state.pointer.point, gps.hoop));
  const pullDistance = Math.max(10, Math.min(distanceBetween(gps.hoop, state.pointer.point), gps.stretchLimit));
  const point = findPoint(gps.hoop, angle, pullDistance);
  if (intersectsPlanet(state.planets, point)) return;
  gps.hoopAngle = angle;
  gps.point = point;
}

function setUpSnapping(state: GameState) {
  const gps = requiredGps(state);
  gps.state = "snapping";
  gps.tries += 1;
  // Lingo calculates launch velocity from sprite.loc, which Director has
  // already quantized to integer stage coordinates, while retaining pPoint at
  // full precision for the subsequent trajectory.
  const spritePoint = { x: directorInteger(gps.point.x), y: directorInteger(gps.point.y) };
  const authoredPull = subtract(gps.hoop, spritePoint);
  // Point arithmetic in Director 8 retains integer coordinates here: each
  // component truncates after the multiply/divide expression.
  const normalizedPull = {
    x: Math.trunc(authoredPull.x * 100 / gps.stretchLimit),
    y: Math.trunc(authoredPull.y * 100 / gps.stretchLimit),
  };
  const speed = (normalizedPull.x * normalizedPull.x + normalizedPull.y * normalizedPull.y) / 250;
  const angle = rotationAngle(subtract(gps.hoop, spritePoint));
  gps.velocity = findPoint({ x: 0, y: 0 }, angle, speed);
  gps.frameCount = directorInteger(distance(normalizedPull) / distance(gps.velocity) + 1);
  state.audioEvents.push({ name: "snd_launch" });
}

function snappingFrame(state: GameState, content: Content) {
  const gps = requiredGps(state);
  gps.point = add(gps.point, gps.velocity);
  gps.frameCount -= 1;
  if (gps.frameCount < 1) setUpSoaring(state);
  const hitIndex = intersectsPlanetIndex(state.planets, { x: directorInteger(gps.point.x), y: directorInteger(gps.point.y) });
  // Director's intersectsPlanets returns the one-based list index, while the
  // caller accidentally treats it as a sprite channel. Preserve that quirk.
  if (hitIndex) setUpCrashed(state, hitIndex, content);
}

function setUpSoaring(state: GameState) {
  const gps = requiredGps(state);
  gps.state = "soaring";
  gps.distance = 0;
  state.trail.push({ from: gps.point, to: gps.point, color: traceColor(gps.tries) });
}

function soaringFrame(state: GameState, content: Content) {
  const gps = requiredGps(state);
  const previous = { ...gps.point };
  for (const planet of state.planets) {
    const change = subtract(planet.point, gps.point);
    const separation = distance(change);
    if (separation < planet.gravityReach) {
      if (separation < planet.collisionRadius) setUpCrashed(state, planet.channel, content);
      const squared = change.x * change.x + change.y * change.y;
      const force = squared > 0 ? planet.mass * GRAVITY / squared : 0;
      gps.velocity.x += force * change.x;
      gps.velocity.y += force * change.y;
    }
  }
  for (const bonus of state.bonuses) {
    if (!bonus.collected && distanceBetween(gps.point, bonus.point) < 8 + bonus.width / 2) {
      bonus.collected = true;
      bonus.memberNum += 1;
      bonus.rotationVelocity = 30;
      gps.distance += bonus.value;
      state.audioEvents.push({ name: "snd_bonus" });
    }
  }
  gps.point = add(gps.point, gps.velocity);
  state.trail.push({ from: previous, to: { ...gps.point }, color: traceColor(gps.tries) });
  gps.distance += distanceBetween(gps.point, previous);
  if (gps.orbitNotificationEnabled && gps.distance > 1500 && !gps.orbitNotified && state.highScore === state.score) {
    gps.orbitNotified = true;
    state.alert = "message";
    state.message = "Ooops! Looks like you're in an orbit.  When you want to try again click anywhere on the screen.";
  }
  const spritePoint = { x: directorInteger(gps.point.x), y: directorInteger(gps.point.y) };
  if (intersectsTarget(spritePoint, gps)) setUpHitTarget(state);
  else if (!inside(gps.point, { left: -gps.border, top: -gps.border, right: 500 + gps.border, bottom: 400 + gps.border })) {
    gps.state = "crashed";
    gps.frameCount = 2;
  }
  if (gps.animationSwap) {
    gps.kevinMember += gps.animationDirection;
    if (gps.kevinMember < gps.animationMin) gps.kevinMember = gps.animationMax;
    if (gps.kevinMember > gps.animationMax) gps.kevinMember = gps.animationMin;
    gps.animationSwap = false;
  } else gps.animationSwap = true;
}

function setUpCrashed(state: GameState, spriteChannel: number, content: Content) {
  const gps = requiredGps(state);
  gps.state = "crashed";
  gps.frameCount = 300;
  bounceOffSprite(state, spriteChannel, content);
  state.audioEvents.push({ name: "snd_HitPlanet" });
}

function crashedFrame(state: GameState, content: Content) {
  const gps = requiredGps(state);
  gps.frameCount -= 1;
  gps.point = add(gps.point, gps.velocity);
  gps.kevinMember += gps.animationDirection;
  if (gps.kevinMember < gps.animationMin) gps.kevinMember = gps.animationMax;
  if (gps.kevinMember > gps.animationMax) gps.kevinMember = gps.animationMin;
  const hitIndex = intersectsPlanetIndex(state.planets, { x: directorInteger(gps.point.x), y: directorInteger(gps.point.y) });
  if (hitIndex) {
    bounceOffSprite(state, hitIndex, content);
    state.audioEvents.push({ name: "snd_HitPlanet" });
  }
  if (gps.frameCount < 1 || !inside(gps.point, { left: 0, top: 0, right: 500, bottom: 400 })) resetGps(state);
}

function bounceOffSprite(state: GameState, spriteChannel: number, content: Content) {
  const gps = requiredGps(state);
  const dynamicPlanet = state.planets.find((planet) => planet.channel === spriteChannel);
  const authored = content.frames.get(state.levelFrame)?.sprites.find((sprite) => sprite.channel === spriteChannel);
  const point = dynamicPlanet?.point ?? (authored ? { x: authored.locH, y: authored.locV } : { x: 0, y: 0 });
  const spritePoint = { x: directorInteger(gps.point.x), y: directorInteger(gps.point.y) };
  const angle = rotationAngle(subtract(spritePoint, point));
  gps.velocity = findPoint({ x: 0, y: 0 }, angle, distance(gps.velocity));
}

function setUpHitTarget(state: GameState) {
  const gps = requiredGps(state);
  gps.state = "hitTarget";
  gps.frameCount = 30;
  gps.targetOpen = true;
  state.audioEvents.push({ name: "snd_enterShip" });
}

function hitTargetFrame(state: GameState) {
  const gps = requiredGps(state);
  gps.frameCount -= 1;
  if (gps.frameCount < 0) {
    gps.targetOpen = false;
    setUpScoring(state);
  }
}

function setUpScoring(state: GameState) {
  const gps = requiredGps(state);
  gps.state = "scoring";
  state.alert = "scoring";
  gps.scorePhase = 0;
  gps.scoreFinal = state.score + roundedLevelScore(gps.distance, state.level, gps.tries);
  setScorePhase(state, 1);
}

function setScorePhase(state: GameState, phase: number) {
  const gps = requiredGps(state);
  const distanceValue = directorInteger(gps.distance);
  const total = roundedLevelScore(gps.distance, state.level, gps.tries);
  const values = [distanceValue, state.level, gps.tries, total];
  const rates = [directorInteger(Math.sqrt(distanceValue)) * 5, 0.25, 0.25, directorInteger(Math.sqrt(total)) * 5];
  const holds = [15, 15, 15, 60];
  gps.scorePhase = phase;
  gps.scoreTarget = values[phase - 1];
  gps.scoreRate = rates[phase - 1];
  gps.scoreHold = holds[phase - 1];
  gps.frameCount = gps.scoreHold;
  gps.scoreCurrent = 0;
  state.audioEvents.push({ name: phase === 1 || phase === 4 ? "Arp" : "snd_enterShip", loop: true });
}

function scoringFrame(state: GameState) {
  const gps = requiredGps(state);
  if (gps.scoreCurrent === gps.scoreTarget) {
    gps.scoreHold -= 1;
    gps.frameCount = gps.scoreHold;
    if (gps.scoreHold < 1) {
      if (gps.scorePhase === 4) finishScoring(state);
      else setScorePhase(state, gps.scorePhase + 1);
    }
    return;
  }
  gps.scoreCurrent = Math.min(gps.scoreTarget, gps.scoreCurrent + gps.scoreRate);
  if (gps.scoreCurrent === gps.scoreTarget) state.audioEvents.push({ name: "all", stop: true });
  if (gps.scorePhase === 4) {
    const current = state.score + gps.scoreCurrent;
    state.highScore = Math.max(state.highScore, current);
  }
}

function finishScoring(state: GameState) {
  const gps = requiredGps(state);
  state.score = gps.scoreFinal;
  state.highScore = Math.max(state.highScore, state.score);
  state.alert = null;
  gps.state = "next_level";
  state.audioEvents.push({ name: "all", stop: true });
}

function resetGps(state: GameState) {
  const gps = requiredGps(state);
  gps.state = "iddle";
  gps.point = findPoint(gps.hoop, gps.hoopAngle, 30);
  gps.targetOpen = false;
  gps.kevinMember = gps.animationMin;
  for (const bonus of state.bonuses) {
    if (bonus.collected) bonus.memberNum -= 1;
    bonus.collected = false;
    bonus.rotationVelocity = 3;
  }
}

function updateOrbits(state: GameState, content: Content) {
  const gps = requiredGps(state);
  const orbiters: Array<{
    channel: number;
    point: Point;
    floatPoint: Point;
    orbit: OrbitState;
    commit(floatPoint: Point, point: Point): void;
  }> = [];
  for (const planet of state.planets) if (planet.orbit) orbiters.push({
    channel: planet.channel, point: planet.point, floatPoint: planet.floatPoint, orbit: planet.orbit,
    commit: (floatPoint, point) => { planet.floatPoint = floatPoint; planet.point = point; },
  });
  for (const bonus of state.bonuses) if (bonus.orbit) orbiters.push({
    channel: bonus.channel, point: bonus.point, floatPoint: bonus.floatPoint, orbit: bonus.orbit,
    commit: (floatPoint, point) => { bonus.floatPoint = floatPoint; bonus.point = point; },
  });
  if (gps.targetOrbit) orbiters.push({
    channel: gps.targetChannel, point: gps.targetPoint, floatPoint: gps.targetFloatPoint, orbit: gps.targetOrbit,
    commit: (floatPoint, point) => { gps.targetFloatPoint = floatPoint; gps.targetPoint = point; },
  });

  for (const orbiter of orbiters.sort((left, right) => left.channel - right.channel)) {
    const storedFloat = orbiter.floatPoint;
    const currentPoint = dynamicSpritePoint(state, orbiter.channel) ?? orbiter.point;
    for (const sunChannel of orbiter.orbit.suns) {
      const sun = orbitSun(state, content, sunChannel, orbiter.orbit.alternativeMass);
      if (!sun) continue;
      const change = subtract(currentPoint, sun.point);
      let squared = change.x * change.x + change.y * change.y;
      if (squared < sun.radius * sun.radius) squared = sun.radius * sun.radius;
      const force = sun.mass * GRAVITY / (squared * orbiter.orbit.gravityFactor);
      orbiter.orbit.velocity.x -= force * change.x;
      orbiter.orbit.velocity.y -= force * change.y;
    }
    const floatPoint = add(storedFloat, orbiter.orbit.velocity);
    const point = { x: directorInteger(floatPoint.x), y: directorInteger(floatPoint.y) };
    orbiter.commit(floatPoint, point);
  }
}

function dynamicSpritePoint(state: GameState, channel: number): Point | null {
  const gps = requiredGps(state);
  if (channel === gps.targetChannel) return gps.targetPoint;
  return state.planets.find((planet) => planet.channel === channel)?.point ??
    state.bonuses.find((bonus) => bonus.channel === channel)?.point ?? null;
}

function orbitSun(state: GameState, content: Content, channel: number, alternativeMass: number) {
  const planet = state.planets.find((candidate) => candidate.channel === channel);
  if (alternativeMass === 0) {
    return planet ? { point: planet.point, mass: planet.mass, radius: planet.collisionRadius } : null;
  }
  const gps = requiredGps(state);
  const bonus = state.bonuses.find((candidate) => candidate.channel === channel);
  const authored = content.frames.get(state.levelFrame)?.sprites.find((sprite) => sprite.channel === channel);
  const point = channel === gps.targetChannel ? gps.targetPoint : planet?.point ?? bonus?.point ??
    (authored ? { x: authored.locH, y: authored.locV } : null);
  const width = channel === gps.targetChannel ? gps.targetWidth : planet?.width ?? bonus?.width ?? authored?.width;
  return point && width !== undefined
    ? { point, mass: alternativeMass, radius: Math.trunc(width / 2) }
    : null;
}

function createPlanet(sprite: ScoreSprite): PlanetState {
  const behaviors = parseBehaviors(sprite.scriptList);
  const planet = behaviors.get(4) ?? {};
  const gravityExtra = numeric(planet.pGReach, 0);
  return {
    channel: sprite.channel,
    memberNum: sprite.memberNum,
    point: { x: sprite.locH, y: sprite.locV },
    floatPoint: { x: sprite.locH, y: sprite.locV },
    width: sprite.width,
    height: sprite.height,
    rotation: sprite.rotation,
    mass: numeric(planet.pMass, 100),
    collisionRadius: Math.trunc(sprite.width / 2) + 8,
    gravityReach: gravityExtra === 0 ? 5000 : Math.trunc(sprite.width / 2) + gravityExtra,
    orbit: createOrbit(sprite),
  };
}

function createBonus(sprite: ScoreSprite): BonusState {
  const properties = parseBehaviors(sprite.scriptList).get(13) ?? {};
  return {
    channel: sprite.channel,
    memberNum: sprite.memberNum,
    point: { x: sprite.locH, y: sprite.locV },
    floatPoint: { x: sprite.locH, y: sprite.locV },
    width: sprite.width,
    height: sprite.height,
    rotation: sprite.rotation,
    rotationVelocity: 3,
    value: numeric(properties.pValue, 100),
    collected: false,
    orbit: createOrbit(sprite),
  };
}

function createOrbit(sprite: ScoreSprite) {
  const orbit = parseBehaviors(sprite.scriptList).get(5);
  if (!orbit) return null;
  return {
    suns: [numeric(orbit.pSun, 5), numeric(orbit.pSun2, 0), numeric(orbit.pSun3, 0)].filter(Boolean),
    velocity: { x: numeric(orbit.pVX, 1), y: numeric(orbit.pVY, 1) },
    gravityFactor: numeric(orbit.pGravFactor, 1),
    alternativeMass: numeric(orbit.pAltMass, 0),
  };
}

const MENU_FRAMES: Partial<Record<Screen, number>> = {
  intro: 3,
  tips: 6,
  "end-stats": 50,
  "high-score-form": 55,
  "high-score-sending": 60,
};

function enterMenuScreen(state: GameState, screen: Screen, content: Content): GameState {
  state.screen = screen;
  state.alert = null;
  state.message = null;
  state.menuFrame = MENU_FRAMES[screen] ?? 0;
  state.menuOrbiters = createMenuOrbiters(state.menuFrame, content);
  state.pointer.down = false;
  return state;
}

function createMenuOrbiters(frameNumber: number, content: Content): MenuOrbiter[] {
  const frame = content.frames.get(frameNumber);
  if (!frame) return [];
  return frame.sprites.flatMap((sprite) => {
    const orbit = parseBehaviors(sprite.scriptList).get(5);
    if (!orbit || numeric(orbit.pAltMass, 0) === 0) return [];
    const center = frame.sprites.find((candidate) => candidate.channel === numeric(orbit.pSun, 0));
    if (!center) return [];
    return [{
      channel: sprite.channel,
      memberNum: sprite.memberNum,
      point: { x: sprite.locH, y: sprite.locV },
      floatPoint: { x: sprite.locH, y: sprite.locV },
      velocity: { x: numeric(orbit.pVX, 1), y: numeric(orbit.pVY, 1) },
      center: { x: center.locH, y: center.locV },
      centerRadius: center.width / 2,
      gravityFactor: numeric(orbit.pGravFactor, 1),
      mass: numeric(orbit.pAltMass, 0),
    }];
  });
}

function updateMenuOrbiters(state: GameState) {
  for (const orbiter of state.menuOrbiters) {
    const spritePoint = { x: directorInteger(orbiter.floatPoint.x), y: directorInteger(orbiter.floatPoint.y) };
    const change = subtract(spritePoint, orbiter.center);
    let squared = change.x * change.x + change.y * change.y;
    if (squared < orbiter.centerRadius * orbiter.centerRadius) squared = orbiter.centerRadius * orbiter.centerRadius;
    const force = orbiter.mass * GRAVITY / (squared * orbiter.gravityFactor);
    orbiter.velocity.x -= force * change.x;
    orbiter.velocity.y -= force * change.y;
    orbiter.floatPoint = add(orbiter.floatPoint, orbiter.velocity);
    orbiter.point = { x: directorInteger(orbiter.floatPoint.x), y: directorInteger(orbiter.floatPoint.y) };
  }
}

function intersectsPlanet(planets: PlanetState[], point: Point): PlanetState | null {
  return planets.find((planet) => distanceBetween(point, planet.point) < planet.collisionRadius) ?? null;
}

function intersectsPlanetIndex(planets: PlanetState[], point: Point): number {
  const index = planets.findIndex((planet) => distanceBetween(point, planet.point) < planet.collisionRadius);
  return index < 0 ? 0 : index + 1;
}

function intersectsTarget(point: Point, gps: GPSRuntime): boolean {
  const halfWidth = 8.5;
  const halfHeight = 13;
  const left = gps.targetPoint.x - gps.targetWidth / 2;
  const right = gps.targetPoint.x + gps.targetWidth / 2;
  const top = gps.targetPoint.y - gps.targetHeight / 2;
  const bottom = gps.targetPoint.y + gps.targetHeight / 2;
  return point.x + halfWidth >= left && point.x - halfWidth <= right &&
    point.y + halfHeight >= top && point.y - halfHeight <= bottom;
}

function requiredGps(state: GameState): GPSRuntime {
  if (!state.gps) throw new Error("El estado no contiene GPS.");
  return state.gps;
}

function numeric(value: number | string | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function traceColor(tries: number): string {
  return TRACE_COLORS[(tries % TRACE_COLORS.length + TRACE_COLORS.length) % TRACE_COLORS.length];
}

function within(x: number, y: number, left: number, top: number, right: number, bottom: number): boolean {
  return x >= left && x <= right && y >= top && y <= bottom;
}
