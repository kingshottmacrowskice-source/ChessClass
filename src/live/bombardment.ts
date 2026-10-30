import { Chess, SQUARES, type Color, type Move, type Square } from "chess.js";
export type Bombardment = {
  target: Square;
  color: Color;
  remaining: number;
  tracking: boolean;
};
export type BombardmentEvent = {
  target: Square;
  squares: Square[];
  destroyed: Square[];
};
/** Center plus twelve neighbors in a radius-two diamond, clipped at edges. */
export function bombardmentArea(center: Square): Square[] {
  return SQUARES.filter(
    (s) =>
      Math.abs(s.charCodeAt(0) - center.charCodeAt(0)) +
        Math.abs(Number(s[1]) - Number(center[1])) <=
      2,
  );
}
/** Update identities before effects; a captured target must not attach to its captor. */
export function advanceBombardments(
  shells: Bombardment[],
  before: Chess,
  after: Chess,
  movement?: { from: Square; to: Square },
  move?: Move,
): void {
  for (const shell of shells) {
    shell.remaining--;
    if (!shell.tracking) continue;
    const old = shell.target;
    if (movement?.from === old) shell.target = movement.to;
    else if (move?.isKingsideCastle() || move?.isQueensideCastle()) {
      const rookFrom = (move.isKingsideCastle() ? "h" : "a") + move.from[1];
      if (old === rookFrom)
        shell.target = ((move.isKingsideCastle() ? "f" : "d") +
          move.from[1]) as Square;
    }
    if (
      before.get(old)?.color !== shell.color ||
      after.get(shell.target)?.color !== shell.color
    )
      shell.tracking = false;
  }
}
