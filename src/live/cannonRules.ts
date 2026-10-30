import { giantAt, giantThreatens, type Giants } from "./obelisk";
import {
  Chess,
  Move,
  SQUARES,
  type Square,
  type Color,
  type PieceSymbol,
} from "chess.js";

// FEN stores cannons as rooks; the rules-owned square set preserves their identity.
export function attacks(
  game: Chess,
  target: Square,
  color: Color,
  cannons: Set<Square>,
  onlyFrom?: Square,
  giants: Giants = new Map(),
): boolean {
  return game
    .board()
    .flat()
    .some((p) => {
      if (
        !p ||
        (onlyFrom && p.square !== onlyFrom) ||
        p.color !== color ||
        p.square === target
      )
        return false;
      const giant = giantAt(giants, p.square);
      if (giant) return giant === p.square && giantThreatens(giant, target);
      const dx = target.charCodeAt(0) - p.square.charCodeAt(0),
        dy = Number(target[1]) - Number(p.square[1]);
      if (p.type === "p")
        return Math.abs(dx) === 1 && dy === (color === "w" ? 1 : -1);
      if (p.type === "n") return Math.abs(dx * dy) === 2;
      if (p.type === "k") return Math.max(Math.abs(dx), Math.abs(dy)) === 1;
      if (p.type === "b" && Math.abs(dx) !== Math.abs(dy)) return false;
      if (p.type === "r" && dx !== 0 && dy !== 0) return false;
      if (
        p.type === "q" &&
        dx !== 0 &&
        dy !== 0 &&
        Math.abs(dx) !== Math.abs(dy)
      )
        return false;
      const screenIds = new Set<string>();
      let screens = 0;
      for (let i = 1; i < Math.max(Math.abs(dx), Math.abs(dy)); i++) {
        const s = (String.fromCharCode(
          p.square.charCodeAt(0) + Math.sign(dx) * i,
        ) +
          (Number(p.square[1]) + Math.sign(dy) * i)) as Square;
        if (game.get(s)) screenIds.add(giantAt(giants, s) ?? s);
      }
      const targetUnit = giantAt(giants, target);
      if (targetUnit && screenIds.has(targetUnit)) return false;
      screens = screenIds.size;
      return screens === (cannons.has(p.square) ? 1 : 0);
    });
}
export function inCheck(
  game: Chess,
  color: Color,
  cannons: Set<Square>,
  giants: Giants = new Map(),
): boolean {
  const king = game
    .board()
    .flat()
    .find((p) => p?.type === "k" && p.color === color);
  return (
    !!king &&
    attacks(
      game,
      king.square,
      color === "w" ? "b" : "w",
      cannons,
      undefined,
      giants,
    )
  );
}
export function movedCannons(
  cannons: Set<Square>,
  from: Square,
  to: Square,
): Set<Square> {
  const next = new Set(cannons);
  next.delete(to);
  next.delete(from);
  if (cannons.has(from)) next.add(to);
  return next;
}
export function variantMoves(
  game: Chess,
  cannons: Set<Square>,
  craters: Set<Square>,
  resolve?: (move: Move) => string | undefined,
  giants: Giants = new Map(),
): Move[] {
  const moves: Move[] = [];
  const side = game.turn(),
    enemy = side === "w" ? "b" : "w";
  const fields = game.fen().split(" ");
  for (const p of game.board().flat()) {
    if (!p || p.color !== side || giantAt(giants, p.square)) continue;
    for (const to of SQUARES) {
      if (to === p.square || craters.has(to)) continue;
      const victim = game.get(to);
      if (victim?.color === side || victim?.type === "k") continue;
      const dx = to.charCodeAt(0) - p.square.charCodeAt(0),
        dy = Number(to[1]) - Number(p.square[1]);
      let flags = victim ? "c" : "n",
        ep: Square | undefined,
        rookFrom: Square | undefined,
        rookTo: Square | undefined;
      if (p.type === "p") {
        const dir = side === "w" ? 1 : -1;
        if (dx === 0 && !victim && dy === dir) {
        } else if (
          dx === 0 &&
          !victim &&
          dy === 2 * dir &&
          p.square[1] === (side === "w" ? "2" : "7") &&
          !game.get((p.square[0] + (Number(p.square[1]) + dir)) as Square)
        )
          flags = "b";
        else if (Math.abs(dx) === 1 && dy === dir && victim) {
        } else if (Math.abs(dx) === 1 && dy === dir && to === fields[3]) {
          flags = "e";
          ep = (to[0] + p.square[1]) as Square;
        } else continue;
      } else if (p.type === "k" && dy === 0 && Math.abs(dx) === 2) {
        const rank = side === "w" ? "1" : "8",
          right = dx > 0 ? "k" : "q";
        if (
          p.square !== "e" + rank ||
          !fields[2].includes(side === "w" ? right.toUpperCase() : right)
        )
          continue;
        rookFrom = ((dx > 0 ? "h" : "a") + rank) as Square;
        rookTo = ((dx > 0 ? "f" : "d") + rank) as Square;
        if (
          cannons.has(rookFrom) ||
          giantAt(giants, rookFrom) ||
          game.get(rookFrom)?.type !== "r" ||
          craters.has(rookTo) ||
          inCheck(game, side, cannons, giants)
        )
          continue;
        if (
          (dx > 0 ? ["f", "g"] : ["d", "c", "b"]).some((f) =>
            game.get((f + rank) as Square),
          )
        )
          continue;
        const transit = new Chess(game.fen());
        transit.remove(p.square);
        transit.put(p, rookTo);
        if (inCheck(transit, side, cannons, giants)) continue;
        flags = right;
      } else if (cannons.has(p.square)) {
        if (dx !== 0 && dy !== 0) continue;
        if (victim) {
          if (!attacks(game, to, side, cannons, p.square, giants)) continue;
        } else {
          let blocked = false;
          for (let i = 1; i < Math.max(Math.abs(dx), Math.abs(dy)); i++) {
            const s = (String.fromCharCode(
              p.square.charCodeAt(0) + Math.sign(dx) * i,
            ) +
              (Number(p.square[1]) + Math.sign(dy) * i)) as Square;
            if (game.get(s)) blocked = true;
          }
          if (blocked) continue;
        }
      } else {
        // Attack geometry also describes non-pawn ordinary movement to empty squares.
        if (!attacks(game, to, side, new Set(), p.square, giants)) continue;
      }
      const promotions: (PieceSymbol | undefined)[] =
        p.type === "p" && (to[1] === "1" || to[1] === "8")
          ? ["q", "r", "b", "n"]
          : [undefined];
      for (const promotion of promotions) {
        const next = new Chess(game.fen());
        next.remove(p.square);
        next.remove(to);
        if (ep) next.remove(ep);
        next.put({ type: promotion ?? p.type, color: side }, to);
        if (rookFrom && rookTo) {
          next.remove(rookFrom);
          next.put({ type: "r", color: side }, rookTo);
        }
        const nextCannons = movedCannons(cannons, p.square, to);
        if (!resolve && inCheck(next, side, nextCannons, giants)) continue;
        const f = [...fields];
        f[0] = next.fen().split(" ")[0];
        f[1] = enemy;
        if (p.type === "k")
          f[2] = f[2].replace(side === "w" ? /[KQ]/g : /[kq]/g, "");
        for (const [sq, right] of [
          ["a1", "Q"],
          ["h1", "K"],
          ["a8", "q"],
          ["h8", "k"],
        ])
          if (p.square === sq || to === sq) f[2] = f[2].replace(right, "");
        f[2] ||= "-";
        f[3] =
          flags === "b"
            ? p.square[0] + (Number(p.square[1]) + (side === "w" ? 1 : -1))
            : "-";
        f[4] = p.type === "p" || victim || ep ? "0" : String(Number(f[4]) + 1);
        if (side === "b") f[5] = String(Number(f[5]) + 1);
        const move = Object.assign(Object.create(Move.prototype) as Move, {
          color: side,
          from: p.square,
          to,
          piece: p.type,
          captured: ep ? "p" : victim?.type,
          promotion,
          flags: flags + (promotion ? "p" : ""),
          before: game.fen(),
          after: f.join(" "),
          lan: p.square + to + (promotion ?? ""),
          san:
            (cannons.has(p.square) ? "炮" : p.type.toUpperCase()) +
            p.square +
            (victim || ep ? "x" : "-") +
            to +
            (promotion ? "=" + promotion.toUpperCase() : ""),
        });
        if (resolve) {
          const after = resolve(move);
          if (!after) continue;
          move.after = after;
        }
        moves.push(move);
      }
    }
  }
  return moves;
}
