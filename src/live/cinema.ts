/** Board-camera finishers: a promotion close-up and a king's execution. */
export type CinemaKind = "promotion" | "checkmate";
export type CinemaPhase =
  | "lead"
  | "charge"
  | "focus"
  | "ascend"
  | "reveal"
  | "confront"
  | "strobe"
  | "kill"
  | "out";
export type Cue =
  // promotion
  | "approach"
  | "crane"
  | "rise"
  | "inhale"
  | "swap"
  // checkmate
  | "stalk"
  | "face"
  | "dread"
  | "slash"
  | "aftermath"
  // both
  | "settle";
export type Step = { phase: CinemaPhase; ms: number; cue?: Cue };
export type CinemaShow = {
  kind: CinemaKind;
  /** Side that delivered it. */
  by: "w" | "b";
  /** Piece type the close-up starts from (a promoting pawn, or the mating piece). */
  hero: string;
  /** Promotion square, or the square of the piece that delivered mate. */
  square: string;
  /** Piece a promoting pawn becomes. */
  promo?: string;
  /** The mated king's square. */
  victim?: string;
  detail?: string;
};
/** What the overlay and the close-up cast are showing right now. */
export type Beat = { phase: CinemaPhase; swapped: boolean; slain: boolean };

export const cinemaCopy: Record<
  CinemaKind,
  { sub: string; tag: string; caption: string }
> = {
  promotion: { sub: "PROMOTION", tag: "升变", caption: "小兵觉醒" },
  checkmate: { sub: "CHECKMATE", tag: "斩杀", caption: "王 · 就此终结" },
};

/**
 * Beat sheet. Each step sets the overlay phase and may fire one cue; camera
 * moves and effects hang off the cue, so these timings alone decide how long
 * the shot runs.
 *
 * Promotion: establish, crane down to the pawn, orbit as it rises, a held
 * breath, then a hard cut to a low hero angle on the new piece.
 * Checkmate: over the attacker's shoulder, a dutch-angled stand-off, a dolly
 * zoom on the king, impact frames as the blade falls, and a slow orbit of the
 * wreck.
 */
export function script(kind: CinemaKind): Step[] {
  if (kind === "promotion")
    return [
      { phase: "charge", ms: 560, cue: "approach" },
      { phase: "focus", ms: 680, cue: "crane" },
      { phase: "ascend", ms: 1300, cue: "rise" },
      { phase: "ascend", ms: 300, cue: "inhale" },
      { phase: "reveal", ms: 1500, cue: "swap" },
      { phase: "out", ms: 820, cue: "settle" },
    ];
  return [
    { phase: "charge", ms: 480, cue: "approach" },
    { phase: "confront", ms: 1100, cue: "stalk" },
    { phase: "confront", ms: 720, cue: "face" },
    { phase: "strobe", ms: 1000, cue: "dread" },
    { phase: "kill", ms: 300, cue: "slash" },
    { phase: "kill", ms: 1050, cue: "aftermath" },
    { phase: "out", ms: 820, cue: "settle" },
  ];
}
export const shotMs = (kind: CinemaKind) =>
  script(kind).reduce((n, s) => n + s.ms, 0);
