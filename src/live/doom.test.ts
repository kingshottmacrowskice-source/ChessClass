import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
describe("doom shroom", () => {
  it("destroys nearby enemies, preserves allies and creates a persistent pit", () => {
    const game = new Chess("7k/8/2p5/1R1B4/2Q5/8/8/K7 b - - 0 1");
    const rules = new DemonRules();
    const action = rules
      .specialActions(game)
      .find((a) => a.item === "doom-shroom" && a.target === "c5")!;
    expect(action).toBeTruthy();
    rules.commitSpecial(game, action);
    expect(game.get("b5")).toBeUndefined();
    expect(game.get("d5")).toBeUndefined();
    expect(game.get("c4")).toBeUndefined();
    expect(game.get("c6")?.color).toBe("b");
    expect(rules.craters.has("c5")).toBe(true);
    const branch = rules.fork();
    branch.craters.add("a2");
    expect(rules.craters.has("a2")).toBe(false);
  });
  it("filters moves onto pits and validates stale actions", () => {
    const game = new Chess();
    const rules = new DemonRules();
    rules.craters.add("e4");
    expect(rules.legalMoves(game).some((m) => m.to === "e4")).toBe(false);
    expect(() => rules.play(game, "e2e4")).toThrow();
  });
});

it("listening breaks the mushroom source and interrupts remaining attacks without a pit", () => {
  const game = new Chess("7k/8/2B5/1R1N4/8/8/8/K7 b - - 0 1"),
    rules = new DemonRules();
  rules.listening.set("c6", { color: "w", cooldown: 0 });
  const action = rules
    .specialActions(game)
    .find((a) => a.item === "doom-shroom" && a.target === "c5")!;
  expect(action).toBeTruthy();
  rules.commitSpecial(game, action);
  expect(game.get("c6")?.type).toBe("b");
  expect(game.get("b5")?.type).toBe("r");
  expect(game.get("d5")?.type).toBe("n");
  expect(game.get("c5")).toBeUndefined();
  expect(rules.craters.has("c5")).toBe(false);
  expect(rules.listening.get("c6")!.cooldown).toBe(10);
  expect(rules.combatEvents.map((e) => e.kind)).toEqual([
    "attack",
    "attack",
    "attack",
    "break",
  ]);
  expect(rules.passiveEvents[0].attacker).toBe("c5");
  expect(rules.lost.b).toEqual([]);
  expect(rules.temporaryPieces.size).toBe(0);
  expect(game.fen()).toBe(action.after);
});
it("a later target counters before any earlier target takes damage", () => {
  const game = new Chess("7k/8/2B5/1R6/8/8/8/K7 b - - 0 1"),
    rules = new DemonRules();
  rules.listening.set("b5", { color: "w", cooldown: 0 });
  const action = rules
    .specialActions(game)
    .find((a) => a.item === "doom-shroom" && a.target === "c5")!;
  rules.commitSpecial(game, action);
  expect(game.get("c6")?.type).toBe("b");
  expect(game.get("b5")?.type).toBe("r");
  expect(rules.craters.has("c5")).toBe(false);
  expect(rules.lost.w).toEqual([]);
});
it("an uninterrupted mushroom attacks shields once, cleans up and leaves a pit", () => {
  const game = new Chess("7k/8/8/8/8/8/8/K7 b - - 0 1"),
    rules = new DemonRules();
  for (const square of ["c4", "d4", "c5", "d5"] as const)
    game.put({ type: "r", color: "w" }, square);
  rules.giants.set("c4", { color: "w", shields: 2, origin: "summon-item" });
  const action = rules
    .specialActions(game)
    .find((a) => a.item === "doom-shroom" && a.target === "c6")!;
  const before = JSON.stringify([...rules.giants]);
  expect(rules.temporaryPieces.size).toBe(0);
  expect(JSON.stringify([...rules.giants])).toBe(before);
  rules.commitSpecial(game, action);
  expect(rules.giants.get("c4")!.shields).toBe(1);
  expect(rules.combatEvents.filter((e) => e.kind === "attack")).toHaveLength(1);
  expect(rules.craters.has("c6")).toBe(true);
  expect(game.get("c6")).toBeUndefined();
  expect(rules.lost.b).toEqual([]);
});
it("a cooling-down listener is attacked normally and rank-eight deployment leaves no placeholder", () => {
  const game = new Chess("7k/2B5/8/8/8/8/8/K7 b - - 0 1"),
    rules = new DemonRules();
  rules.listening.set("c7", { color: "w", cooldown: 5 });
  const action = rules
    .specialActions(game)
    .find((a) => a.item === "doom-shroom" && a.target === "c8")!;
  rules.commitSpecial(game, action);
  expect(game.get("c7")).toBeUndefined();
  expect(game.get("c8")).toBeUndefined();
  expect(rules.craters.has("c8")).toBe(true);
  expect(rules.lost.b).toEqual([]);
});
