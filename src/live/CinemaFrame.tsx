import { cinemaCopy, type Beat, type CinemaShow } from "./cinema";

/**
 * Letterbox, vignette, grain, rays, blade and title around a board-camera
 * finisher. Fixed to the viewport on purpose: only the board is filmed, so the
 * frame furniture must not move with the camera.
 */
export function CinemaFrame({
  show,
  beat,
  onSkip,
}: {
  show: CinemaShow;
  beat: Beat;
  onSkip: () => void;
}) {
  const copy = cinemaCopy[show.kind];
  return (
    <div
      className={`cinema cinema-${show.kind} ${show.by === "b" ? "hers" : "theirs"}`}
      data-cinema={show.kind}
      data-phase={beat.phase}
      data-swapped={beat.swapped}
      role="dialog"
      aria-label="运镜大招"
      onClick={onSkip}
    >
      <div className="cinema-vignette" />
      <div className="cinema-rays" />
      <div className="cinema-grain" />
      {beat.swapped && <div className="cinema-bloom" />}
      {beat.slain && (
        <>
          <div className="cinema-slash" />
          <div className="cinema-bloom" />
        </>
      )}
      <div className="cinema-bars" />
      <div className="cinema-tag">
        <span>{copy.sub}</span>
        <strong>{copy.tag}</strong>
        <em>{show.detail ?? copy.caption}</em>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
      >
        跳过大招
      </button>
    </div>
  );
}
