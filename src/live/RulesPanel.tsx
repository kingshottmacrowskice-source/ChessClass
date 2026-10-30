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
export default function RulesPanel({ lastSan, demonMode }: { lastSan?: string; demonMode?: boolean }) {
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
      {demonMode && <p className="rule-legend">召唤炮：在己方半场空格召唤。炮横竖走，不吃子时不能越子；吃子时必须隔着且仅隔着一枚任意方棋子。坑位不能落子，也不算炮架。</p>}
      {demonMode && <p className="rule-legend">攻击与击破：进入攻击范围只是威胁，不造成伤害。群体攻击先统一结算所有目标的防御技能；若攻击源被听桥击破，整次群攻在造成伤害前取消。未中断时再逐个扣护盾，无盾才击破；直接击破绕过护盾，也不触发听桥。听桥仅对敌方来源的实际受击反击，成功击破攻击来源才免伤；没有棋子来源的轰炸、以及友方来源的误伤，都不能被听桥反击。冷却5回合（10次行动）。</p>}
      {demonMode && <p className="rule-legend">欧贝利斯克的巨神兵：随机献祭己方三枚非王棋子，在己方半场召唤，占2×2格，整体沿任意方向走一格。初始护盾2点，每次攻击减1，前两次挡住攻击。主动技能献祭另外两枚己方棋子，攻击前沿所在行及再前方一行的敌人。同次范围攻击只命中它一次。非专属道具召唤的巨神兵在该次行动结束后直接击破。</p>}
      {demonMode && <p className="rule-legend">伦蒂尼姆城防副炮青春版：随机锁定敌方棋子，跟随移动，之后双方共行动3步时轰炸中心及周围12格菱形区域，不分敌我。目标提前阵亡则轰炸最后位置；国王被命中判负，双方国王同时被命中为和棋。</p>}
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
