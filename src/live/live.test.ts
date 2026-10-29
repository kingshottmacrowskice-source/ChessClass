import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { VoteRound, resolveMove, SURRENDER } from "./core";
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
  it("challenger votes extend the countdown but never beyond five minutes", () => {
    const r = new VoteRound();
    r.add("a", "e2e4", 100);
    r.add("b", "e2e4", 100);
    for (let i = 1; i < 40; i++)
      r.add(String(i), `challenger-${i}`, 100 + i * 9000);
    expect(r.deadline()).toBe(300100);
    expect(r.winner(300100)).toBe("e2e4");
  });
  it("accepts extra votes for the current leader without resetting its timer", () => {
    const r = new VoteRound();
    r.add("a", "e2e4", 100);
    expect(r.add("b", "e2e4", 9000)).toBe(true);
    expect(r.deadline()).toBe(10100);
    expect(r.tally()).toEqual([["e2e4", 2]]);
    expect(r.add("late", "e2e4", 10100)).toBe(false);
  });
  it("shares voter identity between surrender and moves in both directions", () => {
    const r = new VoteRound();
    r.add("a", SURRENDER, 100);
    expect(r.add("a", "e2e4", 200)).toBe(false);
    r.add("b", "e2e4", 300);
    expect(r.add("b", SURRENDER, 400)).toBe(false);
    expect(r.tally()).toEqual([
      ["e2e4", 1],
      [SURRENDER, 1],
    ]);
  });
  it("waits one minute for surrender and does not reset on supporting votes", () => {
    const r = new VoteRound();
    r.add("a", SURRENDER, 100);
    r.add("b", SURRENDER, 50000);
    expect(r.deadline()).toBe(60100);
    expect(r.winner(60099)).toBeUndefined();
    expect(r.winner(60100)).toBe(SURRENDER);
  });
  it("prefers a tied move over surrender and uses ten seconds", () => {
    const r = new VoteRound();
    r.add("a", SURRENDER, 100);
    r.add("b", "e2e4", 20000);
    expect(r.deadline()).toBe(30000);
    expect(r.tally()[0][0]).toBe("e2e4");
    r.add("c", "e2e4", 25000);
    expect(r.deadline()).toBe(30000);
    r.add("d", "e2e4", 29000);
    expect(r.winner(30000)).toBe("e2e4");
  });
  it("switches to a minute when surrender overtakes a move", () => {
    const r = new VoteRound();
    r.add("a", "e2e4", 100);
    r.add("b", SURRENDER, 9000);
    expect(r.deadline()).toBe(19000);
    r.add("c", SURRENDER, 18000);
    expect(r.deadline()).toBe(78000);
    r.add("d", SURRENDER, 77000);
    expect(r.winner(78000)).toBe(SURRENDER);
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
