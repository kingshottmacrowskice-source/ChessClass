import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { easeMove, movingFrom } from "./transition";

describe("board move transitions", () => {
  it("animates both pieces in white castling, and the rook alongside the carried black king", () => {
    const game = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const white = game.move("O-O");
    expect(movingFrom(white, "g1")).toBe("e1");
    expect(movingFrom(white, "f1")).toBe("h1");
    expect(movingFrom(white, "a1")).toBeNull();
    const black = game.move("O-O-O");
    expect(movingFrom(black, "d8")).toBe("a8");
    expect(movingFrom(black, "c8")).toBeNull();
  });
  it("keeps promotions and en passant attached to their true origin", () => {
    const promotion = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1").move("a8=N");
    expect(movingFrom(promotion, "a8")).toBe("a7");
    const ep = new Chess("7k/8/8/3pP3/8/8/8/7K w - d6 0 1").move("exd6");
    expect(movingFrom(ep, "d6")).toBe("e5");
    expect(movingFrom(ep, "d5")).toBeNull();
  });
  it("starts and ends exactly on the squares without overshoot", () => {
    expect(easeMove(-1)).toBe(0);
    expect(easeMove(2)).toBe(1);
    expect(easeMove(0.5)).toBe(0.5);
    const positions = Array.from({ length: 101 }, (_, i) => easeMove(i / 100));
    expect(positions.every((p, i) => i === 0 || p >= positions[i - 1])).toBe(
      true,
    );
  });
});
