import { describe, it, expect } from "vitest";
import { script, shotMs } from "./cinema";
import { dollyFor, HOME } from "./camera";

describe("board-camera finishers", () => {
  it("promotion rises, holds its breath, then swaps before the camera settles", () => {
    const cues = script("promotion").map((s) => s.cue);
    const order = ["approach", "crane", "rise", "inhale", "swap", "settle"].map(
      (c) => cues.indexOf(c as never),
    );
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(script("promotion").find((s) => s.cue === "swap")!.phase).toBe(
      "reveal",
    );
  });
  it("checkmate stalks, confronts, dreads, then cuts the king down", () => {
    const steps = script("checkmate");
    const order = [
      "stalk",
      "face",
      "dread",
      "slash",
      "aftermath",
      "settle",
    ].map((c) => steps.findIndex((s) => s.cue === c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(steps.find((s) => s.cue === "dread")!.phase).toBe("strobe");
    expect(steps.find((s) => s.cue === "slash")!.phase).toBe("kill");
  });
  it("both shots stay short enough for a live stream", () => {
    for (const k of ["promotion", "checkmate"] as const) {
      expect(shotMs(k)).toBeGreaterThan(3000);
      expect(shotMs(k)).toBeLessThan(6000);
    }
  });
  it("a dolly zoom keeps the subject the same size through any lens", () => {
    const start = { ...HOME, distance: 5, fov: 20 };
    const wide = dollyFor(start, 52);
    expect(wide).toBeLessThan(start.distance);
    const size = (d: number, fov: number) =>
      d * Math.tan((fov * Math.PI) / 360);
    expect(size(wide, 52)).toBeCloseTo(size(start.distance, start.fov), 6);
  });
});
