import { describe, expect, it } from "vitest";

import type { GameInput } from "../core/types";
import { enqueueInput, takeInput } from "./queue";

describe("frame-quantized browser input", () => {
  it("coalesces a dense drag while preserving down/move/up order", () => {
    const queue: GameInput[] = [];
    enqueueInput(queue, { kind: "pointerDown", point: { x: 413, y: 303 } });
    for (let index = 0; index < 360; index += 1) {
      enqueueInput(queue, { kind: "pointerMove", point: { x: 413 + index, y: 303 + index } });
    }
    enqueueInput(queue, { kind: "pointerUp", point: { x: 469, y: 355 } });

    expect(queue).toHaveLength(3);
    expect(takeInput(queue).kind).toBe("pointerDown");
    expect(takeInput(queue)).toEqual({ kind: "pointerMove", point: { x: 772, y: 662 } });
    expect(takeInput(queue).kind).toBe("pointerUp");
    expect(takeInput(queue).kind).toBe("none");
  });
});
