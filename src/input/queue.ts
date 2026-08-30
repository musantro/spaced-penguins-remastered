import type { GameInput } from "../core/types";

/**
 * Browser pointer streams can arrive much faster than Director's 30 fps.
 * Director observes the latest mouse position at a frame boundary, so keeping
 * every intermediate DOM event is both slower and less faithful.
 */
export function enqueueInput(queue: GameInput[], input: GameInput): void {
  if (input.kind === "pointerMove" && queue.at(-1)?.kind === "pointerMove") {
    queue[queue.length - 1] = input;
    return;
  }
  queue.push(input);
}

export function takeInput(queue: GameInput[]): GameInput {
  return queue.shift() ?? { kind: "none" };
}
