import { useEffect, useState } from "react";

export type UltimateKind = "promotion" | "checkmate";
export type UltimateShow = {
  id: number;
  kind: UltimateKind;
  /** Side that delivered it. */
  by: "w" | "b";
  video?: string;
  detail?: string;
};
const CUT_MS = 3400;
const titles: Record<UltimateKind, { big: string; sub: string }> = {
  promotion: { big: "升变！", sub: "PROMOTION" },
  checkmate: { big: "将死！", sub: "CHECKMATE" },
};

/** Full-screen finisher: a supplied video when present, otherwise a pixel cut-in. */
export default function Ultimate({
  show,
  onDone,
}: {
  show: UltimateShow;
  onDone: () => void;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const cutIn = !show.video || videoFailed;
  useEffect(() => {
    if (!cutIn) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onDone, reduced ? 1500 : CUT_MS);
    return () => clearTimeout(t);
  }, [cutIn]);
  if (!cutIn)
    return (
      <div className="ultimate-video" role="dialog" aria-label="大招动画">
        <video
          src={show.video}
          autoPlay
          muted
          playsInline
          onEnded={onDone}
          onError={() => setVideoFailed(true)}
        />
        <button onClick={onDone}>跳过大招</button>
      </div>
    );
  const t = titles[show.kind];
  // Her win, her promotion: triumphant. The audience's finisher: she is the victim.
  const hers = show.by === "b";
  return (
    <div
      className={`ultimate-cut ${show.kind} ${hers ? "hers" : "theirs"}`}
      role="dialog"
      aria-label="大招动画"
      onClick={onDone}
    >
      <div className="cut-lines" />
      <div className="cut-band">
        <img
          className="cut-portrait"
          src="/live/deepseek.png"
          alt=""
          draggable={false}
        />
        <div className="cut-text">
          <span className="cut-sub">{t.sub}</span>
          <strong className="cut-big" data-text={t.big}>
            {Array.from(t.big).map((ch, i) => (
              <i key={i} style={{ animationDelay: `${0.35 + i * 0.09}s` }}>
                {ch}
              </i>
            ))}
          </strong>
          <span className="cut-caption">
            {show.detail ??
              (show.kind === "checkmate"
                ? hers
                  ? "大肥鱼 · 终结技"
                  : "观众联军 · 绝杀"
                : hers
                  ? "大肥鱼 · 小兵觉醒"
                  : "观众 · 小兵觉醒")}
          </span>
        </div>
      </div>
      <div className="cut-flash" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        跳过大招
      </button>
    </div>
  );
}
