import { it, expect } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
it("white console summons a white cannon and consumes its turn", () => {
  const g = new Chess(),
    r = new DemonRules();
  const a = r
    .specialActions(g, true)
    .find((a) => a.item === "summon-cannon" && a.target === "e3")!;
  expect(a).toBeDefined();
  r.commitSpecial(g, a);
  expect(g.get("e3")).toMatchObject({ color: "w", type: "r" });
  expect(r.cannons.has("e3")).toBe(true);
  expect(g.turn()).toBe("b");
  expect(() => r.commitSpecial(g, a)).toThrow();
});
it("white learns listening and resurrects only its own lost pieces", () => {
  const g = new Chess(),
    r = new DemonRules();
  r.lost.w.push("n");
  r.lost.b.push("q");
  const actions = r.specialActions(g, true);
  expect(
    actions
      .filter((a) => a.item === "monster-reborn")
      .every((a) => a.piece === "n"),
  ).toBe(true);
  expect(
    actions.some((a) => a.item === "tingqiao-stone" && a.target === "c1"),
  ).toBe(true);
  const a = actions.find(
    (a) => a.item === "tingqiao-stone" && a.target === "e1",
  )!;
  r.commitSpecial(g, a);
  expect(r.listening.get("e1")).toEqual({ color: "w", cooldown: 0 });
});
it("white giant summons in its own half with white sacrifices", () => {
  const g = new Chess(),
    r = new DemonRules();
  const t = r.specialActions(g, true).find((a) => a.item === "summon-obelisk")!;
  const a = r.prepareSpecial(g, t, () => 0);
  expect(a.sacrifices?.every((s) => g.get(s)?.color === "w")).toBe(true);
  r.commitSpecial(g, a);
  expect(r.giants.get(a.target)?.color).toBe("w");
  expect(Number(a.target[1])).toBeLessThanOrEqual(3);
});
it("white artillery locks the enemy and white doom attacks black", () => {
  const g = new Chess("7k/8/8/8/3p4/8/8/K7 w - - 0 1"),
    r = new DemonRules();
  const actions = r.specialActions(g, true);
  const artillery = actions.find(
    (a) => a.item === "londinium-artillery" && a.target === "d4",
  )!;
  const clone = r.fork(),
    copy = new Chess(g.fen());
  clone.commitSpecial(copy, artillery);
  expect(clone.bombardments[0]).toMatchObject({
    color: "b",
    target: "d4",
    remaining: 3,
  });
  const doom = actions.find(
    (a) => a.item === "doom-shroom" && a.target === "d3",
  )!;
  r.commitSpecial(g, doom);
  expect(g.get("d4")).toBeUndefined();
  expect(r.craters.has("d3")).toBe(true);
});
