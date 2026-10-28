import type { Point } from "./motion";

/**
 * A camera pose: the board point held in view, how far in, and how much roll.
 * Coordinates are in the `.board-perspective` local space that `project()` already
 * returns, so a pose point is just a square's projected position.
 */
export type CameraPose = Point & { scale: number; rot: number };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Dollies the whole stage — tilted floor and upright billboard layer together —
 * as one camera. The transform is applied to the outer `.board-perspective`
 * element, i.e. after the floor's perspective projection, so every position
 * measured at rest stays valid for the entire shot: pieces, particles and
 * reticles keep landing on their squares while zoomed.
 *
 * It deliberately uses the individual `translate`/`rotate`/`scale` properties
 * rather than `transform`, because `FxLayer.shake` animates `transform` on the
 * same element; the two then compose instead of overwriting each other.
 */
export class CameraRig {
  private host: HTMLElement | null = null;
  private frame = 0;
  private pose: CameraPose = { x: 0, y: 0, scale: 1, rot: 0 };
  private centre = { x: 0, y: 0 };
  private anchor = { x: 0, y: 0 };

  get active() {
    return this.host !== null;
  }

  attach(host: HTMLElement) {
    this.detach();
    this.host = host;
    this.measure();
    host.classList.add("camera-on");
    this.write(this.home());
  }

  /**
   * Read while the stage is untransformed. The anchor is the viewport's centre in
   * stage coordinates, so a close-up lands mid-screen even if the board is
   * scrolled partly out of view.
   */
  measure() {
    const host = this.host;
    if (!host) return;
    const box = host.getBoundingClientRect();
    this.centre = { x: host.offsetWidth / 2, y: host.offsetHeight / 2 };
    this.anchor = {
      x: window.innerWidth / 2 - box.left,
      y: window.innerHeight * 0.54 - box.top,
    };
  }

  /** Identity: the anchor point held at the anchor, unscaled, unrolled. */
  home(): CameraPose {
    return { x: this.anchor.x, y: this.anchor.y, scale: 1, rot: 0 };
  }

  private write(p: CameraPose) {
    const host = this.host;
    if (!host) return;
    this.pose = p;
    const ox = this.centre.x,
      oy = this.centre.y,
      rad = (p.rot * Math.PI) / 180,
      cos = Math.cos(rad),
      sin = Math.sin(rad),
      dx = p.x - ox,
      dy = p.y - oy;
    // Individual properties rotate and scale about the host's centre O, so the
    // translation has to cancel that: A = O + T + s·R·(P − O).
    host.style.translate = `${(this.anchor.x - ox - p.scale * (cos * dx - sin * dy)).toFixed(2)}px ${(
      this.anchor.y - oy - p.scale * (sin * dx + cos * dy)
    ).toFixed(2)}px`;
    host.style.rotate = `${p.rot}deg`;
    host.style.scale = `${p.scale}`;
  }

  /** Drop the affine so layout can be measured as authored, then put it back. */
  suspend() {
    if (!this.host) return;
    this.host.style.removeProperty("translate");
    this.host.style.removeProperty("rotate");
    this.host.style.removeProperty("scale");
  }

  resume() {
    if (this.host) this.write(this.pose);
  }

  /** Glide to a pose; resolves once the shot settles or is superseded. */
  focus(target: CameraPose, ms = 600): Promise<void> {
    if (!this.host) return Promise.resolve();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (ms <= 0) {
      this.write(target);
      return Promise.resolve();
    }
    const from = { ...this.pose };
    return new Promise<void>((done) => {
      const started = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - started) / ms),
          e = easeInOut(k);
        this.write({
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          scale: from.scale + (target.scale - from.scale) * e,
          rot: from.rot + (target.rot - from.rot) * e,
        });
        if (k < 1) this.frame = requestAnimationFrame(step);
        else {
          this.frame = 0;
          done();
        }
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  reset(ms = 520) {
    return this.focus(this.home(), ms);
  }

  detach() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const host = this.host;
    this.host = null;
    if (!host) return;
    host.classList.remove("camera-on");
    this.suspend();
  }
}

let current: CameraRig | null = null;

/** Marks `rig` as the live camera so measurements can borrow the untransformed layout. */
export const mountCamera = (rig: CameraRig | null) => {
  current = rig;
};
export const activeCamera = () => current;

/** Run a layout measurement with the camera's affine lifted, then restore it. */
export function withoutCamera<T>(fn: () => T): T {
  const rig = current;
  if (!rig?.active) return fn();
  rig.suspend();
  try {
    return fn();
  } finally {
    rig.resume();
  }
}
