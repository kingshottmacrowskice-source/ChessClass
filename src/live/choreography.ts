import type { Point } from "./motion";

/** One square in board percent. */
export const SQUARE = 12.5;
export const squarePoint = (s: string): Point => ({
  x: (s.charCodeAt(0) - 97) * SQUARE + SQUARE / 2,
  y: (8 - Number(s[1])) * SQUARE + SQUARE / 2,
});

/** Floor position plus height (in squares) and presentation of a flying object. */
export type Sample = {
  x: number;
  y: number;
  h: number;
  rot: number;
  scale: number;
  alpha: number;
};
export type Path = {
  duration: number;
  sample: (t: number) => Sample;
  /** Normalised times at which the object touches the floor. */
  contacts: number[];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const mixPoint = (a: Point, b: Point, t: number) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});
const unit = (from: Point, to: Point) => {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d, d };
};
const rest = (p: Point): Sample => ({
  ...p,
  h: 0,
  rot: 0,
  scale: 1,
  alpha: 1,
});

/** Where the actor stands to strike a piece: beside it, on the side she came from. */
export function attackSpot(actor: Point, target: Point): Point {
  const side = actor.x <= target.x ? -1 : 1;
  const x = target.x + side * SQUARE * 0.78;
  // Prefer the requested side; if it leaves the board, strike from the other one.
  return {
    x: x < 3 || x > 97 ? target.x - side * SQUARE * 0.78 : x,
    y: target.y + 0.5,
  };
}

/** Where to stand while throwing: back from the target toward the approach. */
export function throwSpot(from: Point, to: Point, distance = 1.6): Point {
  const u = unit(to, from);
  if (u.d <= SQUARE * distance) return { ...from };
  return {
    x: clamp(to.x + u.x * SQUARE * distance, 3, 97),
    y: clamp(to.y + u.y * SQUARE * distance, 4, 96),
  };
}

export type Landing = "bounce" | "slide" | "slam";

/**
 * A thrown piece leaving the actor's hands (height h0) and coming to rest exactly on `to`.
 * - bounce: lands short, then two decreasing hops that finish on the square.
 * - slide:  lands about halfway, then skids to a stop on the square.
 * - slam:   high lob straight down onto the square.
 */
export function throwPath(
  landing: Landing,
  from: Point,
  to: Point,
  h0 = 0.75,
): Path {
  const d = unit(from, to).d / SQUARE;
  if (landing === "slam") {
    const peak = 2.4 + d * 0.15;
    return {
      duration: 760 + d * 40,
      contacts: [1],
      sample: (t) => {
        const p = mixPoint(from, to, 1 - (1 - t) ** 1.6);
        return {
          ...p,
          h: Math.max(0, lerp(h0, 0, t) + 4 * peak * t * (1 - t)),
          rot: t * 360,
          scale: 1 + 0.15 * Math.sin(Math.PI * t),
          alpha: 1,
        };
      },
    };
  }
  if (landing === "slide") {
    const land = 0.55;
    return {
      duration: 900 + d * 60,
      contacts: [land],
      sample: (t) => {
        if (t < land) {
          const u = t / land;
          return {
            ...mixPoint(from, to, u * 0.6),
            h: Math.max(0, lerp(h0, 0, u) + 4 * 0.9 * u * (1 - u)),
            rot: u * 200,
            scale: 1,
            alpha: 1,
          };
        }
        const u = (t - land) / (1 - land);
        const ease = 1 - (1 - u) ** 3;
        return {
          ...mixPoint(from, to, 0.6 + 0.4 * ease),
          h: 0,
          // Wobble as it grinds to a halt.
          rot: Math.sin(u * Math.PI * 3) * (1 - u) * 14,
          scale: 1,
          alpha: 1,
        };
      },
    };
  }
  // bounce: three arcs covering 62%, 26%, 12% of the distance.
  const spans = [0.62, 0.26, 0.12],
    peaks = [0.95 + d * 0.08, 0.45, 0.18],
    times = [0.5, 0.3, 0.2];
  const contacts = [times[0], times[0] + times[1], 1];
  return {
    duration: 1050 + d * 60,
    contacts,
    sample: (t) => {
      let start = 0,
        covered = 0;
      for (let i = 0; i < 3; i++) {
        const end = start + times[i];
        if (t <= end || i === 2) {
          const u = clamp((t - start) / times[i], 0, 1);
          const base = i === 0 ? lerp(h0, 0, u) : 0;
          return {
            ...mixPoint(from, to, covered + spans[i] * u),
            h: Math.max(0, base + 4 * peaks[i] * u * (1 - u)),
            rot: i === 0 ? u * 300 : 0,
            scale: 1 - (i > 0 ? 0.1 * Math.sin(Math.PI * u) : 0),
            alpha: 1,
          };
        }
        start = end;
        covered += spans[i];
      }
      return rest(to);
    },
  };
}

/** A struck piece launched away from `source`, spinning off the board and fading out. */
export function knockPath(
  at: Point,
  source: Point,
  power = 1,
  random = Math.random,
): Path {
  const u = unit(source, at);
  // Bias toward the camera/side so the launch is readable, with a little randomness.
  const angle = Math.atan2(u.y, u.x) + (random() - 0.5) * 0.7;
  const reach = SQUARE * (3.5 + 2.5 * power);
  const to = {
    x: at.x + Math.cos(angle) * reach,
    y: at.y + Math.sin(angle) * reach * 0.6 - SQUARE * 1.2,
  };
  const peak = 2.2 + power * 1.4,
    spin = (random() < 0.5 ? -1 : 1) * (540 + power * 360);
  return {
    duration: 760 + power * 180,
    contacts: [],
    sample: (t) => ({
      ...mixPoint(at, to, t),
      h: 4 * peak * t * (1 - t * 0.55),
      rot: spin * t,
      scale: 1 - 0.55 * t,
      alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
    }),
  };
}

/** Lift from the floor to above the actor's head. */
export function liftPath(at: Point, head: Point, h1 = 0.75): Path {
  return {
    duration: 280,
    contacts: [],
    sample: (t) => {
      const e = 1 - (1 - t) ** 2;
      return {
        ...mixPoint(at, head, e),
        h: lerp(0, h1, e) + 0.25 * Math.sin(Math.PI * t),
        rot: 0,
        scale: lerp(1, 0.8, e),
        alpha: 1,
      };
    },
  };
}

export const ATTACKS = ["kick", "shoot", "ram"] as const;
export type Attack = (typeof ATTACKS)[number];
export const LANDINGS: Landing[] = ["bounce", "slide", "slam"];
export function pickStyle(random = Math.random): {
  attack: Attack;
  landing: Landing;
} {
  const attack = ATTACKS[Math.floor(random() * ATTACKS.length)];
  // Ramming means the thrown piece skids into the victim.
  const landing =
    attack === "ram"
      ? "slide"
      : LANDINGS[Math.floor(random() * LANDINGS.length)];
  return { attack, landing };
}
