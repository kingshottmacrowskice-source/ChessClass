import PixelPiece from "./PixelPiece";

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

/** Sidebar movement diagrams. */
export default function RulesPanel() {
  return (
    <section className="rules-board" aria-label="棋子走法">
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
    </section>
  );
}
