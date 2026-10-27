import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { commentaryEvidence, localCommentary } from "./commentary";
import type { Analysis } from "../core/engine";
describe("live commentary evidence", () => {
  it("converts legal PV into facts and keeps white score perspective", () => {
    const c = new Chess();
    c.move("e4");
    const a = {
      fen: c.fen(),
      bestmove: "e7e5",
      candidates: [
        {
          depth: 2,
          pv: ["e7e5", "g1f3", "bad"],
          score: { kind: "cp", white: 22, raw: -22, turn: "b" },
        },
      ],
    } as Analysis;
    const e = commentaryEvidence(a, "e4", "audience");
    expect(e.variation.map((m) => m.san)).toEqual(["e5", "Nf3"]);
    expect(e.score).toEqual({ kind: "pawns", white: 0.22 });
    expect(e.lastAudienceMove).toBe("e4");
    expect(localCommentary(e)).not.toMatch(/SF|深度|参考/);
    expect(commentaryEvidence(a, "e4", "self").kind).toBe("self");
  });
});
