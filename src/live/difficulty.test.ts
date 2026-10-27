import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { chooseEnemyMove } from "./difficulty";
import type { Analysis } from "../core/engine";

function makeAnalysis(best: string, pvs: string[]): Analysis {
  return {
    bestmove: best,
    candidates: pvs.map((pv) => ({ pv: [pv] })),
  } as unknown as Analysis;
}

describe("chooseEnemyMove", () => {
  it("always plays the best move at difficulty 100", () => {
    const c = new Chess();
    const a = makeAnalysis("e2e4", ["e2e4", "d2d4", "g1f3"]);
    for (let i = 0; i < 200; i++)
      expect(chooseEnemyMove(a, 100, c)).toBe("e2e4");
  });

  it("only returns legal moves at difficulty 0", () => {
    const c = new Chess();
    const a = makeAnalysis("e2e4", ["e2e4", "d2d4", "g1f3"]);
    const legal = new Set(
      c
        .moves({ verbose: true })
        .map((m) => m.from + m.to + (m.promotion || "")),
    );
    for (let i = 0; i < 300; i++)
      expect(legal.has(chooseEnemyMove(a, 0, c))).toBe(true);
  });

  it("mixes in weaker moves at low difficulty", () => {
    const c = new Chess();
    const a = makeAnalysis("e2e4", [
      "e2e4",
      "d2d4",
      "g1f3",
      "b1c3",
      "c2c4",
    ]);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(chooseEnemyMove(a, 30, c));
    expect(seen.size).toBeGreaterThan(1);
  });
});
