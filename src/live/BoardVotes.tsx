import { useId } from "react";
import { SURRENDER } from "./core";

type Project = (
  x: number,
  y: number,
) => { x: number; y: number; width: number };
export default function BoardVotes({
  tally,
  project,
}: {
  tally: [string, number][];
  project: Project;
}) {
  const id = useId().replace(/:/g, "");
  const at = (square: string) =>
    project(
      (square.charCodeAt(0) - 97) * 12.5 + 6.25,
      (8 - Number(square[1])) * 12.5 + 6.25,
    );
  const routes = tally
    .map(([move, count], rank) => ({ move, count, rank }))
    .filter(({ move }) => move !== SURRENDER)
    .map(({ move, count, rank }) => {
      const from = at(move.slice(0, 2)),
        to = at(move.slice(2, 4));
      // Separate promotion variants sharing exactly the same start/end squares.
      const shared = tally.filter(([m]) => m.slice(0, 4) === move.slice(0, 4));
      const lane =
        shared.findIndex(([m]) => m === move) - (shared.length - 1) / 2;
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const cx = (from.x + to.x) / 2 - ((to.y - from.y) / length) * lane * 40;
      const cy = (from.y + to.y) / 2 + ((to.x - from.x) / length) * lane * 40;
      return {
        move,
        count,
        leading: rank === 0,
        from,
        to,
        cx,
        cy,
        x: (from.x + 2 * cx + to.x) / 4,
        y: (from.y + 2 * cy + to.y) / 4,
      };
    })
    .reverse();
  return (
    <>
      <svg className="board-vote-lines" aria-hidden="true">
        <defs>
          {[false, true].map((leading) => (
            <marker
              key={String(leading)}
              id={`${id}-${leading}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path
                d="M1 1 L9 5 L1 9Z"
                fill={leading ? "#a13e32" : "#2e4a3f"}
              />
            </marker>
          ))}
        </defs>
        {routes.map((route) => (
          <path
            key={route.move}
            data-vote-line={route.move}
            className={route.leading ? "vote-line leading" : "vote-line"}
            d={`M${route.from.x},${route.from.y} Q${route.cx},${route.cy} ${route.to.x},${route.to.y}`}
            markerEnd={`url(#${id}-${route.leading})`}
          />
        ))}
      </svg>
      <div className="board-vote-counts" role="group" aria-label="棋盘投票结果">
        {routes.map((route) => (
          <span
            key={route.move}
            data-vote={route.move}
            data-leading={route.leading}
            className={route.leading ? "board-vote leading" : "board-vote"}
            style={{ left: route.x, top: route.y }}
            role="img"
            aria-label={`${route.move}，${route.count}票${route.leading ? "，当前第一名" : ""}`}
            title={`${route.move} · ${route.count}票${route.leading ? " · 当前第一名" : ""}`}
          >
            {route.leading && <span aria-hidden="true">★ </span>}
            {route.count}
            {route.move.length === 5 && (
              <small>{route.move[4].toUpperCase()}</small>
            )}
          </span>
        ))}
      </div>
    </>
  );
}
