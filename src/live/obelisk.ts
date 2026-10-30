import { Chess, Move, SQUARES, type Square, type Color } from "chess.js";
export type Obelisk = {
  color: Color;
  shields: number;
  origin: "summon-item" | "other";
};
export type Giants = Map<Square, Obelisk>;
export function footprint(anchor: Square): Square[] {
  const x = anchor.charCodeAt(0) - 97,
    y = Number(anchor[1]);
  if (x < 0 || x > 6 || y < 1 || y > 7) return [];
  return [
    anchor,
    (String.fromCharCode(98 + x) + y) as Square,
    (anchor[0] + (y + 1)) as Square,
    (String.fromCharCode(98 + x) + (y + 1)) as Square,
  ];
}
export function giantAt(giants: Giants, square: Square): Square | undefined {
  for (const anchor of giants.keys())
    if (footprint(anchor).includes(square)) return anchor;
}
export function unitSquares(game: Chess, giants: Giants): Square[] {
  return game
    .board()
    .flat()
    .flatMap((p) =>
      p && (!giantAt(giants, p.square) || giants.has(p.square))
        ? [p.square]
        : [],
    );
}
export function tributeGroups(
  game: Chess,
  giants: Giants,
  color: Color,
  count: number,
  exclude?: Square,
): Square[][] {
  const units = unitSquares(game, giants).filter(
    (s) =>
      s !== exclude &&
      game.get(s)?.color === color &&
      game.get(s)?.type !== "k",
  );
  const groups: Square[][] = [];
  function visit(start: number, chosen: Square[]) {
    if (chosen.length === count) {
      groups.push(chosen);
      return;
    }
    for (let i = start; i <= units.length - (count - chosen.length); i++)
      visit(i + 1, [...chosen, units[i]]);
  }
  visit(0, []);
  return groups;
}
export function summonPlans(
  game: Chess,
  giants: Giants,
  craters: Set<Square>,
  color: Color,
): { sacrifices: Square[]; targets: Square[] }[] {
  return tributeGroups(game, giants, color, 3).flatMap((sacrifices) => {
    const removed = new Set(
      sacrifices.flatMap((s) => (giants.has(s) ? footprint(s) : [s])),
    );
    const targets = SQUARES.filter((s) => {
      const cells = footprint(s);
      return (
        cells.length === 4 &&
        cells.every(
          (c) =>
            (color === "b" ? Number(c[1]) >= 5 : Number(c[1]) <= 4) &&
            !craters.has(c) &&
            (!game.get(c) || removed.has(c)),
        )
      );
    });
    return targets.length ? [{ sacrifices, targets }] : [];
  });
}
export function giantThreatens(anchor: Square, target: Square): boolean {
  return (
    !footprint(anchor).includes(target) &&
    footprint(anchor).some(
      (s) =>
        Math.max(
          Math.abs(s.charCodeAt(0) - target.charCodeAt(0)),
          Math.abs(Number(s[1]) - Number(target[1])),
        ) === 1,
    )
  );
}
export function skillRows(anchor: Square, color: Color): number[] {
  const front = Number(anchor[1]) + (color === "w" ? 1 : 0);
  return [front, front + (color === "w" ? 1 : -1)].filter(
    (r) => r >= 1 && r <= 8,
  );
}
export function giantMoves(
  game: Chess,
  giants: Giants,
  craters: Set<Square>,
): Move[] {
  const result: Move[] = [];
  for (const [from, giant] of giants) {
    if (giant.color !== game.turn()) continue;
    for (const to of SQUARES) {
      if (
        from === to ||
        Math.max(
          Math.abs(from.charCodeAt(0) - to.charCodeAt(0)),
          Math.abs(Number(from[1]) - Number(to[1])),
        ) !== 1
      )
        continue;
      const cells = footprint(to);
      if (cells.length !== 4) continue;
      const old = footprint(from);
      if (
        cells.some(
          (s) =>
            craters.has(s) ||
            (!old.includes(s) &&
              (game.get(s)?.color === giant.color ||
                game.get(s)?.type === "k")),
        )
      )
        continue;
      const victim = cells.find((s) => !old.includes(s) && game.get(s));
      result.push(
        Object.assign(Object.create(Move.prototype) as Move, {
          color: giant.color,
          from,
          to,
          piece: "r",
          captured: victim ? game.get(victim)?.type : undefined,
          flags: victim ? "c" : "n",
          san: `巨神兵${from}→${to}`,
          lan: from + to,
          before: game.fen(),
          after: game.fen(),
        }),
      );
    }
  }
  return result;
}
