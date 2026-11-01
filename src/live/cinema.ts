/** Board-camera finishers: a promotion close-up, a king's execution and two reactions. */
export type CinemaKind = "promotion" | "checkmate" | "obelisk" | "tingqiao";
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
  // obelisk
  | "emerge"
  // tingqiao
  | "counter"
  | "rebound"
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
  /** The mated king's square, or the counter-broken attacker's square. */
  victim?: string;
  /** The counter-broken attacker's piece type (tingqiao), when it matters. */
  victimType?: string;
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
  obelisk: { sub: "OBELISK", tag: "巨神兵", caption: "欧贝利斯克 · 降临" },
  tingqiao: { sub: "TINGQIAO", tag: "听桥", caption: "以静制动 · 反击" },
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
  if (kind === "obelisk")
    return [
      // The soft dolly already framed the front; the giant grows out of the floor.
      { phase: "ascend", ms: 1700, cue: "emerge" },
      { phase: "reveal", ms: 900 },
      { phase: "out", ms: 820, cue: "settle" },
    ];
  if (kind === "tingqiao")
    return [
      // Snap to the guardian, then rebound the attacker off its hidden counter.
      { phase: "charge", ms: 420, cue: "counter" },
      { phase: "strobe", ms: 860, cue: "rebound" },
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
