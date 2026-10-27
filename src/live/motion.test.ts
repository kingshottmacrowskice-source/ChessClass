import { describe, it, expect } from "vitest";
import { advance, WALK_SPEED, roamTarget } from "./motion";
describe("grounded actor movement", () => {
  it("wanders to continuous nearby coordinates while avoiding occupied landing points", () => {
    const from = { x: 50, y: 50 };
    const to = roamTarget(from, [], () => 0.83);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThan(22);
    expect((to.x - 6.25) % 12.5).not.toBe(0);
    expect((to.y - 6.25) % 12.5).not.toBe(0);
    expect(roamTarget(from, [to], () => 0.83)).toBe(from);
  });
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
