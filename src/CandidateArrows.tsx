import { useId } from "react";
import type { Candidate } from "./core/engine";

export const arrowColors = [
  "#b58022",
  "#247aa0",
  "#925ba4",
  "#377e58",
  "#a35e48",
];
export function squarePoint(square: string, flipped: boolean) {
  const x = (square.charCodeAt(0) - 97) * 100 + 50;
  const y = (8 - Number(square[1])) * 100 + 50;
  return flipped ? { x: 800 - x, y: 800 - y } : { x, y };
}

export default function CandidateArrows({
  candidates,
  flipped,
}: {
  candidates: Candidate[];
  flipped: boolean;
}) {
  const id = useId().replace(/:/g, "");
  // Alternate promotions can share an origin and destination: show one path.
  const unique = candidates.filter(
    (c, i) =>
      !candidates
        .slice(0, i)
        .some((p) => p.pv[0]?.slice(0, 4) === c.pv[0]?.slice(0, 4)),
  );
  return (
    <svg className="candidate-arrows" viewBox="0 0 800 800" aria-hidden="true">
      <defs>
        {unique.map((c) => (
          <marker
            key={c.rank}
            id={`${id}-${c.rank}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={c.rank === 1 ? 3.2 : 4.2}
            markerHeight={c.rank === 1 ? 3.2 : 4.2}
            orient="auto"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill={arrowColors[(c.rank - 1) % arrowColors.length]}
            />
          </marker>
        ))}
      </defs>
      {[...unique].reverse().map((c) => {
        const u = c.pv[0];
        if (!u) return null;
        const a = squarePoint(u.slice(0, 2), flipped),
          b = squarePoint(u.slice(2, 4), flipped);
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy);
        return (
          <line
            key={c.rank}
            data-rank={c.rank}
            data-move={u}
            x1={a.x}
            y1={a.y}
            x2={b.x - (dx / length) * 15}
            y2={b.y - (dy / length) * 15}
            stroke={arrowColors[(c.rank - 1) % arrowColors.length]}
            strokeWidth={c.rank === 1 ? 14 : 5}
            strokeLinecap="round"
            opacity={c.rank === 1 ? 0.85 : 0.78}
            markerEnd={`url(#${id}-${c.rank})`}
          />
        );
      })}
    </svg>
  );
}
