import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
export type Position = { start: string; moves: string[] };
export type Game = {
  main: Position;
  branch: Position | null;
  cursor: number;
  headers: Record<string, string>;
};
export const initial = (): Game => ({
  main: { start: DEFAULT_POSITION, moves: [] },
  branch: null,
  cursor: 0,
  headers: {},
});
export const active = (g: Game) => g.branch ?? g.main;
export const position = (g: Game): Position => ({
  start: active(g).start,
  moves: active(g).moves.slice(0, g.cursor),
});
export function playUci(c: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
    throw new Error("无效 UCI 着法");
  return c.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
}
export function chess(p: Position) {
  const c = new Chess(p.start);
  p.moves.forEach((m) => playUci(c, m));
  return c;
}
export function move(g: Game, uci: string): Game {
  const p = position(g);
  const c = chess(p);
  if (c.isGameOver()) throw new Error("棋局已经结束");
  playUci(c, uci);
  const next = { ...p, moves: [...p.moves, uci] };
  return g.branch || g.cursor < g.main.moves.length
    ? { ...g, branch: next, cursor: next.moves.length }
    : { ...g, main: next, cursor: next.moves.length };
}
export function importGame(text: string, kind: "FEN" | "PGN"): Game {
  const c = new Chess();
  try {
    kind === "FEN" ? c.load(text.trim()) : c.loadPgn(text.trim());
  } catch {
    throw new Error(`${kind} 格式不正确，请检查棋子、行棋方或棋步。`);
  }
  const h = c.history({ verbose: true });
  return {
    main: {
      start: h[0]?.before ?? c.fen(),
      moves: h.map((m) => m.from + m.to + (m.promotion ?? "")),
    },
    branch: null,
    cursor: h.length,
    headers: kind === "PGN" ? c.getHeaders() : {},
  };
}
export function exportPgn(g: Game) {
  const c = chess(position(g));
  Object.entries(g.headers)
    .filter(([k]) => !["SetUp", "FEN", "Result"].includes(k))
    .forEach(([k, v]) => c.setHeader(k, v));
  return c.pgn();
}
export function status(c: Chess) {
  return c.isCheckmate()
    ? "将杀 · " + (c.turn() === "w" ? "黑" : "白") + "方获胜"
    : c.isStalemate()
      ? "逼和"
      : c.isThreefoldRepetition()
        ? "三次重复 · 和棋"
        : c.isInsufficientMaterial()
          ? "子力不足 · 和棋"
          : c.isDrawByFiftyMoves()
            ? "五十回合规则 · 和棋"
            : (c.turn() === "w" ? "白方" : "黑方") +
              "行棋" +
              (c.isCheck() ? " · 将军" : "");
}
export function line(fen: string, pv: string[]) {
  const c = new Chess(fen);
  return pv.map((u) => {
    const m = playUci(c, u);
    return { uci: u, san: m.san, fen: c.fen() };
  });
}
export function facts(fen: string, uci: string) {
  const c = new Chess(fen),
    side = c.turn(),
    enemy = side === "w" ? "b" : "w";
  const centers = ["d4", "e4", "d5", "e5"] as Square[];
  const before = centers.filter((s) => c.isAttacked(s, side)).length;
  const protection = (b: Chess) =>
    b
      .board()
      .flat()
      .filter((p) => p?.color === side && b.isAttacked(p.square, side))
      .map((p) => p!.square);
  const old = protection(c);
  const m = playUci(c, uci);
  const now = protection(c);
  return {
    san: m.san,
    capture: m.captured ?? null,
    check: c.isCheck(),
    checkmate: c.isCheckmate(),
    promotion: m.promotion ?? null,
    destinationAttacked: c.isAttacked(m.to, enemy),
    destinationDefended: c.isAttacked(m.to, side),
    directAttacks: c
      .board()
      .flat()
      .filter(
        (p) => p?.color === enemy && c.attackers(p.square, side).includes(m.to),
      )
      .map((p) => p!.square),
    centerControlDelta:
      centers.filter((s) => c.isAttacked(s, side)).length - before,
    newlyProtected: now.filter((s) => !old.includes(s)),
    noLongerProtected: old.filter((s) => !now.includes(s)),
  };
}
