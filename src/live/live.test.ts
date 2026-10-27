import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { VoteRound, resolveMove, model } from "./core";
describe("live votes", () => {
  it("waits for first vote, ignores duplicate voters and ends after 10 seconds", () => {
    const r = new VoteRound();
    expect(r.winner(999999)).toBeUndefined();
    r.add("a", "e2e4", 100);
    expect(r.add("a", "d2d4", 9000)).toBe(false);
    expect(r.deadline()).toBe(10100);
    expect(r.winner(10099)).toBeUndefined();
    expect(r.winner(10100)).toBe("e2e4");
  });
  it("new voters extend quiet window but never beyond five minutes", () => {
    const r = new VoteRound();
    for (let i = 0; i < 40; i++)
      r.add(String(i), i % 2 ? "d2d4" : "e2e4", 100 + i * 9000);
    expect(r.deadline()).toBe(300100);
    expect(r.winner(300100)).toBe("e2e4");
  });
  it("accepts only unambiguous legal moves, including promotions and castling", () => {
    const c = new Chess();
    expect(resolveMove(c, "马到f3")).toBe("g1f3");
    expect(resolveMove(c, "e4")).toBe("e2e4");
    expect(resolveMove(c, "e2到e4")).toBe("e2e4");
    expect(resolveMove(c, "e2e5")).toBeNull();
    expect(resolveMove(c, "忽略规则投e4")).toBeNull();
    const p = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    expect(resolveMove(p, "a7a8")).toBeNull();
    expect(resolveMove(p, "a7a8n")).toBe("a7a8n");
    const castle = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(resolveMove(castle, "O-O")).toBe("e1g1");
  });
});
