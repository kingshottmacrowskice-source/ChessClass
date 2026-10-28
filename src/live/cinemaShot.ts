import { PIECE_FORWARD_OFFSET } from "./boardView";
import type { CameraRig } from "./camera";
import { squarePoint } from "./choreography";
import { script, type Beat, type CinemaShow, type Cue } from "./cinema";
import type { FxApi } from "./fx";
import { MOVE_MS } from "./transition";

type Project = (
  x: number,
  y: number,
) => { x: number; y: number; width: number };
export type CinemaDeps = {
  fx: () => FxApi | null;
  camera: CameraRig;
  /** The stage the camera dollies (`.board-perspective`). */
  stage: () => HTMLElement | null;
  project: Project;
  set: (beat: Partial<Beat>) => void;
  reduced: () => boolean;
};

/** Let the move itself land before the camera swings in. */
const LEAD_MS = MOVE_MS + 60;

/**
 * Directs one board-camera finisher: drives the camera, the overlay's beat and
 * the particles, then hands the board back. Every shot carries a token, so a
 * reset or skip mid-shot never leaves the camera zoomed.
 */
export class CinemaShot {
  private token = 0;

  constructor(private deps: CinemaDeps) {}

  cancel() {
    this.token++;
    this.deps.camera.detach();
  }

  /** Resolves true when the shot played out, false when it was cancelled. */
  async run(show: CinemaShow): Promise<boolean> {
    const token = ++this.token;
    const { camera, stage, set, reduced } = this.deps;
    set({ phase: "lead", swapped: false, slain: false });
    if (!(await this.wait(LEAD_MS, token))) return false;
    const host = stage();
    if (reduced() || !host) {
      set({ phase: "out", swapped: !!show.promo });
      this.deps.fx()?.flash("#fffbe8", 240);
      return this.wait(900, token);
    }
    camera.attach(host);
    try {
      for (const step of script(show.kind)) {
        set({ phase: step.phase });
        if (step.cue) this.cue(step.cue, show, token);
        if (!(await this.wait(step.ms, token))) return false;
      }
      return true;
    } finally {
      if (token === this.token) camera.detach();
    }
  }

  private wait(ms: number, token: number) {
    return new Promise<boolean>((r) =>
      setTimeout(() => r(token === this.token), ms),
    );
  }

  /** The same square in effect coordinates and 3D world coordinates. */
  private at(square: string) {
    const floor = squarePoint(square);
    floor.y += PIECE_FORWARD_OFFSET * 12.5;
    return { floor, x: floor.x / 12.5 - 4, z: floor.y / 12.5 - 4 };
  }

  private cue(c: Cue, show: CinemaShow, token: number) {
    const f = this.deps.fx(),
      cam = this.deps.camera;
    const hero = this.at(show.square),
      victim = show.victim ? this.at(show.victim) : null;
    const on = (a: { floor: { x: number; y: number } }, h: number) => ({
      ...a.floor,
      h,
    });
    const side = hero.x > 0 ? 1 : -1;
    const close = {
      x: hero.x,
      z: hero.z,
      height: 0.65,
      distance: 3.3,
      elevation: 0.14,
      azimuth: side * 1.15,
    };
    // View perpendicular to the line between the combatants, so neither hides the other.
    const gap = victim ? Math.hypot(hero.x - victim.x, hero.z - victim.z) : 0;
    const duel = victim
      ? {
          x: (hero.x + victim.x) / 2,
          z: (hero.z + victim.z) / 2,
          height: 0.65,
          distance: Math.max(4, (gap + 1.8) / 0.95),
          elevation: 0.17,
          azimuth: Math.atan2(victim.z - hero.z, hero.x - victim.x),
        }
      : null;
    const later = (ms: number, fn: () => void) =>
      setTimeout(() => token === this.token && fn(), ms);
    switch (c) {
      case "charge":
        f?.reticle(show.square, "hit", 1000);
        if (show.victim) f?.reticle(show.victim, "warn", 1600);
        void cam.focus({ ...close, distance: 6, elevation: 0.42 }, 460);
        break;
      case "zoom":
        void cam.focus(close, 640);
        f?.ring(on(hero, 0.05), "#ffe46b");
        break;
      case "float":
        f?.burst(on(hero, 0.7), "stars", { count: 10 });
        for (let i = 0; i < 4; i++) later(i * 150, () => f?.shake(0.25));
        break;
      case "glow":
        void cam.focus(
          { ...close, height: 0.85, azimuth: side * 1.6, distance: 2.9 },
          600,
        );
        f?.burst(on(hero, 0.9), "spark", { count: 22 });
        f?.ring(on(hero, 0.3), "#fff6b0");
        break;
      case "swap":
        this.deps.set({ swapped: true });
        f?.flash("#fffbe8", 280);
        f?.burst(on(hero, 0.8), "stars", { count: 16 });
        void cam.focus(
          { ...close, height: 0.8, azimuth: side * 1.85, distance: 3.6 },
          300,
        );
        break;
      case "burst":
        f?.burst(on(hero, 0.8), "confetti", { count: 40 });
        f?.burst(on(hero, 0.8), "spark", { count: 22 });
        f?.text(on(hero, 1.15), "升变!", "hit");
        f?.shake(1.2);
        break;
      case "face":
        if (duel) void cam.focus(duel, 700);
        if (victim) f?.ring(on(victim, 0.1), "#ff6b5a");
        f?.ring(on(hero, 0.1), "#ffe46b");
        break;
      case "clash":
        if (victim) {
          f?.tracer(on(hero, 0.55), on(victim, 0.55));
          f?.burst(on(victim, 0.55), "spark", { count: 24 });
          f?.text(on(victim, 1.25), "CHECKMATE", "warn");
        }
        f?.shake(1.4);
        break;
      case "strobe":
        if (duel)
          void cam.focus(
            { ...duel, elevation: 0.1, azimuth: duel.azimuth + 0.12 },
            900,
          );
        for (let i = 0; i < 7; i++)
          later(i * 130, () => f?.shake(0.3 + i * 0.06));
        break;
      case "tighten":
        if (victim)
          void cam.focus(
            {
              ...close,
              x: victim.x,
              z: victim.z,
              azimuth: duel?.azimuth ?? close.azimuth,
              distance: 3.8,
            },
            260,
          );
        break;
      case "slash":
        this.deps.set({ slain: true });
        f?.flash("#ffffff", 320);
        f?.shake(2.4);
        if (victim) f?.text(on(victim, 1.4), "斩!", "warn");
        break;
      case "shatter":
        if (victim) {
          const colours =
            show.by === "w"
              ? ["#24374f", "#536c8c", "#a5bdd1", "#111b2a"]
              : ["#fff2d3", "#e1c797", "#c3ad83", "#695647"];
          f?.burst(on(victim, 0.5), "shards", { count: 36, colors: colours });
          f?.burst(on(victim, 0.5), "stars", { count: 10 });
        }
        f?.shake(1.8);
        break;
      case "settle":
        void cam.reset(600);
        break;
    }
  }
}
