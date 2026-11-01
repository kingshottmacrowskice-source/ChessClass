import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { demonRules, standardRules } from "./rules";

describe("rules board snapshot", () => {
  it("standard mode reports only the mode", () => {
    expect(standardRules.snapshot(new Chess())).toEqual({ mode: "standard" });
  });

  it("demon mode exposes the state that a FEN cannot represent", () => {
    demonRules.reset();
    const game = new Chess();
    game.move("e4");
    const action = demonRules
      .specialActions(game)
      .find((a) => a.item === "summon-cannon");
    expect(action).toBeDefined();
    demonRules.commitSpecial(game, action!);

    const snap = demonRules.snapshot(game);
    expect(snap.mode).toBe("demon");
    expect(Array.isArray(snap.cannons)).toBe(true);
    expect(snap.cannons).toContain(action!.target);
    expect(snap.winner).toBeNull();
    expect(snap.blastDraw).toBe(false);
    expect(Array.isArray(snap.lostWhite)).toBe(true);
  });
});
