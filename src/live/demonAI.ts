import { giantAt, footprint } from "./obelisk";
import { bombardmentArea } from "./bombardment";
import {
  selectDemonActions,
  normalizeWeights,
  defaultBehaviorWeights,
  defaultItemWeights,
  type BehaviorWeights,
  type ItemWeights,
} from "./demonWeights";
import { Chess, type PieceSymbol } from "chess.js";
import type { Analysis } from "../core/engine";
import type { DemonAction } from "./demonFish";
import type { StandardRules } from "./rules";

const values: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};
export const DEMON_AI = "魔鱼游戏 AI · 本地搜索";

/** Game utility, positive for black. This is not a Stockfish centipawn score. */
export function demonUtility(game: Chess, rules: StandardRules): number {
  if (rules.winner) return rules.winner === "b" ? 100000 : -100000;
  if (rules.isCheckmate(game)) return game.turn() === "w" ? 100000 : -100000;
  if (rules.isDraw(game)) return 0;
  let value = 0;
  for (const p of game.board().flat()) {
    if (!p || (giantAt(rules.giants, p.square) && !rules.giants.has(p.square)))
      continue;
    const skill = rules.listening.get(p.square);
    const sign = p.color === "b" ? 1 : -1;
    const enemy = p.color === "b" ? "w" : "b";
    const cells = rules.giants.has(p.square) ? footprint(p.square) : [p.square];
    const attacked = cells.some((s) => rules.isAttacked(game, s, enemy));
    const defended = rules.isAttacked(game, p.square, p.color);
    const center =
      7 -
      Math.abs(p.square.charCodeAt(0) - 100.5) -
      Math.abs(Number(p.square[1]) - 4.5);
    const advance =
      p.color === "b" ? 7 - Number(p.square[1]) : Number(p.square[1]) - 2;
    if (skill) value += sign * (skill.cooldown === 0 ? 180 : 60);
    value +=
      sign *
      ((rules.giants.has(p.square)
        ? 1200 + rules.giants.get(p.square)!.shields * 180
        : rules.cannons.has(p.square)
          ? 450
          : values[p.type]) +
        (p.type === "k" ? 0 : center * 4) +
        (p.type === "p" ? advance * 9 : 0));
    if (attacked)
      value -=
        sign *
        (p.type === "k" ? 70 : values[p.type] * (defended ? 0.08 : 0.35));
  }
  for (const shell of rules.bombardments) {
    for (const square of new Set(
      bombardmentArea(shell.target).map((s) => giantAt(rules.giants, s) ?? s),
    )) {
      const p = game.get(square);
      if (!p) continue;
      const giant = rules.giants.get(square);
      const risk = giant
        ? giant.shields
          ? 180
          : 1200
        : p.type === "k"
          ? 3000
          : values[p.type];
      value +=
        (p.color === "w" ? 1 : -1) *
        risk *
        (shell.remaining === 1 ? 0.7 : 0.25);
    }
  }
  return value;
}

type Option = {
  uci?: string;
  action?: DemonAction;
  after: string;
  value: number;
  depth: number;
};

/** Two-ply, bounded game-tree search: our action, then the audience's strongest reply. */
export async function decideDemonTurn(
  game: Chess,
  rules: StandardRules,
  options: {
    chance: number;
    behaviorWeights?: BehaviorWeights;
    itemWeights?: ItemWeights;
    difficulty: number;
    signal?: AbortSignal;
    random?: () => number;
  },
): Promise<{ analysis: Analysis; action?: DemonAction }> {
  const random = options.random ?? Math.random;
  const before = game.fen();
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
  };
  check();
  const normal: Option[] = rules.legalMoves(game).map((m) => {
    const copy = new Chess(before);
    const uci = m.from + m.to + (m.promotion ?? "");
    const simulatedRules = rules.fork();
    simulatedRules.play(copy, uci);
    return {
      uci,
      after: copy.fen(),
      value: demonUtility(copy, simulatedRules),
      depth: 1,
    };
  });
  let specials: Option[] = [];
  if (random() * 100 < options.chance) {
    const available = rules.specialActions(game);
    const selected = selectDemonActions(
      available,
      normalizeWeights(options.behaviorWeights, defaultBehaviorWeights),
      normalizeWeights(options.itemWeights, defaultItemWeights),
      random,
    );
    specials = selected.flatMap((template) => {
      let action: DemonAction;
      try {
        action = rules.prepareSpecial(game, template, random);
      } catch {
        return [];
      }
      const copy = new Chess(before),
        simulatedRules = rules.fork();
      simulatedRules.commitSpecial(copy, action);
      return [
        {
          action,
          after: action.after,
          value: demonUtility(copy, simulatedRules),
          depth: 1,
        },
      ];
    });
  }
  const ranked = (specials.length ? specials : normal).sort(
    (a, b) => b.value - a.value,
  );
  // Always finish at least one reply search; only completed searches enter the final pool.
  const deadline = performance.now() + 1500;
  const searched: Option[] = [];
  for (const candidate of ranked.slice(0, 12)) {
    check();
    if (searched.length && performance.now() >= deadline) break;
    const branchRules = rules.fork();
    const branch = new Chess(before);
    if (candidate.action) branchRules.commitSpecial(branch, candidate.action);
    else if (candidate.uci) branchRules.play(branch, candidate.uci);
    const next = new Chess(candidate.after);
    let worst = candidate.value;
    if (!branchRules.isGameOver(next)) {
      const replies = branchRules.legalMoves(next);
      worst = Infinity;
      for (const reply of replies) {
        const result = new Chess(candidate.after);
        const replyRules = branchRules.fork();
        replyRules.play(
          result,
          reply.from + reply.to + (reply.promotion ?? ""),
        );
        worst = Math.min(worst, demonUtility(result, replyRules));
      }
      if (!replies.length) worst = candidate.value;
    }
    searched.push({ ...candidate, value: worst, depth: 2 });
    // Let resets/settings/UI events run; all work uses snapshots, never the live board.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  check();
  searched.sort((a, b) => b.value - a.value);
  let action: DemonAction | undefined;
  if (specials.length && searched.length) {
    const count = Math.min(searched.length, options.difficulty >= 100 ? 3 : 6);
    action = searched[Math.floor(random() * count)].action;
  }
  const moves = specials.length
    ? normal.sort((a, b) => b.value - a.value)
    : searched;
  const analysis: Analysis = {
    engine: DEMON_AI,
    position: { start: before, moves: [] },
    fen: before,
    bestmove: moves[0]?.uci ?? "(none)",
    candidates: moves.map((m, i) => ({
      rank: i + 1,
      depth: m.depth,
      pv: [m.uci!],
      score: { kind: "cp", raw: m.value, white: -m.value, turn: "b" },
    })),
  };
  return { analysis, action };
}
