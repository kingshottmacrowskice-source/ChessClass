import type { Move } from "chess.js";

export const MOVE_MS = 480;
export const easeMove = (t: number) => {
  const p = Math.max(0, Math.min(1, t));
  return p * p * (3 - 2 * p);
};

// The king is carried by the actor; the rook still needs to move on the board.
export function movingFrom(move: Move | null, square: string): string | null {
  if (!move) return null;
  if (square === move.to && move.color === "w") return move.from;
  const rank = move.from[1];
  if (move.isKingsideCastle() && square === `f${rank}`) return `h${rank}`;
  if (move.isQueensideCastle() && square === `d${rank}`) return `a${rank}`;
  return null;
}
