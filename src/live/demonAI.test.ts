import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { decideDemonTurn, DEMON_AI } from "./demonAI";
import { demonRules, standardRules } from "./rules";

describe("independent demon game AI", () => {
  it("chooses a legal ordinary move without an engine and leaves the live board untouched", async () => {
    const game = new Chess();
    game.move("e4");
    const before = game.fen();
    const result = await decideDemonTurn(game, demonRules, {
      chance: 0,
      difficulty: 100,
      random: () => 0,
    });
    expect(result.analysis.engine).toBe(DEMON_AI);
    expect(result.action).toBeUndefined();
    expect(result.analysis.candidates[0].depth).toBe(2);
    expect(() =>
      demonRules.play(new Chess(before), result.analysis.bestmove),
    ).not.toThrow();
    expect(game.fen()).toBe(before);
  });
  it("selects and commits destruction without consulting Stockfish", async () => {
    const game = new Chess("7k/8/8/3b4/8/8/4Q3/K7 b - - 0 1");
    const { action } = await decideDemonTurn(game, demonRules, {
      chance: 100,
      difficulty: 100,
      random: () => 0,
    });
    expect(action?.kind).toBe("destroy");
    expect(action?.target).toBe("e2");
    demonRules.commitSpecial(game, action!);
    expect(game.get("e2")).toBeUndefined();
    expect(game.turn()).toBe("w");
  });
  it("can select a special movement without an SF score threshold", async () => {
    const game = new Chess();
    game.move("e4");
    const { action } = await decideDemonTurn(game, demonRules, {
      chance: 100,
      difficulty: 100,
      random: () => 0.5,
    });
    expect(action?.kind).toBe("movement");
    expect(() => demonRules.commitSpecial(game, action!)).not.toThrow();
  });
  it("rejects forged, stale and standard-mode special actions", () => {
    const game = new Chess();
    game.move("e4");
    const action = demonRules.specialActions(game)[0];
    expect(() => standardRules.commitSpecial(game, action)).toThrow();
    expect(() =>
      demonRules.commitSpecial(game, { ...action, after: game.fen() }),
    ).toThrow();
    game.move("e5");
    expect(() => demonRules.commitSpecial(game, action)).toThrow();
  });
  it("honors cancellation before touching the board", async () => {
    const game = new Chess();
    game.move("e4");
    const controller = new AbortController();
    controller.abort();
    await expect(
      decideDemonTurn(game, demonRules, {
        chance: 100,
        difficulty: 100,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps ordinary standard-mode rules and SF choice unchanged", () => {
    const game = new Chess();
    expect(standardRules.specialActions(game)).toEqual([]);
    expect(standardRules.legalMoves(game)).toHaveLength(20);
    expect(standardRules.play(game, "e2e4").san).toBe("e4");
    expect(() => standardRules.play(game, "a8a1")).toThrow();
  });
});
