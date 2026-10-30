import type { DemonAction, DemonKind } from "./demonFish";
export const behaviorLabels = {
  destroy: "破坏",
  movement: "移形",
  item: "使用道具",
  skill: "主动技能",
};
export const itemLabels = {
  "doom-shroom": "毁灭菇",
  "monster-reborn": "魔法卡·死者苏生",
  "summon-cannon": "召唤炮",
  "tingqiao-stone": "技能石·听桥",
  "londinium-artillery": "伦蒂尼姆城防副炮青春版",
  "summon-obelisk": "召唤欧贝利斯克的巨神兵",
};
export type BehaviorWeights = Record<DemonKind, number>;
export type ItemWeights = Record<NonNullable<DemonAction["item"]>, number>;
export const defaultBehaviorWeights: BehaviorWeights = {
  destroy: 1,
  movement: 1,
  item: 1,
  skill: 1,
};
export const defaultItemWeights: ItemWeights = {
  "doom-shroom": 1,
  "monster-reborn": 1,
  "summon-cannon": 1,
  "tingqiao-stone": 1,
  "londinium-artillery": 1,
  "summon-obelisk": 1,
};
export function normalizeWeights<T extends Record<string, number>>(
  value: unknown,
  defaults: T,
): T {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const n = input[key];
      return [
        key,
        typeof n === "number" && Number.isFinite(n)
          ? Math.max(0, Math.min(100, Math.round(n)))
          : fallback,
      ];
    }),
  ) as T;
}
export function weightedPick<T extends string>(
  keys: readonly T[],
  weights: Record<T, number>,
  random: () => number,
): T | undefined {
  const eligible = keys.filter(
    (key) => Number.isFinite(weights[key]) && weights[key] > 0,
  );
  const total = eligible.reduce((sum, key) => sum + weights[key], 0);
  if (!total) return undefined;
  let cursor = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
  for (const key of eligible) {
    cursor -= weights[key];
    if (cursor < 0) return key;
  }
  return eligible[eligible.length - 1];
}
export function selectDemonActions(
  available: DemonAction[],
  behaviors: BehaviorWeights,
  items: ItemWeights,
  random: () => number,
): DemonAction[] {
  const enabled = available.filter(
    (a) => a.kind !== "item" || (a.item && items[a.item] > 0),
  );
  const kind = weightedPick(
    [...new Set(enabled.map((a) => a.kind))],
    behaviors,
    random,
  );
  const pool = enabled.filter((a) => a.kind === kind);
  if (kind !== "item") return pool;
  const item = weightedPick(
    [...new Set(pool.flatMap((a) => (a.item ? [a.item] : [])))],
    items,
    random,
  );
  const itemPool = pool.filter((a) => a.item === item);
  const targets = [...new Set(itemPool.map((a) => a.target))];
  const target = targets[Math.floor(random() * targets.length)];
  const atTarget = itemPool.filter((a) => a.target === target);
  return atTarget.length
    ? [atTarget[Math.floor(random() * atTarget.length)]]
    : [];
}
