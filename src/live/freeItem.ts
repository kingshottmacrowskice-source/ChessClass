import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { DemonAction } from "./demonFish";
import { itemLabels, weightedPick } from "./demonWeights";

/**
 * 限时免费道具：每 5 分钟从权重中抽一件白方道具，观众先到先得。
 *
 * 巨神兵（欧贝利斯克）需要献祭三枚己方棋子且落点随机，因此认领时无需指定
 * 目标，发道具名即可；其余道具按棋子或坐标指明目标。
 */
export type FreeItemId =
  | "doom-shroom"
  | "monster-reborn"
  | "summon-cannon"
  | "tingqiao-stone"
  | "londinium-artillery"
  | "summon-obelisk";

export type FreeItemWeights = Record<FreeItemId, number>;

/** 5 分钟一轮。 */
export const FREE_ITEM_WINDOW_MS = 300000;

type FreeItemMeta = {
  /** 设置页与日志使用的完整名称。 */
  label: string;
  /** 直播画面横幅使用的短名。 */
  short: string;
  /** 观众发弹幕认领时命中这些词才算“抢道具”。 */
  keywords: string[];
  /** 告诉观众该怎么指明目标。 */
  hint: string;
  art: "doom-shroom" | "monster-reborn" | "summon-cannon" | "tingqiao-stone" | "obelisk" | "none";
};

export const freeItemMeta: Record<FreeItemId, FreeItemMeta> = {
  "doom-shroom": {
    label: itemLabels["doom-shroom"],
    short: "毁灭菇",
    keywords: ["毁灭菇", "蘑菇"],
    hint: "发坐标抢用，如「毁灭菇e4」",
    art: "doom-shroom",
  },
  "monster-reborn": {
    label: itemLabels["monster-reborn"],
    short: "死者苏生",
    keywords: ["死者苏生", "复活"],
    hint: "发棋子+坐标抢用，如「复活马到e3」",
    art: "monster-reborn",
  },
  "summon-cannon": {
    label: itemLabels["summon-cannon"],
    short: "召唤炮",
    keywords: ["召唤炮", "召唤"],
    hint: "发坐标抢用，如「召唤炮e3」",
    art: "summon-cannon",
  },
  "tingqiao-stone": {
    label: itemLabels["tingqiao-stone"],
    short: "听桥",
    keywords: ["听桥", "技能石"],
    hint: "发棋子或坐标抢用，如「听桥e2」",
    art: "tingqiao-stone",
  },
  "londinium-artillery": {
    label: itemLabels["londinium-artillery"],
    short: "城防副炮",
    keywords: ["副炮", "城防炮", "炮轰", "轰炸", "炮击"],
    hint: "发敌方棋子或坐标抢用，如「炮轰e5」",
    art: "none",
  },
  "summon-obelisk": {
    label: itemLabels["summon-obelisk"],
    short: "巨神兵",
    keywords: ["巨神兵", "欧贝利斯克"],
    hint: "发「巨神兵」抢用，随机献祭三枚棋子并自动选择召唤位",
    art: "obelisk",
  },
};

export const freeItemIds = Object.keys(freeItemMeta) as FreeItemId[];

export const defaultFreeItemWeights: FreeItemWeights = {
  "doom-shroom": 1,
  "monster-reborn": 1,
  "summon-cannon": 1,
  "tingqiao-stone": 1,
  "londinium-artillery": 1,
  "summon-obelisk": 1,
};

/** 认领类关键词：命中其一即视为“想抢当前免费道具”。 */
const CLAIM_KEYWORDS = [
  "道具",
  "免费",
  "限时",
  "抢",
  "白嫖",
  "使用",
  "领取",
  "安排",
  "来个",
];

/** 确定性伪随机：同一窗口在所有浏览器/OBS 源里抽出同一件道具。 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function freeItemWindow(now: number): number {
  return Math.floor(now / FREE_ITEM_WINDOW_MS);
}

export function pickFreeItem(
  weights: FreeItemWeights,
  window: number,
): FreeItemId | undefined {
  return weightedPick(freeItemIds, weights, seededRandom(window + 1));
}

export function currentFreeItem(
  weights: FreeItemWeights,
  now: number,
): { window: number; item: FreeItemId; until: number } | undefined {
  const window = freeItemWindow(now);
  const item = pickFreeItem(weights, window);
  return item
    ? { window, item, until: (window + 1) * FREE_ITEM_WINDOW_MS }
    : undefined;
}

/** 每轮只允许一名观众领取；`window` 变化后自动重新开放。 */
export class FreeItemRotation {
  claimedWindow = -1;
  claimedBy = "";
  claimedLabel = "";
  available(window: number): boolean {
    return this.claimedWindow !== window;
  }
  claim(window: number, by: string, label: string): void {
    this.claimedWindow = window;
    this.claimedBy = by;
    this.claimedLabel = label;
  }
  reset(): void {
    this.claimedWindow = -1;
    this.claimedBy = "";
    this.claimedLabel = "";
  }
}

export function isFreeItemClaimText(text: string, item: FreeItemId): boolean {
  const meta = freeItemMeta[item];
  return (
    CLAIM_KEYWORDS.some((k) => text.includes(k)) ||
    meta.keywords.some((k) => text.includes(k))
  );
}

const SQUARE_RE = /([a-h][1-8])/i;

export function parseFreeSquare(text: string): Square | undefined {
  const m = text.replace(/\s+/g, "").match(SQUARE_RE);
  return m ? (m[1].toLowerCase() as Square) : undefined;
}

/**
 * 从弹幕里解析棋子名。仅认领上下文中调用；“炮”只在复活炮时视为棋子，
 * 以免把「炮轰」的动词「炮」误判成目标。除单字外也接受“皇后/国王/城堡/骑士/主教/小兵”等写法。
 */
const PIECE_SYNONYMS: [RegExp, PieceSymbol][] = [
  [/皇后|女王|后/, "q"],
  [/国王|王/, "k"],
  [/城堡|车/, "r"],
  [/骑士|马/, "n"],
  [/主教|象/, "b"],
  [/小兵|兵|卒/, "p"],
];
export function parseFreePiece(
  text: string,
  allowCannon: boolean,
): PieceSymbol | "c" | undefined {
  // 常见虚词里恰好含棋子字，先清掉，避免“然后/马上”被当成后/马。
  const cleaned = text.replace(
    /然后|之后|最后|以后|后来|马上|随后|于是|其实|只是|但是|象棋|国际象棋/g,
    " ",
  );
  if (allowCannon && /炮/.test(cleaned)) return "c";
  for (const [re, piece] of PIECE_SYNONYMS) if (re.test(cleaned)) return piece;
  return undefined;
}

/** 校验并规范化 AI/外部给出的坐标。 */
export function normalizeFreeSquare(value: unknown): Square | undefined {
  return typeof value === "string" && /^[a-h][1-8]$/i.test(value)
    ? (value.toLowerCase() as Square)
    : undefined;
}

/** 校验并规范化 AI/外部给出的棋子：p/n/b/r/q/k，c 表示炮。 */
export function normalizeFreePiece(
  value: unknown,
): PieceSymbol | "c" | undefined {
  return typeof value === "string" && /^[pbnrqkc]$/.test(value)
    ? (value as PieceSymbol | "c")
    : undefined;
}

/** 在候选行动里，按“棋子或坐标”缩小到唯一目标。 */
export function matchFreeItemTarget(
  item: FreeItemId,
  game: Chess,
  actions: DemonAction[],
  square?: Square,
  piece?: PieceSymbol | "c",
): { action?: DemonAction; reason?: string } {
  // 巨神兵随机献祭并自动选位，认领时无需坐标/棋子。
  if (item === "summon-obelisk")
    return actions.length
      ? { action: actions[0] }
      : { reason: "当前无法召唤巨神兵" };
  let matches = actions;
  if (square) matches = matches.filter((a) => a.target === square);
  if (piece) {
    matches = matches.filter((a) => {
      if (item === "monster-reborn")
        return piece === "c" ? !!a.cannon : a.piece === piece && !a.cannon;
      if (item === "tingqiao-stone") return a.piece === piece;
      if (item === "londinium-artillery")
        return game.get(a.target)?.type === piece;
      // 坐标类道具只看格子，忽略棋子词。
      return true;
    });
  }
  if (!matches.length)
    return {
      reason: square || piece
        ? "没有符合该棋子或坐标的可用目标"
        : "当前没有可用的目标",
    };
  if (matches.length > 1)
    return {
      reason: `目标不唯一，请补充具体棋子或格子（${freeItemMeta[item].hint}）`,
    };
  return { action: matches[0] };
}

/** 从原始弹幕文本解析目标，再缩小到唯一行动。 */
export function resolveFreeItemTarget(
  item: FreeItemId,
  text: string,
  game: Chess,
  actions: DemonAction[],
): { action?: DemonAction; reason?: string } {
  const square = parseFreeSquare(text);
  const piece = parseFreePiece(text, item === "monster-reborn");
  return matchFreeItemTarget(item, game, actions, square, piece);
}
