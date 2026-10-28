import { boardAngle, DEFAULT_BOARD_ANGLE } from "./boardView";
import type { Sample } from "./choreography";
/** All lengths are board squares; x/z are centred on the board. Angles are radians, `fov` degrees. */
export type CameraPose = {
  x: number;
  z: number;
  height: number;
  distance: number;
  elevation: number;
  azimuth: number;
  /** Vertical field of view: lower is a longer lens. */
  fov: number;
  /** Dutch angle around the view axis. */
  roll: number;
};
export const HOME: CameraPose = {
  x: 0,
  z: 0,
  height: 0,
  distance: 14.3,
  elevation: (DEFAULT_BOARD_ANGLE * Math.PI) / 180,
  azimuth: 0,
  fov: 38,
  roll: 0,
};
export function boardHome(angle: number): CameraPose {
  const elevation = (boardAngle(angle) * Math.PI) / 180;
  return {
    ...HOME,
    elevation,
    distance:
      HOME.distance +
      Math.max(0, Math.cos(elevation) - Math.cos(HOME.elevation)) * 4.4,
  };
}
/** Same framing of the subject through another lens: the dolly-zoom distance for `fov`. */
export const dollyFor = (pose: CameraPose, fov: number) =>
  (pose.distance * Math.tan((pose.fov * Math.PI) / 360)) /
  Math.tan((fov * Math.PI) / 360);
export type BoardFlight = {
  id: number;
  piece: string;
  color: string;
  s: Sample;
};
export type BoardView = {
  home: () => CameraPose;
  flights: (flights: BoardFlight[]) => void;
  pose: (pose: CameraPose) => void;
  project: (x: number, y: number) => { x: number; y: number; width: number };
};
export const boardViews = new WeakMap<HTMLElement, BoardView>();

export type Ease = "linear" | "in" | "out" | "inOut" | "snap";
const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // Whip in and settle: most of the move happens in the first frames.
  snap: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
};
const KEYS = Object.keys(HOME) as (keyof CameraPose)[];
// Incommensurate sines read as organic noise without a noise table.
const wobble = (t: number, seed: number) =>
  Math.sin(t * 1.0 + seed) * 0.5 +
  Math.sin(t * 2.3 + seed * 1.7) * 0.3 +
  Math.sin(t * 4.1 + seed * 2.9) * 0.2;

/**
 * The film camera. Moves ease a base pose; while attached, a frame loop layers
 * handheld drift and shake trauma on top, so even a held shot breathes and an
 * impact jolts the lens rather than the page.
 */
export class CameraRig {
  private host: HTMLElement | null = null;
  private frame = 0;
  private spacer: HTMLElement | null = null;
  private base = { ...HOME };
  private tween: {
    from: CameraPose;
    to: CameraPose;
    start: number;
    ms: number;
    ease: Ease;
    done: () => void;
  } | null = null;
  private trauma = 0;
  private hand = 0;
  private last = 0;
  get active() {
    return this.host !== null;
  }
  /** The pose the camera is easing from or resting at, without drift or shake. */
  get pose() {
    return { ...this.base };
  }
  attach(host: HTMLElement) {
    this.detach();
    this.host = host;
    this.spacer = document.createElement("div");
    this.spacer.style.height = `${host.offsetHeight}px`;
    this.spacer.setAttribute("aria-hidden", "true");
    host.before(this.spacer);
    host.classList.add("camera-on");
    this.base = this.home();
    this.write(this.base);
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  home() {
    return this.host
      ? (boardViews.get(this.host)?.home() ?? { ...HOME })
      : { ...HOME };
  }
  private write(p: CameraPose) {
    if (this.host) boardViews.get(this.host)?.pose(p);
  }
  private tick = (now: number) => {
    if (!this.host) return;
    const dt = Math.min(0.05, Math.max(0, now - this.last) / 1000);
    this.last = now;
    const tw = this.tween;
    if (tw) {
      const t = Math.min(1, (now - tw.start) / tw.ms),
        e = EASE[tw.ease](t);
      for (const key of KEYS)
        this.base[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (t >= 1) {
        this.tween = null;
        tw.done();
      }
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma,
      t = now / 1000,
      quick = (now / 1000) * 31;
    const p = { ...this.base };
    p.azimuth +=
      this.hand * 0.014 * wobble(t * 0.8, 1) + s * 0.05 * wobble(quick, 3);
    p.elevation +=
      this.hand * 0.009 * wobble(t * 0.7, 5) + s * 0.035 * wobble(quick, 7);
    p.roll +=
      this.hand * 0.008 * wobble(t * 0.6, 9) + s * 0.06 * wobble(quick, 11);
    p.height += s * 0.06 * wobble(quick, 13);
    this.write(p);
    this.frame = requestAnimationFrame(this.tick);
  };
  /** Ease the base pose to `target`; `ms <= 0` is a hard cut. */
  focus(target: CameraPose, ms = 600, ease: Ease = "inOut"): Promise<void> {
    this.settle();
    if (!this.host) return Promise.resolve();
    if (ms <= 0) {
      this.base = { ...target };
      this.write(this.base);
      return Promise.resolve();
    }
    return new Promise<void>((done) => {
      this.tween = {
        from: { ...this.base },
        to: { ...target },
        start: performance.now(),
        ms,
        ease,
        done,
      };
    });
  }
  /** Add shake trauma; it decays by itself. Powers match `FxApi.shake`. */
  shake(power: number) {
    this.trauma = Math.min(1, this.trauma + power * 0.32);
  }
  /** Handheld drift, 0 (locked off) to 1 (nervous). */
  handheld(amount: number) {
    this.hand = amount;
  }
  reset(ms = 520) {
    const home = this.home(),
      turn = 2 * Math.PI;
    // Unwind the short way round; detach writes the exact home pose anyway.
    home.azimuth +=
      turn * Math.round((this.base.azimuth - home.azimuth) / turn);
    return this.focus(home, ms);
  }
  /** Finish any move in flight so its awaiter never hangs. */
  private settle() {
    const tw = this.tween;
    this.tween = null;
    tw?.done();
  }
  detach() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.settle();
    this.trauma = 0;
    this.hand = 0;
    this.base = this.home();
    this.write(this.base);
    this.host?.classList.remove("camera-on");
    this.host = null;
    this.spacer?.remove();
    this.spacer = null;
  }
}
let current: CameraRig | null = null;
export const mountCamera = (rig: CameraRig | null) => {
  current = rig;
};
export const activeCamera = () => current;
export function withoutCamera<T>(fn: () => T): T {
  return fn();
}
