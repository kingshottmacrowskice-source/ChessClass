import { decideDemonTurn } from "./demonAI";
import { expect, it } from "vitest";
import { Chess, type Square } from "chess.js";
import { resolveMove } from "./core";
import { DemonRules } from "./rules";
import { footprint, unitSquares } from "./obelisk";
function giant(g: Chess, r: DemonRules, anchor: Square = "d5", shields = 2) {
  footprint(anchor).forEach((s) => g.put({ type: "r", color: "b" }, s));
  r.giants.set(anchor, { color: "b", shields, origin: "summon-item" });
}
it("summons with three distinct non-king tributes into four free home cells", () => {
  const g = new Chess();
  g.move("e4");
  const r = new DemonRules();
  const template = r
    .specialActions(g)
    .find((a) => a.item === "summon-obelisk")!;
  const action = r.prepareSpecial(g, template, () => 0);
  expect(action.sacrifices).toHaveLength(3);
  expect(new Set(action.sacrifices).size).toBe(3);
  expect(
    action.sacrifices!.every(
      (s) => g.get(s)?.color === "b" && g.get(s)?.type !== "k",
    ),
  ).toBe(true);
  const units = unitSquares(g, r.giants).length;
  r.commitSpecial(g, action);
  expect(unitSquares(g, r.giants)).toHaveLength(units - 2);
  expect(r.giants.get(action.target)).toEqual({
    color: "b",
    shields: 2,
    origin: "summon-item",
  });
  expect(
    footprint(action.target).every(
      (s) => Number(s[1]) >= 5 && g.get(s)?.color === "b",
    ),
  ).toBe(true);
  expect(g.fen()).toBe(action.after);
});
it("cannot summon with fewer than three tributes", () => {
  const g = new Chess("7k/pp6/8/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  expect(r.specialActions(g).some((a) => a.item === "summon-obelisk")).toBe(
    false,
  );
});
it("two shields block actual captures without moving the attacker; third hit breaks one unit", () => {
  const g = new Chess("7k/8/8/8/8/8/P7/K2R4 w - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  r.play(g, "d1d5");
  expect(r.giants.get("d5")!.shields).toBe(1);
  expect(g.get("d1")?.color).toBe("w");
  r.play(g, "h8h7");
  r.play(g, "d1d5");
  expect(r.giants.get("d5")!.shields).toBe(0);
  r.play(g, "h7h8");
  r.play(g, "d1d5");
  expect(r.giants.size).toBe(0);
  expect(r.lost.b).toEqual(["o"]);
  expect(g.get("d5")?.color).toBe("w");
  expect(["e5", "d6", "e6"].every((s) => !g.get(s as Square))).toBe(true);
});
it("threat maps do not consume shields, and direct destruction ignores them", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K2R4 w - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  expect(r.isAttacked(g, "d5", "w")).toBe(true);
  r.legalMoves(g);
  expect(r.giants.get("d5")!.shields).toBe(2);
  r.breakPiece(g, "e6", "直接击破");
  expect(r.giants.size).toBe(0);
  expect(r.lost.b).toEqual(["o"]);
});
it("one area blast hitting all four cells removes only one shield", () => {
  const g = new Chess("7k/8/8/8/8/8/P7/K7 w - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  r.bombardments.push({
    target: "d5",
    color: "b",
    tracking: true,
    remaining: 1,
  });
  r.play(g, "a2a3");
  expect(r.giants.get("d5")!.shields).toBe(1);
  expect(r.combatEvents.filter((e) => e.kind === "attack")).toHaveLength(1);
});
it("moves the whole footprint one square, respecting occupied cells, craters and edges", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  r.craters.add("f5");
  const moves = r.legalMoves(g).filter((m) => m.from === "d5");
  expect(moves.some((m) => m.to === "e5")).toBe(false);
  expect(moves.some((m) => m.to === "d4")).toBe(true);
  expect(moves.some((m) => m.to === "d3")).toBe(false);
  r.play(g, "d5d4");
  expect(r.giants.has("d4")).toBe(true);
  expect(g.get("d6")).toBeUndefined();
  expect(g.get("e6")).toBeUndefined();
});
it("a four-cell unit counts as a single cannon screen", () => {
  const g = new Chess("3r3k/8/8/8/8/8/8/K2R4 w - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  r.cannons.add("d1");
  expect(r.legalMoves(g).some((m) => m.lan === "d1d8")).toBe(true);
});
it("active skill sacrifices two other units and attacks only the front row and next row", () => {
  const g = new Chess("7k/1pn5/8/P7/6P1/7P/8/K7 b - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  const template = r.specialActions(g).find((a) => a.skill === "obelisk-fury")!;
  const action = r.prepareSpecial(g, template, () => 0);
  expect(action.sacrifices!.includes("d5")).toBe(false);
  r.commitSpecial(g, action);
  expect(g.get("a5")).toBeUndefined();
  expect(g.get("g4")).toBeUndefined();
  expect(g.get("h3")?.type).toBe("p");
  expect(r.giants.has("d5")).toBe(true);
  expect(r.lost.b).toHaveLength(2);
  expect(r.lost.w).toHaveLength(2);
});
it("listening can break a giant skill's source and prevent damage", () => {
  const g = new Chess("7k/1pn5/8/P7/6P1/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  r.listening.set("a5", { color: "w", cooldown: 0 });
  const template = r.specialActions(g).find((a) => a.skill === "obelisk-fury")!;
  r.commitSpecial(
    g,
    r.prepareSpecial(g, template, () => 0),
  );
  expect(r.giants.size).toBe(0);
  expect(g.get("a5")?.color).toBe("w");
  expect(r.listening.get("a5")!.cooldown).toBe(10);
});
it("revived giants expire by direct destruction at the end of that action", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  r.lost.b.push("o");
  const action = r
    .specialActions(g)
    .find((a) => a.item === "monster-reborn" && a.giant)!;
  expect(action).toBeTruthy();
  r.commitSpecial(g, action);
  expect(r.giants.size).toBe(0);
  expect(r.lost.b).toEqual(["o"]);
  expect(r.combatEvents.some((e) => e.reason.includes("回合结束"))).toBe(true);
});
it("forks preserve shields and provenance without mutating the live unit", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  const branch = r.fork(),
    copy = new Chess(g.fen());
  branch.attack(copy, "e6", undefined, "测试");
  expect(branch.giants.get("d5")!.shields).toBe(1);
  expect(r.giants.get("d5")!.shields).toBe(2);
  r.reset();
  expect(r.giants.size).toBe(0);
});

it("cannot use a giant's own rear cell as a cannon screen", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K2R4 w - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  r.cannons.add("d1");
  expect(
    r.legalMoves(g).some((m) => m.from === "d1" && ["d5", "d6"].includes(m.to)),
  ).toBe(false);
});

it("preserves SAN voting before and after custom pieces appear", () => {
  const g = new Chess(),
    r = new DemonRules();
  expect(resolveMove(g, "e4", r.legalMoves(g))).toBe("e2e4");
  r.play(g, "e2e4");
  expect(resolveMove(g, "Nf6", r.legalMoves(g))).toBe("g8f6");
});

it("rejects forged sacrifice lists without changing board or shields", () => {
  const g = new Chess();
  g.move("e4");
  const r = new DemonRules(),
    before = g.fen();
  const template = r
      .specialActions(g)
      .find((a) => a.item === "summon-obelisk")!,
    action = r.prepareSpecial(g, template, () => 0);
  expect(() =>
    r.commitSpecial(g, {
      ...action,
      sacrifices: [
        action.sacrifices![0],
        action.sacrifices![0],
        action.sacrifices![0],
      ],
    }),
  ).toThrow();
  expect(() =>
    r.commitSpecial(g, {
      ...action,
      sacrifices: ["e8", ...action.sacrifices!.slice(0, 2)],
    }),
  ).toThrow();
  expect(() => r.commitSpecial(g, { ...action, target: "h8" })).toThrow();
  expect(g.fen()).toBe(before);
  expect(r.giants.size).toBe(0);
  expect(r.lost.b).toEqual([]);
});
it("AI samples an active skill's costs without mutating the live position", async () => {
  const g = new Chess("7k/1pn5/8/P7/6P1/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  const before = g.fen();
  const result = await decideDemonTurn(g, r, {
    chance: 100,
    difficulty: 100,
    behaviorWeights: { destroy: 0, movement: 0, item: 0, skill: 1 },
    random: () => 0,
  });
  expect(result.action?.skill).toBe("obelisk-fury");
  expect(result.action?.sacrifices).toHaveLength(2);
  expect(g.fen()).toBe(before);
  expect(r.lost.b).toEqual([]);
  expect(r.giants.get("d5")!.shields).toBe(2);
  r.commitSpecial(g, result.action!);
  expect(g.get("a5")).toBeUndefined();
});
it("shield hits are not reported as captures", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K2R4 w - - 0 1"),
    r = new DemonRules();
  giant(g, r);
  const move = r.play(g, "d1d5");
  expect(move.captured).toBeUndefined();
  expect(move.isCapture()).toBe(false);
  expect(r.combatEvents.map((e) => e.kind)).toEqual(["attack", "shield"]);
});
it("one giant produces one artillery target, not four", () => {
  const g = new Chess("7k/8/8/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  footprint("d3").forEach((s) => g.put({ type: "r", color: "w" }, s));
  r.giants.set("d3", { color: "w", shields: 2, origin: "summon-item" });
  const choices = r
    .specialActions(g)
    .filter((a) => a.item === "londinium-artillery");
  expect(choices.map((a) => a.target).sort()).toEqual(["a1", "d3"]);
});
