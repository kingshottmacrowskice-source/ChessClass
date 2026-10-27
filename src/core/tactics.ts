import { Chess } from "chess.js";
import { playUci } from "./game";
function fromMoves(moves: string[]) {
  const c = new Chess();
  moves.forEach((m) => playUci(c, m));
  return { start: new Chess().fen(), moves, fen: c.fen() };
}
export const tactics = [
  {
    id: "mate-in-one",
    name: "一步将杀",
    fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    moves: [],
    proof: ["f7g7"],
    expected: "末局面将杀；允许引擎选择其他一步杀",
    method: "规则回放 + 引擎 mate 评分",
  },
  {
    id: "missed-mate",
    name: "漏防将杀",
    ...fromMoves(["f2f3", "e7e5"]),
    proof: ["g2g4", "d8h4"],
    expected: "g4 后 Qh4#，不能用泛泛王安全描述代替此变化",
    method: "规则回放将杀 + 实际根搜索",
  },
  {
    id: "queen-loss",
    name: "丢后",
    ...fromMoves(["e2e4", "e7e5", "d1h5", "b8c6"]),
    proof: ["h5e5", "c6e5"],
    expected: "Qxe5? Nxe5，白后被马吃；白仅取得一兵",
    method: "规则捕获字段 + 引擎变化",
  },
  {
    id: "pinned-knight",
    name: "被钉住的马",
    fen: "4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1",
    moves: [],
    proof: [],
    illegal: "e2c3",
    expected: "Ne2 不能离开 e 线暴露己王",
    method: "规则拒绝非法移动",
  },
  {
    id: "legal-sacrifice",
    name: "合法弃子与具体补偿",
    ...fromMoves([
      "e2e4",
      "e7e5",
      "g1f3",
      "d7d6",
      "f1c4",
      "c8g4",
      "b1c3",
      "g7g6",
    ]),
    proof: ["f3e5", "g4d1", "c4f7", "e8e7", "c3d5"],
    expected: "Nxe5 后若黑方贪后 Bxd1，可 Bxf7+ Ke7 Nd5#；不宣称黑方必须吃后",
    method: "条件变化合法回放将杀；引擎另检查更好防守",
  },
  {
    id: "quiet-move",
    name: "安静走法",
    ...fromMoves(["e2e4", "e7e5", "g1f3", "b8c6"]),
    proof: ["d2d3"],
    expected: "d3 合法且无吃子、无将军；不强行制造优缺点",
    method: "规则事实 + 引擎比较",
  },
  {
    id: "best-without-drawback",
    name: "无明显缺点的最佳着法",
    fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    moves: [],
    proof: ["f7g7"],
    expected: "立即将杀，不应虚构缺点；不固定唯一最佳 SAN",
    method: "将杀事实；模型 drawback 可为空",
  },
];
