import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
import { decideDemonTurn } from "./demonAI";
import {
  weightedPick,
  selectDemonActions,
  normalizeWeights,
  defaultBehaviorWeights,
  defaultItemWeights,
} from "./demonWeights";
it("uses relative weights and excludes zero weights at boundaries", () => {
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 400; i++)
    counts[
      weightedPick(["a", "b", "c"], { a: 1, b: 3, c: 0 }, () => i / 400)!
    ]++;
  expect(counts).toEqual({ a: 100, b: 300, c: 0 });
  expect(weightedPick(["a"], { a: 0 }, () => 0)).toBeUndefined();
});
it("normalizes legacy and malformed settings without losing explicit zero", () => {
  expect(normalizeWeights(undefined, defaultItemWeights)).toEqual(
    defaultItemWeights,
  );
  expect(
    normalizeWeights(
      { "doom-shroom": 0, "monster-reborn": 999, "summon-cannon": NaN },
      defaultItemWeights,
    ),
  ).toEqual({
    "doom-shroom": 0,
    "monster-reborn": 100,
    "summon-cannon": 1,
    "tingqiao-stone": 1,
    "summon-obelisk": 1,
    "londinium-artillery": 1,
  });
});
it("selects only enabled available items and falls back when all are disabled", () => {
  const game = new Chess();
  game.move("e4");
  const rules = new DemonRules();
  const available = rules.specialActions(game);
  const behaviors = { destroy: 0, movement: 0, item: 1, skill: 100 };
  const items = {
    "tingqiao-stone": 0,
    "summon-obelisk": 0,
    "londinium-artillery": 0,
    "doom-shroom": 0,
    "monster-reborn": 100,
    "summon-cannon": 1,
  };
  for (const random of [0, 0.2, 0.8, 0.999])
    expect(
      selectDemonActions(available, behaviors, items, () => random)[0].item,
    ).toBe("summon-cannon");
  expect(
    selectDemonActions(
      available,
      behaviors,
      {
        "doom-shroom": 0,
        "monster-reborn": 0,
        "summon-cannon": 0,
        "tingqiao-stone": 0,
        "summon-obelisk": 0,
        "londinium-artillery": 0,
      },
      () => 0,
    ),
  ).toEqual([]);
});
it("integrates weights into AI selection and normal-move fallback", async () => {
  const game = new Chess("7k/8/8/8/8/8/4P3/K7 b - - 0 1"),
    rules = new DemonRules();
  const result = await decideDemonTurn(game, rules, {
    chance: 100,
    difficulty: 100,
    behaviorWeights: { destroy: 0, movement: 0, item: 1, skill: 0 },
    itemWeights: {
      "tingqiao-stone": 0,
      "summon-obelisk": 0,
      "londinium-artillery": 0,
      "doom-shroom": 0,
      "monster-reborn": 0,
      "summon-cannon": 1,
    },
    random: () => 0,
  });
  expect(result.action?.item).toBe("summon-cannon");
  const fallback = await decideDemonTurn(game, rules, {
    chance: 100,
    difficulty: 100,
    behaviorWeights: {
      ...defaultBehaviorWeights,
      destroy: 0,
      movement: 0,
      item: 0,
      skill: 0,
    },
    random: () => 0,
  });
  expect(fallback.action).toBeUndefined();
  expect(
    rules.legalMoves(game).some((m) => m.lan === fallback.analysis.bestmove),
  ).toBe(true);
});
