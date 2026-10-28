import { describe, it, expect } from "vitest";
import {
  CINEMA_CHANCE,
  cinemaRoll,
  closeUpZoom,
  faceOff,
  script,
  shotMs,
} from "./cinema";

describe("board-camera finishers", () => {
  it("replaces the video half of the time", () => {
    expect(CINEMA_CHANCE).toBe(0.5);
    expect(cinemaRoll(() => 0.49)).toBe(true);
    expect(cinemaRoll(() => 0.5)).toBe(false);
  });
  it("promotion swaps the piece before the camera settles", () => {
    const cues = script("promotion").map((s) => s.cue);
    expect(cues.indexOf("zoom")).toBeLessThan(cues.indexOf("float"));
    expect(cues.indexOf("float")).toBeLessThan(cues.indexOf("swap"));
    expect(cues.at(-1)).toBe("settle");
  });
  it("checkmate confronts, strobes, then cuts the king down", () => {
    const steps = script("checkmate");
    const order = ["face", "clash", "strobe", "slash", "shatter", "settle"].map(
      (c) => steps.findIndex((s) => s.cue === c),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(steps.find((s) => s.cue === "strobe")!.phase).toBe("strobe");
    expect(steps.find((s) => s.cue === "slash")!.phase).toBe("kill");
  });
  it("both shots stay short enough for a live stream", () => {
    for (const k of ["promotion", "checkmate"] as const) {
      expect(shotMs(k)).toBeGreaterThan(3000);
      expect(shotMs(k)).toBeLessThan(6000);
    }
  });
  it("zooms in on a lone piece without overshooting", () => {
    const view = { w: 1280, h: 800 };
    expect(closeUpZoom(70, view)).toBeGreaterThan(2);
    expect(closeUpZoom(70, view)).toBeLessThanOrEqual(4.2);
    expect(closeUpZoom(400, view)).toBe(1.8);
  });
  it("frames a face-off between both pieces, levelled but never rolled past 14°", () => {
    const view = { w: 1280, h: 800 };
    const flat = faceOff({ x: 100, y: 300 }, { x: 400, y: 300 }, 70, view);
    expect(flat).toMatchObject({ x: 250, y: 300 });
    expect(Math.abs(flat.rot)).toBe(0);
    const steep = faceOff({ x: 100, y: 100 }, { x: 160, y: 400 }, 70, view);
    expect(Math.abs(steep.rot)).toBe(14);
    const near = faceOff({ x: 100, y: 300 }, { x: 170, y: 300 }, 70, view);
    expect(near.scale).toBeGreaterThan(flat.scale);
    // Fits both pieces with room to spare.
    expect(300 * flat.scale).toBeLessThan(view.w * 0.6);
  });
});
