import type { CSSProperties } from "react";
import ChessPiece from "./ChessPiece";
import { cinemaCopy, type Beat, type CinemaShow } from "./cinema";

type Box = { left: number; top: number; width: number; height: number; zIndex?: number };

/**
 * Letterbox, vignette, rays, strobe and title around a board-camera finisher.
 * Fixed to the viewport on purpose: only the board is filmed, so the frame
 * furniture must not zoom with it.
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
      role="dialog"
      aria-label="运镜大招"
      onClick={onSkip}
    >
      <div className="cinema-vignette" />
      <div className="cinema-rays" />
      <div className="cinema-strobe" />
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

const place = (b: Box): CSSProperties => ({
  left: b.left,
  top: b.top,
  width: b.width,
  height: b.height,
});

/**
 * The close-up cast, laid out in the board's own space so it rides the camera:
 * the promoting pawn cross-fading into its new piece, or the mating piece and
 * the king it is about to cut in two. The real pieces on these squares are
 * hidden for the length of the shot.
 */
export function CinemaPieces({
  show,
  beat,
  hero,
  victim,
}: {
  show: CinemaShow;
  beat: Beat;
  hero: Box;
  victim?: Box;
}) {
  const loser = show.by === "w" ? "b" : "w";
  return (
    <div
      className={`cinema-pieces cinema-${show.kind}`}
      data-phase={beat.phase}
      data-swapped={beat.swapped}
      data-slain={beat.slain}
      aria-hidden="true"
    >
      <div className="cinema-hero" data-role="hero" style={place(hero)}>
        <span className="hero-lift">
          <span className="hero-art old">
            <ChessPiece type={show.hero} color={show.by} />
          </span>
          {show.promo && (
            <span className="hero-art new">
              <ChessPiece type={show.promo} color={show.by} />
            </span>
          )}
        </span>
      </div>
      {victim && (
        <div className="cinema-hero" data-role="victim" style={place(victim)}>
          <span className="hero-lift">
            {/* Two clipped copies read as one king until the blade parts them. */}
            <span className="hero-art half top">
              <ChessPiece type="k" color={loser} />
            </span>
            <span className="hero-art half bottom">
              <ChessPiece type="k" color={loser} />
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
