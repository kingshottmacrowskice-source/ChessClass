import PixelPiece from "./PixelPiece";
import { explainSan } from "./lines";

// 5×5 movement diagrams: P piece, o can move/capture, m move only, x capture only, . empty.
const pieces = [
  {
    type: "k",
    name: "王",
    letter: "K",
    rule: "任意方向一格，不能走进被攻击的格。",
    grid: [".....", ".ooo.", ".oPo.", ".ooo.", "....."],
  },
  {
    type: "q",
    name: "后",
    letter: "Q",
    rule: "横、竖、斜走任意格，最强棋子。",
    grid: ["o.o.o", ".ooo.", "ooPoo", ".ooo.", "o.o.o"],
  },
  {
    type: "r",
    name: "车",
    letter: "R",
    rule: "横竖走任意格，不能越子。",
    grid: ["..o..", "..o..", "ooPoo", "..o..", "..o.."],
  },
  {
    type: "b",
    name: "象",
    letter: "B",
    rule: "斜走任意格，永远在同色格。",
    grid: ["o...o", ".o.o.", "..P..", ".o.o.", "o...o"],
  },
  {
    type: "n",
    name: "马",
    letter: "N",
    rule: "走“日”字，可以跳过棋子。",
    grid: [".o.o.", "o...o", "..P..", "o...o", ".o.o."],
  },
  {
    type: "p",
    name: "兵",
    letter: "",
    rule: "直走斜吃，首步可走两格，到底升变。",
    grid: ["..m..", ".xmx.", "..P..", ".....", "....."],
  },
];

function Diagram({ type, grid }: { type: string; grid: string[] }) {
  return (
    <div className="rule-grid" aria-hidden="true">
      {grid.flatMap((row, r) =>
        [...row].map((c, col) => (
          <span
            key={r * 5 + col}
            className={
              ((r + col) % 2 ? "d" : "l") +
              (c === "o" || c === "m"
                ? " mv"
                : c === "x"
                  ? " cap"
                  : c === "P"
                    ? " me"
                    : "")
            }
          >
            {c === "P" && <PixelPiece type={type} color="b" />}
          </span>
        )),
      )}
    </div>
  );
}

/** Sidebar cheat sheet: how each piece moves, how to vote, and how to read the last move. */
export default function RulesPanel({ lastSan }: { lastSan?: string }) {
  return (
    <section className="rules-board" aria-label="走棋规则与投票方法">
      <h2>棋子怎么走</h2>
      <ul className="rules-pieces">
        {pieces.map((p) => (
          <li key={p.type} className="rule-card">
            <Diagram type={p.type} grid={p.grid} />
            <div className="rule-text">
              <b>
                {p.name}
                {p.letter && <code>{p.letter}</code>}
              </b>
              <p>{p.rule}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="rule-legend">
        <i className="mv" /> 可以走 <i className="cap" /> 只能吃子
      </p>
      <h2>怎么投票</h2>
      <ul className="vote-howto">
        <li>
          弹幕说出想走的棋就行：<code>e4</code>、<code>马跳f3</code>、
          <code>王前兵走两格</code>都能听懂。
        </li>
        <li>
          每人每轮一票，走法和投降共用票数。开启 AI 后，由 AI
          判断弹幕是否明确支持投降。
        </li>
        <li>
          最高票决定结果，同票时投降排在所有走法之后：走法等 10 秒，投降等 1
          分钟，整轮最长 5 分钟。
        </li>
        <li>
          给当前领先项加票不重置倒计时；投其他项会重置。平票先获票者优先。
        </li>
        <li>棋盘箭头显示走法票数，红色★表示当前领先。</li>
      </ul>
      <p className="notation-live" aria-live="polite">
        {lastSan ? (
          <>
            刚才 <code>{lastSan}</code>：{explainSan(lastSan)}
          </>
        ) : (
          <>
            棋谱 <code>Nxe5+</code>：{explainSan("Nxe5+")}
          </>
        )}
      </p>
    </section>
  );
}
