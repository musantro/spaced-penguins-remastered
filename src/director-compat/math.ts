import type { Point } from "../content/types";

export const DEGREES_PER_RADIAN = 57.29577951308232;

export function add(left: Point, right: Point): Point {
  return { x: left.x + right.x, y: left.y + right.y };
}

export function subtract(left: Point, right: Point): Point {
  return { x: left.x - right.x, y: left.y - right.y };
}

export function multiply(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

export function distance(point: Point): number {
  return Math.sqrt(point.x * point.x + point.y * point.y);
}

export function distanceBetween(left: Point, right: Point): number {
  return distance(subtract(left, right));
}

export function rotationAngle(vector: Point): number {
  if (vector.x === 0) return vector.y > 0 ? 90 : -90;
  return Math.atan(vector.y / vector.x) * DEGREES_PER_RADIAN + (vector.x < 0 ? 180 : 0);
}

export function findPoint(reference: Point, angle: number, length: number): Point {
  const radians = angle / DEGREES_PER_RADIAN;
  return { x: reference.x + Math.cos(radians) * length, y: reference.y + Math.sin(radians) * length };
}

export function directorInteger(value: number): number {
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5);
}

export function inside(point: Point, rect: { left: number; top: number; right: number; bottom: number }): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}
