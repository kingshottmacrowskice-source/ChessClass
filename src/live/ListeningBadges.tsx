import type { Listening } from "./tingqiao";
export default function ListeningBadges({
  skills,
  project,
}: {
  skills: [string, Listening][];
  project: (x: number, y: number) => { x: number; y: number; width: number };
}) {
  return (
    <>
      {skills.map(([square, state]) => {
        const p = project(
          (square.charCodeAt(0) - 97) * 12.5 + 6.25,
          (8 - Number(square[1])) * 12.5 + 6.25,
        );
        const label = state.cooldown
          ? `听桥 · 冷却${Math.ceil(state.cooldown / 2)}回合`
          : "听桥 · 就绪";
        return (
          <span
            key={square}
            title={label}
            aria-label={square + " " + label}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y + p.width * 0.25,
              transform: "translateX(-50%)",
              zIndex: 16,
              pointerEvents: "none",
              background: state.cooldown ? "#363645" : "#174d59",
              color: "#bcffff",
              border: "1px solid #72d9ef",
              fontSize: 12,
              padding: "2px 4px",
              whiteSpace: "nowrap",
            }}
          >
            {state.cooldown
              ? `听桥 ${Math.ceil(state.cooldown / 2)}`
              : "听桥 ✦"}
          </span>
        );
      })}
    </>
  );
}
