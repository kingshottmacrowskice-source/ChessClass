import { useEffect, useState } from "react";
import Sprite from "./Sprite";
import ChessPiece from "./ChessPiece";
import { frameAt, rowOf } from "./actions";

export type Emote = { id: number; text: string; tone?: "alert" | "happy" | "sleep" | "angry" };

/** The on-board character. Owns its own frame clock so the page does not re-render per frame.
 *  Speech bubbles are rendered by the caller as a separate top-layer overlay. */
export default function Actor({
  at,
  pose,
  cue,
  holdFrame,
  facing,
  moving,
  carried,
  emote,
}: {
  at: { x: number; y: number; width: number };
  pose: string;
  /** Changing this restarts the current clip from frame 1. */
  cue: number;
  holdFrame?: number;
  facing: number;
  moving: boolean;
  carried: string;
  emote: Emote | null;
}) {
  const row = rowOf(pose);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (holdFrame !== undefined) {
      setFrame(holdFrame);
      return;
    }
    const start = performance.now();
    setFrame(frameAt(row, 0));
    const t = setInterval(
      () => setFrame(frameAt(row, performance.now() - start)),
      35,
    );
    return () => clearInterval(t);
  }, [row, cue, holdFrame]);
  return (
    <div
      className={"deepseek-actor " + pose}
      data-moving={moving}
      data-pose={pose}
      style={{
        left: at.x,
        top: at.y,
        width: at.width * 0.9,
        height: at.width * 1.125,
        zIndex: Math.round(at.y * 10),
      }}
    >
      {emote && (
        <b key={emote.id} className={"actor-emote " + (emote.tone || "")}>
          {emote.text}
        </b>
      )}
      {carried && (
        <b className="carried-piece">
          <ChessPiece type={carried} />
        </b>
      )}
      <Sprite frame={frame} row={row} facing={facing} />
      <span className="actor-shadow" />
    </div>
  );
}
