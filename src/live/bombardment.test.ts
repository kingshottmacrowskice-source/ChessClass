import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
import { bombardmentArea } from "./bombardment";
function lock(g: Chess, r: DemonRules, target: string) {
  const a = r
    .specialActions(g)
    .find((a) => a.item === "londinium-artillery" && a.target === target)!;
  expect(a).toBeTruthy();
  r.commitSpecial(g, a);
  expect(g.fen()).toBe(a.after);
}
it("covers the center plus twelve neighbors, clipped at edges", () => {
  expect(bombardmentArea("d4")).toHaveLength(13);
  expect(bombardmentArea("a1")).toHaveLength(6);
  expect(bombardmentArea("d4")).toContain("f4");
  expect(bombardmentArea("d4")).not.toContain("f5");
});
it("follows its target and explodes after exactly three subsequent actions, with friendly fire", () => {
  const g = new Chess("7k/8/8/8/2PN1r2/8/P7/K7 b - - 0 1"),
    r = new DemonRules();
  lock(g, r, "d4");
  expect(r.bombardments[0].remaining).toBe(3);
  r.play(g, "d4f5");
  expect(r.bombardments[0]).toMatchObject({ target: "f5", remaining: 2 });
  r.play(g, "h8h7");
  expect(r.bombardments[0].remaining).toBe(1);
  expect(g.get("f5")).toBeTruthy();
  const m = r.play(g, "a2a3");
  expect(r.bombardments).toEqual([]);
  expect(g.get("f5")).toBeUndefined();
  expect(g.get("f4")).toBeUndefined();
  expect(g.get("c4")).toBeTruthy();
  expect(r.lost.w).toContain("n");
  expect(r.lost.b).toContain("r");
  expect(m.after).toBe(g.fen());
  expect(r.bombardmentEvents).toHaveLength(1);
});
it("retains the last square after capture instead of tracking the captor", () => {
  const g = new Chess("7k/8/8/8/3N1r2/8/P7/K7 b - - 0 1"),
    r = new DemonRules();
  r.bombardments.push({
    target: "d4",
    color: "w",
    remaining: 3,
    tracking: true,
  });
  r.play(g, "f4d4");
  expect(r.bombardments[0].tracking).toBe(false);
  r.play(g, "a2a3");
  r.play(g, "d4h4");
  expect(r.bombardmentEvents[0].target).toBe("d4");
  expect(g.get("h4")?.type).toBe("r");
});
it("counts special actions, supports multiple locks, and isolates simulations", () => {
  const g = new Chess("7k/8/8/8/3N4/8/P7/K7 b - - 0 1"),
    r = new DemonRules();
  lock(g, r, "d4");
  r.play(g, "a2a3");
  const fork = r.fork();
  fork.bombardments[0].remaining = 1;
  expect(r.bombardments[0].remaining).toBe(2);
  lock(g, r, "a3");
  expect(r.bombardments.map((s) => s.remaining)).toEqual([1, 3]);
  const before = JSON.stringify(r.bombardments);
  r.legalMoves(g);
  r.specialActions(g);
  expect(JSON.stringify(r.bombardments)).toBe(before);
  r.play(g, "a3a4");
  expect(r.bombardments).toHaveLength(1);
  expect(r.bombardments[0]).toMatchObject({ target: "a4", remaining: 2 });
  r.reset();
  expect(r.bombardments).toEqual([]);
});
it("follows a castling rook", () => {
  const g = new Chess("4k3/8/8/8/8/8/8/4K2R b K - 0 1"),
    r = new DemonRules();
  lock(g, r, "h1");
  r.play(g, "e1g1");
  expect(r.bombardments[0].target).toBe("f1");
});
it("clears skills and cannon identities and applies king outcomes", () => {
  const g = new Chess("7k/8/8/8/3r4/8/P7/K7 w - - 0 1"),
    r = new DemonRules();
  r.cannons.add("d4");
  r.listening.set("d4", { color: "b", cooldown: 5 });
  r.bombardments.push({
    target: "d4",
    color: "b",
    tracking: true,
    remaining: 1,
  });
  r.play(g, "a2a3");
  expect(r.listening.has("d4")).toBe(false);
  expect(r.cannons.has("d4")).toBe(false);
  expect(r.lost.b).toContain("c");
  const kingGame = new Chess("7k/8/8/8/8/8/P7/K7 w - - 0 1"),
    kingRules = new DemonRules();
  kingRules.bombardments.push({
    target: "a1",
    color: "w",
    tracking: true,
    remaining: 1,
  });
  kingRules.play(kingGame, "a2a3");
  expect(kingRules.winner).toBe("b");
  expect(kingRules.isGameOver(kingGame)).toBe(true);
  expect(() => new Chess(kingGame.fen())).not.toThrow();
});
it("simultaneous hits on both kings draw without corrupting FEN", () => {
  const g = new Chess("7k/8/8/8/8/8/P7/K7 w - - 0 1"),
    r = new DemonRules();
  r.bombardments.push(
    { target: "a1", color: "w", tracking: false, remaining: 1 },
    { target: "h8", color: "b", tracking: false, remaining: 1 },
  );
  r.play(g, "a2a3");
  expect(r.blastDraw).toBe(true);
  expect(r.winner).toBeUndefined();
  expect(r.isDraw(g)).toBe(true);
  expect(r.isCheckmate(g)).toBe(false);
});
