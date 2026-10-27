import { describe, it, expect } from "vitest";
import { advance, WALK_SPEED } from "./motion";
describe("grounded actor movement", () => {
  it("covers the same distance per second for horizontal and diagonal paths", () => {
    const a = advance({ x: 0, y: 0 }, { x: 90, y: 0 }, 0.5),
      b = advance({ x: 0, y: 0 }, { x: 90, y: 90 }, 0.5);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(WALK_SPEED * 0.5);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(WALK_SPEED * 0.5);
  });
  it("stops exactly at target without overshoot", () => {
    const to = { x: 2, y: 3 };
    expect(advance({ x: 0, y: 0 }, to, 1)).toBe(to);
    expect(advance(to, to, 1)).toBe(to);
  });
});
