import { it, expect } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
import {
  currentFreeItem,
  defaultFreeItemWeights,
  FREE_ITEM_WINDOW_MS,
  freeItemWindow,
  FreeItemRotation,
  isFreeItemClaimText,
  matchFreeItemTarget,
  normalizeFreePiece,
  normalizeFreeSquare,
  parseFreePiece,
  parseFreeSquare,
  pickFreeItem,
  resolveFreeItemTarget,
} from "./freeItem";

it("picks a stable item per 5-minute window, honoring weights", () => {
  const weights = { ...defaultFreeItemWeights };
  const a = pickFreeItem(weights, 7);
  expect(a).toBeDefined();
  expect(pickFreeItem(weights, 7)).toBe(a);
  expect(pickFreeItem(weights, 7 + 1)).toBe(pickFreeItem(weights, 8));

  const only = { ...defaultFreeItemWeights };
  for (const k of Object.keys(only) as (keyof typeof only)[])
    only[k] = k === "doom-shroom" ? 3 : 0;
  expect(pickFreeItem(only, 1)).toBe("doom-shroom");
  expect(pickFreeItem(only, 2)).toBe("doom-shroom");

  const none = Object.fromEntries(
    Object.keys(defaultFreeItemWeights).map((k) => [k, 0]),
  ) as typeof defaultFreeItemWeights;
  expect(pickFreeItem(none, 1)).toBeUndefined();
});

it("windows the clock every five minutes", () => {
  expect(freeItemWindow(0)).toBe(0);
  expect(freeItemWindow(FREE_ITEM_WINDOW_MS - 1)).toBe(0);
  expect(freeItemWindow(FREE_ITEM_WINDOW_MS)).toBe(1);
  const offer = currentFreeItem(defaultFreeItemWeights, FREE_ITEM_WINDOW_MS + 5);
  expect(offer?.window).toBe(1);
  expect(offer?.until).toBe(2 * FREE_ITEM_WINDOW_MS);
  expect(offer?.item).toBeDefined();
});

it("rotates one claim per window, first come first served", () => {
  const r = new FreeItemRotation();
  expect(r.available(3)).toBe(true);
  r.claim(3, "观众A", "毁灭菇 · e4");
  expect(r.available(3)).toBe(false);
  expect(r.claimedBy).toBe("观众A");
  expect(r.available(4)).toBe(true);
  r.reset();
  expect(r.available(3)).toBe(true);
});

it("parses squares, pieces and claim intent", () => {
  expect(parseFreeSquare("毁灭菇e4")).toBe("e4");
  expect(parseFreeSquare("复活马 到 E3")).toBe("e3");
  expect(parseFreePiece("复活马到e3", true)).toBe("n");
  expect(parseFreePiece("复活炮", true)).toBe("c");
  expect(parseFreePiece("复活骑士到e3", true)).toBe("n");
  expect(parseFreePiece("复活皇后到e3", true)).toBe("q");
  expect(parseFreePiece("复活国王到e3", true)).toBe("k");
  expect(parseFreePiece("复活城堡到e3", true)).toBe("r");
  expect(parseFreePiece("复活主教到e3", true)).toBe("b");
  expect(parseFreePiece("复活小兵到e3", true)).toBe("p");
  expect(parseFreePiece("炮轰e5", false)).toBeUndefined();
  expect(parseFreePiece("炮轰皇后", false)).toBe("q");
  expect(parseFreePiece("然后抢道具", false)).toBeUndefined();
  expect(isFreeItemClaimText("抢 e4", "doom-shroom")).toBe(true);
  expect(isFreeItemClaimText("毁灭菇e4", "doom-shroom")).toBe(true);
  expect(isFreeItemClaimText("安排e4", "doom-shroom")).toBe(true);
  expect(isFreeItemClaimText("来个e4", "doom-shroom")).toBe(true);
  expect(isFreeItemClaimText("召唤个炮到e3", "summon-cannon")).toBe(true);
  expect(isFreeItemClaimText("e4", "doom-shroom")).toBe(false);
});

it("resolves a coordinate-only item target", () => {
  const g = new Chess(),
    r = new DemonRules();
  const actions = r
    .specialActions(g, true)
    .filter((a) => a.item === "doom-shroom");
  const res = resolveFreeItemTarget("doom-shroom", "毁灭菇e4", g, actions);
  expect(res.action?.target).toBe("e4");
  expect(res.action?.item).toBe("doom-shroom");
});

it("resolves monster-reborn by piece and square", () => {
  const g = new Chess(),
    r = new DemonRules();
  r.lost.w.push("n");
  const actions = r
    .specialActions(g, true)
    .filter((a) => a.item === "monster-reborn");
  const res = resolveFreeItemTarget(
    "monster-reborn",
    "复活马到e3",
    g,
    actions,
  );
  expect(res.action?.target).toBe("e3");
  expect(res.action?.piece).toBe("n");
  // 只给棋子不给格子会命中多个落点，应提示补充。
  const ambiguous = resolveFreeItemTarget("monster-reborn", "复活马", g, actions);
  expect(ambiguous.action).toBeUndefined();
  expect(ambiguous.reason).toMatch(/不唯一/);
});

it("resolves artillery against an enemy square", () => {
  const g = new Chess(),
    r = new DemonRules();
  const actions = r
    .specialActions(g, true)
    .filter((a) => a.item === "londinium-artillery");
  const res = resolveFreeItemTarget(
    "londinium-artillery",
    "炮轰e7",
    g,
    actions,
  );
  expect(res.action?.target).toBe("e7");
});

it("resolves the obelisk without needing a target", () => {
  const g = new Chess(),
    r = new DemonRules();
  const actions = r
    .specialActions(g, true)
    .filter((a) => a.item === "summon-obelisk");
  expect(actions.length).toBeGreaterThan(0);
  const res = resolveFreeItemTarget(
    "summon-obelisk",
    "抢巨神兵",
    g,
    actions,
  );
  expect(res.action?.item).toBe("summon-obelisk");
});

it("normalizes AI-provided square and piece hints", () => {
  expect(normalizeFreeSquare("e4")).toBe("e4");
  expect(normalizeFreeSquare("E4")).toBe("e4");
  expect(normalizeFreeSquare("e9")).toBeUndefined();
  expect(normalizeFreeSquare(4)).toBeUndefined();
  expect(normalizeFreePiece("n")).toBe("n");
  expect(normalizeFreePiece("c")).toBe("c");
  expect(normalizeFreePiece("x")).toBeUndefined();
});

it("matches a target directly from AI hints", () => {
  const g = new Chess(),
    r = new DemonRules();
  r.lost.w.push("n");
  const actions = r
    .specialActions(g, true)
    .filter((a) => a.item === "monster-reborn");
  const res = matchFreeItemTarget("monster-reborn", g, actions, "e3", "n");
  expect(res.action?.target).toBe("e3");
  expect(res.action?.piece).toBe("n");
});
