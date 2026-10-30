import { bombardmentArea, type Bombardment } from "./bombardment";
import "./bombardment.css";
type Project = (
  x: number,
  y: number,
) => { x: number; y: number; width: number };
export default function BombardmentOverlay({
  shells,
  project,
}: {
  shells: Bombardment[];
  project: Project;
}) {
  if (!shells.length) return null;
  return (
    <div className="bombardment-overlay" aria-label="城防副炮轰炸预警">
      <svg className="bombardment-zones" aria-hidden="true">
        {shells.map((shell, index) => {
          const area = bombardmentArea(shell.target);
          const cells = new Set(
            area.map((s) => s.charCodeAt(0) - 97 + "," + (8 - Number(s[1]))),
          );
          const vertex = (x: number, y: number) => {
            const p = project(x * 12.5, y * 12.5);
            return p.x + "," + p.y;
          };
          return (
            <g
              key={index}
              className={shell.remaining === 1 ? "bombardment-urgent" : ""}
            >
              {area.map((square) => {
                const x = square.charCodeAt(0) - 97,
                  y = 8 - Number(square[1]);
                const corners = [
                  [x, y],
                  [x + 1, y],
                  [x + 1, y + 1],
                  [x, y + 1],
                ];
                const neighbors = [
                  [x, y - 1],
                  [x + 1, y],
                  [x, y + 1],
                  [x - 1, y],
                ];
                return (
                  <g key={square}>
                    <polygon
                      className={
                        square === shell.target
                          ? "bombardment-center"
                          : "bombardment-cell"
                      }
                      points={corners.map(([a, b]) => vertex(a, b)).join(" ")}
                    />
                    {neighbors.map(
                      ([nx, ny], edge) =>
                        !cells.has(nx + "," + ny) && (
                          <polyline
                            key={edge}
                            className="bombardment-border"
                            points={[corners[edge], corners[(edge + 1) % 4]]
                              .map(([a, b]) => vertex(a, b))
                              .join(" ")}
                          />
                        ),
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {shells.map((shell, index) => {
        const p = project(
          (shell.target.charCodeAt(0) - 97) * 12.5 + 6.25,
          (8 - Number(shell.target[1])) * 12.5 + 6.25,
        );
        return (
          <span
            key={index}
            className="bombardment-label"
            style={{ left: p.x, top: p.y - p.width * 0.35 }}
            aria-label={`副炮锁定${shell.target}，剩余${shell.remaining}步`}
          >
            ⌖ {shell.target} · {shell.remaining}步后轰炸
          </span>
        );
      })}
    </div>
  );
}
