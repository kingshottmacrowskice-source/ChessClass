import { Chess, SQUARES, type Square, type PieceSymbol } from "chess.js";

export type DemonKind = "destroy" | "movement" | "item" | "skill";
export type DemonAction = {
  item?:
    | "doom-shroom"
    | "monster-reborn"
    | "summon-cannon"
    | "tingqiao-stone"
    | "londinium-artillery"
    | "summon-obelisk";
  skill?: "obelisk-fury";
  giant?: boolean;
  sacrifices?: Square[];
  baseAfter?: string;
  cannon?: boolean;
  kind: DemonKind;
  before: string;
  after: string;
  target: Square;
  from?: Square;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  rule?: "q" | "n";
  label: string;
};
/** Register future items/active skills here; unavailable providers never enter the draw. */
export type DemonProvider = {
  kind: DemonKind;
  candidates: (
    game: Chess,
    lost?: readonly (PieceSymbol | "c")[],
    check?: (game: Chess) => boolean,
  ) => DemonAction[];
};
const names = { c: "炮", p: "兵", n: "马", b: "象", r: "车", q: "后", k: "王" };

function result(
  game: Chess,
  target: Square,
  from?: Square,
  check = (g: Chess) => g.isCheck(),
): string | undefined {
  const c = new Chess(game.fen());
  const original = from ? c.get(from) : undefined;
  // A black pawn cannot remain a pawn on its own back rank in a standard FEN.
  if (original?.type === "p" && target[1] === "8") return;
  const captured = c.get(target);
  if (captured?.type === "k" || (from && captured?.color === "b")) return;
  c.remove(target);
  if (from && original) {
    c.remove(from);
    c.put(
      {
        color: "b",
        type: original.type === "p" && target[1] === "1" ? "q" : original.type,
      },
      target,
    );
  }
  // Keep original castling rights except those invalidated by a moved/destroyed rook.
  const fields = game.fen().split(" ");
  fields[0] = c.fen().split(" ")[0];
  for (const [square, right] of [
    ["a1", "Q"],
    ["h1", "K"],
    ["a8", "q"],
    ["h8", "k"],
  ]) {
    if (target === square || from === square)
      fields[2] = fields[2].replace(right, "");
  }
  fields[2] ||= "-";
  fields[3] = "-";
  fields[4] =
    captured || original?.type === "p" ? "0" : String(Number(fields[4]) + 1);
  // Check the black king before handing the turn to the audience.
  const safety = new Chess(fields.join(" "));
  if (check(safety)) return;
  fields[1] = "w";
  fields[5] = String(Number(fields[5]) + 1);
  return fields.join(" ");
}

export function destroyCandidates(
  game: Chess,
  _lost?: readonly (PieceSymbol | "c")[],
  check = (g: Chess) => g.isCheck(),
): DemonAction[] {
  if (game.turn() !== "b") return [];
  return game
    .board()
    .flat()
    .flatMap((p) => {
      if (!p || p.color !== "w" || p.type === "k") return [];
      const after = result(game, p.square, undefined, check);
      return after
        ? [
            {
              kind: "destroy" as const,
              before: game.fen(),
              after,
              target: p.square,
              piece: p.type,
              captured: p.type,
              label: `魔鱼破坏 · ${p.square} ${names[p.type]}`,
            },
          ]
        : [];
    });
}

export function movementCandidates(
  game: Chess,
  _lost?: readonly (PieceSymbol | "c")[],
  check = (g: Chess) => g.isCheck(),
): DemonAction[] {
  if (game.turn() !== "b") return [];
  const actions: DemonAction[] = [];
  const ordinary = new Set(
    game.moves({ verbose: true }).map((m) => m.from + m.to),
  );
  for (const p of game.board().flat()) {
    if (!p || p.color !== "b" || p.type === "k") continue;
    for (const target of SQUARES) {
      if (target === p.square || ordinary.has(p.square + target)) continue;
      const dx = target.charCodeAt(0) - p.square.charCodeAt(0);
      const dy = Number(target[1]) - Number(p.square[1]);
      let rule: "q" | "n";
      if (Math.abs(dx * dy) === 2) rule = "n";
      else if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
        rule = "q";
        let blocked = false;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        for (let i = 1; i < steps; i++) {
          const square = (String.fromCharCode(
            p.square.charCodeAt(0) + Math.sign(dx) * i,
          ) +
            (Number(p.square[1]) + Math.sign(dy) * i)) as Square;
          if (game.get(square)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
      } else continue;
      const after = result(game, target, p.square, check);
      if (after)
        actions.push({
          kind: "movement",
          before: game.fen(),
          after,
          from: p.square,
          target,
          piece: p.type,
          captured: game.get(target)?.type,
          rule,
          label: `魔鱼移形 · ${names[p.type]}按${names[rule]}走 ${p.square}→${target}${p.type === "p" && target[1] === "1" ? "，升变为后" : ""}`,
        });
    }
  }
  return actions;
}

export const demonProviders: DemonProvider[] = [
  { kind: "destroy", candidates: destroyCandidates },
  { kind: "movement", candidates: movementCandidates },
  { kind: "item", candidates: doomCandidates },
  { kind: "item", candidates: rebornCandidates },
  { kind: "item", candidates: summonCannonCandidates },
  { kind: "item", candidates: artilleryCandidates },
  { kind: "skill", candidates: () => [] },
];

export function doomCandidates(
  game: Chess,
  _lost?: readonly (PieceSymbol | "c")[],
  check = (g: Chess) => g.isCheck(),
): DemonAction[] {
  if (game.turn() !== "b") return [];
  return SQUARES.filter((s) => Number(s[1]) >= 5 && !game.get(s)).flatMap(
    (target) => {
      const copy = new Chess(game.fen());
      for (const square of SQUARES) {
        const d =
          Math.abs(square.charCodeAt(0) - target.charCodeAt(0)) +
          Math.abs(Number(square[1]) - Number(target[1]));
        if (
          d > 0 &&
          d <= 2 &&
          copy.get(square)?.color === "w" &&
          copy.get(square)?.type !== "k"
        )
          copy.remove(square);
      }
      if (check(copy)) return [];
      const fields = copy.fen().split(" ");
      fields[1] = "w";
      fields[3] = "-";
      fields[4] = "0";
      fields[5] = String(Number(fields[5]) + 1);
      return [
        {
          kind: "item" as const,
          item: "doom-shroom" as const,
          before: game.fen(),
          after: fields.join(" "),
          target,
          piece: "p" as const,
          label: `毁灭菇 · ${target}`,
        },
      ];
    },
  );
}

/** Only actually captured pieces are eligible; promotion is not a loss. */
export function rebornCandidates(
  game: Chess,
  lost: readonly (PieceSymbol | "c")[] = [],
  check = (g: Chess) => g.isCheck(),
): DemonAction[] {
  if (game.turn() !== "b") return [];
  return SQUARES.filter(
    (target) => Number(target[1]) >= 5 && !game.get(target),
  ).flatMap((target) =>
    [...new Set(lost)]
      .filter((piece) => piece !== "k" && !(piece === "p" && target[1] === "8"))
      .flatMap((piece) => {
        const copy = new Chess(game.fen());
        if (
          !copy.put(
            { type: piece === "c" ? "r" : piece, color: "b" },
            target,
          ) ||
          check(copy)
        )
          return [];
        const fields = game.fen().split(" ");
        fields[0] = copy.fen().split(" ")[0];
        fields[1] = "w";
        fields[3] = "-";
        fields[4] = "0";
        fields[5] = String(Number(fields[5]) + 1);
        return [
          {
            kind: "item" as const,
            item: "monster-reborn" as const,
            before: game.fen(),
            after: fields.join(" "),
            target,
            piece: piece === "c" ? ("r" as const) : piece,
            cannon: piece === "c",
            label: `魔法卡·死者苏生 · ${target} 复活${names[piece]}`,
          },
        ];
      }),
  );
}

export function summonCannonCandidates(
  game: Chess,
  _lost?: readonly (PieceSymbol | "c")[],
  check = (g: Chess) => g.isCheck(),
): DemonAction[] {
  if (game.turn() !== "b") return [];
  return SQUARES.filter((s) => Number(s[1]) >= 5 && !game.get(s)).flatMap(
    (target) => {
      const copy = new Chess(game.fen());
      copy.put({ type: "r", color: "b" }, target);
      if (check(copy)) return [];
      const fields = game.fen().split(" ");
      fields[0] = copy.fen().split(" ")[0];
      fields[1] = "w";
      fields[3] = "-";
      fields[4] = "0";
      fields[5] = String(Number(fields[5]) + 1);
      return [
        {
          kind: "item" as const,
          item: "summon-cannon" as const,
          cannon: true,
          before: game.fen(),
          after: fields.join(" "),
          target,
          piece: "r" as const,
          label: `召唤炮 · ${target}`,
        },
      ];
    },
  );
}

export function artilleryCandidates(game: Chess): DemonAction[] {
  if (game.turn() !== "b") return [];
  const fields = game.fen().split(" ");
  fields[1] = "w";
  fields[3] = "-";
  fields[4] = String(Number(fields[4]) + 1);
  fields[5] = String(Number(fields[5]) + 1);
  return game
    .board()
    .flat()
    .flatMap((p) =>
      p?.color === "w"
        ? [
            {
              kind: "item" as const,
              item: "londinium-artillery" as const,
              before: game.fen(),
              after: fields.join(" "),
              target: p.square,
              piece: p.type,
              label: `伦蒂尼姆城防副炮青春版 · 锁定${p.square} · 3步后轰炸`,
            },
          ]
        : [],
    );
}
