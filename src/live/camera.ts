import { boardAngle, DEFAULT_BOARD_ANGLE } from "./boardView";
import type { Sample } from "./choreography";
/** All lengths are board squares; x/z are centred on the board. */
export type CameraPose = {
  x: number;
  z: number;
  height: number;
  distance: number;
  elevation: number;
  azimuth: number;
};
export const HOME: CameraPose = {
  x: 0,
  z: 0,
  height: 0,
  distance: 14.3,
  elevation: (DEFAULT_BOARD_ANGLE * Math.PI) / 180,
  azimuth: 0,
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
export class CameraRig {
  private host: HTMLElement | null = null;
  private frame = 0;
  private spacer: HTMLElement | null = null;
  private finish: (() => void) | null = null;
  private pose = { ...HOME };
  get active() {
    return this.host !== null;
  }
  attach(host: HTMLElement) {
    this.detach();
    this.host = host;
    this.spacer = document.createElement("div");
    this.spacer.style.height = `${host.offsetHeight}px`;
    this.spacer.setAttribute("aria-hidden", "true");
    host.before(this.spacer);
    host.classList.add("camera-on");
    this.write(this.home());
  }
  home() {
    return this.host
      ? (boardViews.get(this.host)?.home() ?? { ...HOME })
      : { ...HOME };
  }
  private write(p: CameraPose) {
    this.pose = { ...p };
    if (this.host) boardViews.get(this.host)?.pose(p);
  }
  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.finish?.();
    this.finish = null;
  }
  focus(target: CameraPose, ms = 600): Promise<void> {
    this.stop();
    if (!this.host) return Promise.resolve();
    if (ms <= 0) {
      this.write(target);
      return Promise.resolve();
    }
    const from = { ...this.pose };
    return new Promise<void>((done) => {
      this.finish = done;
      const started = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / ms),
          e = t * t * (3 - 2 * t);
        const next = { ...from };
        for (const key of Object.keys(from) as (keyof CameraPose)[])
          next[key] = from[key] + (target[key] - from[key]) * e;
        this.write(next);
        if (t < 1) this.frame = requestAnimationFrame(tick);
        else {
          this.finish = null;
          this.frame = 0;
          done();
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
  reset(ms = 520) {
    return this.focus(this.home(), ms);
  }
  detach() {
    this.stop();
    this.write(this.home());
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
