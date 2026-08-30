import { directorInteger } from "../director-compat/math";

export function roundedLevelScore(distance: number, level: number, tries: number): number {
  const rawScore = directorInteger(distance) * level / Math.max(1, tries);
  return Math.round(rawScore);
}
