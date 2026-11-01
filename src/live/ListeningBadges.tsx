import ItemSprite from "./ItemSprite";
import type { Listening } from "./tingqiao";
export default function ListeningBadges({
  skills,
  project,
  viewerColor,
}: {
  skills: [string, Listening][];
  viewerColor: "w" | "b";
  project: (x: number, y: number) => { x: number; y: number; width: number };
}) {
  return (
    <>
      {skills.filter(([, state]) => state.color === viewerColor).map(([square, state]) => {
        const p = project(
          (square.charCodeAt(0) - 97) * 12.5 + 6.25,
          (8 - Number(square[1])) * 12.5 + 6.25,
        );
        const ready = !state.cooldown;
        const label = `听桥 · ${ready ? "就绪" : `冷却${Math.ceil(state.cooldown / 2)}回合`}`;
        return (
          <span
            key={square}
            className={"listening-badge" + (ready ? " ready" : " cooling")}
            title={label}
            aria-label={square + " " + label}
            style={{
              left: p.x + p.width * 0.22,
              top: p.y - p.width * 0.12,
              width: p.width * 0.24,
              height: p.width * 0.24,
            }}
          >
            <ItemSprite item="tingqiao-stone" />
            {!ready && (
              <b aria-hidden="true">{Math.ceil(state.cooldown / 2)}</b>
            )}
          </span>
        );
      })}
    </>
  );
}
