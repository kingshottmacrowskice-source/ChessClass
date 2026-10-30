import type { Giants } from "./obelisk";
export default function GiantOverlay({
  giants,
  project,
}: {
  giants: Giants;
  project: (x: number, y: number) => { x: number; y: number; width: number };
}) {
  return (
    <>
      {[...giants].map(([anchor, unit]) => {
        const x = (anchor.charCodeAt(0) - 97) * 12.5,
          y = (7 - Number(anchor[1])) * 12.5;
        const corners = [
          [x, y],
          [x + 25, y],
          [x + 25, y + 25],
          [x, y + 25],
        ].map(([a, b]) => project(a, b));
        const center = project(x + 12.5, y + 25);
        return (
          <div
            key={anchor}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 14,
            }}
          >
            <svg
              style={{ width: "100%", height: "100%", overflow: "visible" }}
              aria-hidden="true"
            >
              <polygon
                points={corners.map((p) => p.x + "," + p.y).join(" ")}
                fill={unit.shields ? "#61bdff22" : "transparent"}
                stroke={unit.shields ? "#8edfff" : "#6b7c8f"}
                strokeWidth="2"
                strokeDasharray={unit.shields ? undefined : "5 3"}
              />
            </svg>
            <span
              aria-label={`欧贝利斯克 护盾${unit.shields}点`}
              style={{
                position: "absolute",
                left: center.x,
                top: center.y,
                transform: "translate(-50%,-50%)",
                background: "#142a50",
                color: "#b8edff",
                padding: "3px 7px",
                border: "1px solid #67bcf2",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              巨神兵 · 护盾 {unit.shields}/2
            </span>
          </div>
        );
      })}
    </>
  );
}
