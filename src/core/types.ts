import type { Point } from "../content/types";

export type Screen = "intro" | "tips" | "level" | "end-stats" | "high-score-form" | "high-score-sending";
export type GPSState = "iddle" | "pullback" | "snapping" | "soaring" | "crashed" | "hitTarget" | "scoring" | "next_level";

export interface OrbitState {
  suns: number[];
  velocity: Point;
  gravityFactor: number;
  alternativeMass: number;
}

export interface PlanetState {
  channel: number;
  memberNum: number;
  point: Point;
  floatPoint: Point;
  width: number;
  height: number;
  rotation: number;
  mass: number;
  collisionRadius: number;
  gravityReach: number;
  orbit: OrbitState | null;
}

export interface BonusState {
  channel: number;
  memberNum: number;
  point: Point;
  floatPoint: Point;
  width: number;
  height: number;
  rotation: number;
  rotationVelocity: number;
  value: number;
  collected: boolean;
  orbit: OrbitState | null;
}

export interface GPSRuntime {
  channel: number;
  targetChannel: number;
  targetPoint: Point;
  targetFloatPoint: Point;
  targetWidth: number;
  targetHeight: number;
  targetOrbit: OrbitState | null;
  border: number;
  lastLevel: boolean;
  stretchLimit: number;
  state: GPSState;
  point: Point;
  velocity: Point;
  frameCount: number;
  tries: number;
  distance: number;
  hoop: Point;
  hoopAngle: number;
  kevinMember: number;
  animationMin: number;
  animationMax: number;
  animationDirection: number;
  animationSwap: boolean;
  targetOpen: boolean;
  scorePhase: number;
  scoreCurrent: number;
  scoreTarget: number;
  scoreRate: number;
  scoreHold: number;
  scoreFinal: number;
  orbitNotificationEnabled: boolean;
  orbitNotified: boolean;
}

export interface TrailSegment { from: Point; to: Point; color: string }
export interface AudioEvent { name: string; loop?: boolean; stop?: boolean }

export interface MenuOrbiter {
  channel: number;
  memberNum: number;
  point: Point;
  floatPoint: Point;
  velocity: Point;
  center: Point;
  centerRadius: number;
  gravityFactor: number;
  mass: number;
}

export interface GameState {
  screen: Screen;
  frame: number;
  level: number;
  score: number;
  highScore: number;
  alert: null | "reallyquit" | "scoring" | "message";
  message: string | null;
  levelFrame: number;
  gps: GPSRuntime | null;
  planets: PlanetState[];
  bonuses: BonusState[];
  trail: TrailSegment[];
  pointer: { down: boolean; point: Point };
  sendingFrames: number;
  nickname: string;
  menuFrame: number;
  menuOrbiters: MenuOrbiter[];
  audioEvents: AudioEvent[];
}

export type GameInput =
  | { kind: "none" }
  | { kind: "pointerDown"; point: Point; hitRadius?: number }
  | { kind: "pointerMove" | "pointerUp" | "pointerCancel"; point: Point }
  | { kind: "key"; key: string }
  | { kind: "submitScore"; nickname?: string }
  | { kind: "cancelScore" };
