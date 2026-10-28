/** Board-camera finishers: a promotion close-up and a king's execution. */
import type { Point } from "./motion";

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
  | "charge"
  | "zoom"
  | "float"
  | "glow"
  | "swap"
  | "burst"
  | "face"
  | "clash"
  | "strobe"
  | "tighten"
  | "slash"
  | "shatter"
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

/** Half the finishers are shot on the board; the rest keep the video cut-in. */
export const CINEMA_CHANCE = 0.5;
export const cinemaRoll = (random: () => number = Math.random) =>
  random() < CINEMA_CHANCE;

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
 */
export function script(kind: CinemaKind): Step[] {
  if (kind === "promotion")
    return [
      { phase: "charge", ms: 480, cue: "charge" },
      { phase: "focus", ms: 660, cue: "zoom" },
      { phase: "ascend", ms: 620, cue: "float" },
      { phase: "ascend", ms: 620, cue: "glow" },
      { phase: "reveal", ms: 460, cue: "swap" },
      { phase: "reveal", ms: 640, cue: "burst" },
      { phase: "out", ms: 640, cue: "settle" },
    ];
  return [
    { phase: "charge", ms: 440, cue: "charge" },
    { phase: "confront", ms: 760, cue: "face" },
    { phase: "confront", ms: 640, cue: "clash" },
    { phase: "strobe", ms: 960, cue: "strobe" },
    { phase: "strobe", ms: 300, cue: "tighten" },
    { phase: "kill", ms: 460, cue: "slash" },
    { phase: "kill", ms: 560, cue: "shatter" },
    { phase: "out", ms: 640, cue: "settle" },
  ];
}
export const shotMs = (kind: CinemaKind) =>
  script(kind).reduce((n, s) => n + s.ms, 0);

const clamp = (lo: number, hi: number, v: number) =>
  Math.max(lo, Math.min(hi, v));

/** Push in until one piece fills a good share of the frame. */
export const closeUpZoom = (square: number, view: { w: number; h: number }) =>
  clamp(1.8, 4.2, Math.min((view.h * 0.42) / (square * 0.96), (view.w * 0.38) / square));

/**
 * Frame two pieces facing off: centre between them, roll the camera so they sit
 * closer to level (pieces are upright billboards, so never more than ±14°), and
 * zoom so both fit with a square of air on each side.
 */
export function faceOff(
  a: Point,
  b: Point,
  square: number,
  view: { w: number; h: number },
) {
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const gap = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    rot: clamp(-14, 14, -angle),
    scale: clamp(
      1.3,
      3.4,
      Math.min((view.w * 0.6) / (gap + square * 1.2), (view.h * 0.36) / (square * 0.96)),
    ),
  };
}
