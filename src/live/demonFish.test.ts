import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  demonProviders,
  destroyCandidates,
  movementCandidates,
} from "./demonFish";
describe("demon fish rules", () => {
  it("preserves piece identity, consumes the turn and never changes the source game", () => {
    const g = new Chess("7k/8/8/3b4/8/8/8/K7 b - - 7 12");
    const before = g.fen();
    const move = movementCandidates(g).find(
      (a) => a.from === "d5" && a.target === "f4",
    )!;
    expect(move.rule).toBe("n");
    const after = new Chess(move.after);
    expect(after.get("f4")?.type).toBe("b");
    expect(after.get("d5")).toBeUndefined();
    expect(after.turn()).toBe("w");
    expect(after.moveNumber()).toBe(13);
    expect(g.fen()).toBe(before);
  });
  it("does not move kings, capture kings, land on allies or slide through blockers", () => {
    const g = new Chess("7k/8/8/3bP3/8/8/8/K7 b - - 0 1");
    const actions = movementCandidates(g);
    expect(actions.some((a) => a.from === "h8" || a.target === "a1")).toBe(
      false,
    );
    expect(actions.some((a) => a.from === "d5" && a.target === "f5")).toBe(
      false,
    );
    expect(actions.some((a) => a.from === "d5" && a.target === "e5")).toBe(
      true,
    );
    expect(destroyCandidates(g).map((a) => a.target)).toEqual(["e5"]);
  });
  it("requires resolving check for both destruction and movement", () => {
    const g = new Chess("4k3/8/8/2b5/8/P7/8/K3R3 b - - 0 1");
    expect(destroyCandidates(g).map((a) => a.target)).toEqual(["e1"]);
    for (const a of movementCandidates(g)) {
      const fields = a.after.split(" ");
      fields[1] = "b";
      expect(new Chess(fields.join(" ")).isCheck()).toBe(false);
    }
  });
  it("clears en passant and invalidated castling rights", () => {
    const g = new Chess("r3k2r/8/8/8/4P3/8/8/R3K2R b KQkq e3 0 1");
    const action = destroyCandidates(g).find((a) => a.target === "a1")!;
    expect(action.after.split(" ")[2]).toBe("Kkq");
    expect(action.after.split(" ")[3]).toBe("-");
  });
  it("promotes a pawn reaching the last rank", () => {
    const g = new Chess("7k/8/8/8/8/3p4/8/K7 b - - 0 1");
    const a = movementCandidates(g).find(
      (a) => a.from === "d3" && a.target === "e1",
    )!;
    expect(new Chess(a.after).get("e1")?.type).toBe("q");
  });
  it("reserves unavailable item and skill providers", () => {
    for (const p of demonProviders.filter(
      (p) => p.kind === "item" || p.kind === "skill",
    ))
      expect(p.candidates(new Chess())).toEqual([]);
  });
});
