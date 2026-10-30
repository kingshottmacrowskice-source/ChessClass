import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
it("stone targets eligible untrained pieces, excluding cannons", () => {
  const g = new Chess();
  g.move("e4");
  const r = new DemonRules();
  r.cannons.add("a8");
  const choices = r
    .specialActions(g)
    .filter((a) => a.item === "tingqiao-stone");
  expect(choices.map((a) => a.target).sort()).toEqual([
    "c8",
    "d8",
    "e8",
    "f8",
    "h8",
  ]);
  r.commitSpecial(
    g,
    choices.find((a) => a.target === "d8")!,
  );
  expect(r.listening.get("d8")).toEqual({ color: "b", cooldown: 0 });
  const fork = r.fork();
  fork.listening.get("d8")!.cooldown = 8;
  expect(r.listening.get("d8")!.cooldown).toBe(0);
  r.reset();
  expect(r.listening.size).toBe(0);
});
it("threatening a trained piece does not activate listening", () => {
  const g = new Chess("7k/8/3q4/8/8/8/8/K1R5 w - - 0 1"),
    r = new DemonRules();
  r.listening.set("d6", { color: "b", cooldown: 0 });
  r.play(g, "c1d1");
  expect(g.get("d1")?.type).toBe("r");
  expect(r.passiveEvents).toEqual([]);
  expect(r.listening.get("d6")!.cooldown).toBe(0);
});
it("actual capture is counter-broken, but captures during cooldown succeed", () => {
  for (const cooldown of [0, 5]) {
    const g = new Chess("7k/8/3q4/8/8/8/8/K2R4 w - - 0 1"),
      r = new DemonRules();
    r.listening.set("d6", { color: "b", cooldown });
    r.play(g, "d1d6");
    if (!cooldown) {
      expect(g.get("d6")?.color).toBe("b");
      expect(r.lost.w).toEqual(["r"]);
      expect(r.listening.get("d6")!.cooldown).toBe(10);
    } else {
      expect(g.get("d6")?.color).toBe("w");
      expect(r.listening.has("d6")).toBe(false);
    }
  }
});
it("source-less bombardment cannot be counter-broken and does damage", () => {
  const g = new Chess("7k/8/3q4/8/8/8/P7/K7 w - - 0 1"),
    r = new DemonRules();
  r.listening.set("d6", { color: "b", cooldown: 0 });
  r.bombardments.push({
    target: "d6",
    color: "b",
    remaining: 1,
    tracking: true,
  });
  r.play(g, "a2a3");
  expect(g.get("d6")).toBeUndefined();
  expect(r.passiveEvents).toEqual([]);
});
it("direct destruction bypasses listening", () => {
  const g = new Chess("7k/8/3q4/8/8/8/8/K7 w - - 0 1"),
    r = new DemonRules();
  r.listening.set("d6", { color: "b", cooldown: 0 });
  r.breakPiece(g, "d6", "test");
  expect(g.get("d6")).toBeUndefined();
  expect(r.passiveEvents).toEqual([]);
});
it("cooldown counts ten actions, follows the piece and simulations are isolated", () => {
  const g = new Chess("7k/8/3q4/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  r.listening.set("d6", { color: "b", cooldown: 10 });
  r.legalMoves(g);
  expect(r.listening.get("d6")!.cooldown).toBe(10);
  r.play(g, "d6e6");
  expect(r.listening.get("e6")!.cooldown).toBe(9);
  r.play(g, "a1b1");
  r.play(g, "e6d6");
  r.play(g, "b1a1");
  for (const uci of ["h8h7", "a1b1", "h7h8", "b1a1", "h8h7", "a1b1"])
    r.play(g, uci);
  expect(r.listening.get("d6")!.cooldown).toBe(0);
});
it("king learning a passive cannot ignore a mere check threat", () => {
  const g = new Chess("3k4/8/8/8/8/8/8/K2R4 b - - 0 1"),
    r = new DemonRules();
  expect(r.specialActions(g).some((a) => a.item === "tingqiao-stone")).toBe(
    false,
  );
});
