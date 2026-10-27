import type { Chess } from "chess.js";
import type { Analysis } from "../core/engine";

/**
 * 按难度从引擎候选里挑大肥鱼要走的棋。
 * difficulty 100 = 最强（只走最优着法）；0 = 最弱（经常随机乱走/送子）。
 */
export function chooseEnemyMove(
  a: Analysis,
  difficulty: number,
  chess: Chess,
): string {
  if (difficulty >= 100) return a.bestmove;
  const legal = chess
    .moves({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion || ""));
  if (!legal.length) return a.bestmove;

  const strength = Math.max(0, Math.min(1, difficulty / 100));
  const best = a.bestmove;
  const weaker = a.candidates
    .map((c) => c.pv[0])
    .filter((u) => u !== best && legal.includes(u));

  const roll = Math.random();
  // 越弱，越可能走次优着法，甚至随机走一步送子。
  if (roll < strength) return best;
  if (roll < strength + (1 - strength) * 0.5 && weaker.length)
    return weaker[Math.floor(Math.random() * weaker.length)];
  return legal[Math.floor(Math.random() * legal.length)];
}
