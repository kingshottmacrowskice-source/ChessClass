import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
import { variantMoves } from "./cannonRules";
import { decideDemonTurn } from "./demonAI";
describe("summon cannon", () => {
  it("summons only into a free home square, preserves castling rights, and forks identity", () => {
    const game = new Chess();
    game.move("e4");
    const r = new DemonRules();
    r.craters.add("d5");
    const actions = r
      .specialActions(game)
      .filter((a) => a.item === "summon-cannon");
    expect(actions.length).toBeGreaterThan(0);
    expect(
      actions.every(
        (a) =>
          Number(a.target[1]) >= 5 && !game.get(a.target) && a.target !== "d5",
      ),
    ).toBe(true);
    r.commitSpecial(game, actions[0]);
    expect(r.cannons.has(actions[0].target)).toBe(true);
    expect(game.turn()).toBe("w");
    const fork = r.fork();
    fork.cannons.clear();
    expect(r.cannons.size).toBe(1);
    r.reset();
    expect(r.cannons.size).toBe(0);
  });
  it("moves on clear ranks/files and captures across exactly one screen", () => {
    const g = new Chess("7k/8/3r4/8/3p4/8/3R4/K7 b - - 0 1");
    const r = new DemonRules();
    r.cannons.add("d6");
    const destinations = r
      .legalMoves(g)
      .filter((m) => m.from === "d6")
      .map((m) => m.to);
    expect(destinations).toContain("d5");
    expect(destinations).toContain("d2");
    expect(destinations).not.toContain("d3");
    expect(destinations).not.toContain("d4");
    expect(destinations).not.toContain("e5");
    r.play(g, "d6d2");
    expect(r.cannons.has("d2")).toBe(true);
    expect(r.cannons.has("d6")).toBe(false);
    expect(r.lost.w).toEqual(["r"]);
  });
  it("cannot capture without a screen or with two screens", () => {
    for (const fen of [
      "7k/8/3r4/8/8/8/3R4/K7 b - - 0 1",
      "7k/8/3r4/8/3p4/3p4/3R4/K7 b - - 0 1",
    ]) {
      const g = new Chess(fen),
        r = new DemonRules();
      r.cannons.add("d6");
      expect(
        r.legalMoves(g).some((m) => m.from === "d6" && m.to === "d2"),
      ).toBe(false);
    }
  });
  it("checks over a screen but allows a king on an unscreened file", () => {
    const r = new DemonRules();
    r.cannons.add("d6");
    const checked = new Chess("7k/8/3r4/8/3p4/8/3K4/8 w - - 0 1");
    expect(r.isCheck(checked)).toBe(true);
    expect(
      r.legalMoves(checked).some((m) => m.from === "d2" && m.to === "d1"),
    ).toBe(false);
    const clear = new Chess("7k/8/3r4/8/8/8/3K4/8 w - - 0 1");
    expect(r.isCheck(clear)).toBe(false);
    expect(r.legalMoves(clear).some((m) => m.to === "d3")).toBe(true);
  });
  it("captures and resurrects a cannon as a cannon, never a rook", () => {
    const g = new Chess("7k/8/3r4/8/8/8/8/K2R4 w - - 0 1"),
      r = new DemonRules();
    r.cannons.add("d6");
    r.play(g, "d1d6");
    expect(r.cannons.size).toBe(0);
    expect(r.lost.b).toEqual(["c"]);
    const revive = r
      .specialActions(g)
      .find((a) => a.item === "monster-reborn")!;
    expect(revive.cannon).toBe(true);
    r.commitSpecial(g, revive);
    expect(r.cannons.has(revive.target)).toBe(true);
    expect(r.lost.b).toEqual([]);
  });
  it("AI can play a cannon without mutating the live state", async () => {
    const g = new Chess("7k/8/3r4/8/3p4/8/3R4/K7 b - - 0 1"),
      r = new DemonRules();
    r.cannons.add("d6");
    const before = g.fen();
    const decision = await decideDemonTurn(g, r, {
      chance: 0,
      difficulty: 100,
      random: () => 0,
    });
    expect(
      r.legalMoves(g).some((m) => m.lan === decision.analysis.bestmove),
    ).toBe(true);
    expect(g.fen()).toBe(before);
    expect([...r.cannons]).toEqual(["d6"]);
    expect(r.lost.w).toEqual([]);
  });
});

it("preserves ordinary move geometry, castling, en passant and promotion", () => {
  for (const fen of [
    new Chess().fen(),
    "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    "7k/8/8/3pP3/8/8/8/K7 w - d6 0 1",
    "7k/P7/8/8/8/8/8/K7 w - - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/2pP4/1p2P3/2N2N2/PPQBBPPP/R3K2R w KQkq - 0 1",
  ]) {
    const g = new Chess(fen);
    expect(
      variantMoves(g, new Set(), new Set())
        .map((m) => m.lan)
        .sort(),
    ).toEqual(
      g
        .moves({ verbose: true })
        .map((m) => m.lan)
        .sort(),
    );
  }
});
it("retains repetition detection with cannon moves", () => {
  const g = new Chess("7k/8/3r4/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  r.cannons.add("d6");
  for (let i = 0; i < 2; i++)
    for (const uci of ["d6e6", "a1b1", "e6d6", "b1a1"]) r.play(g, uci);
  expect(r.isDraw(g)).toBe(true);
});
