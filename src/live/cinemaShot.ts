import { PIECE_FORWARD_OFFSET } from "./boardView";
import {
  boardViews,
  dollyFor,
  HOME,
  type CameraPose,
  type CameraRig,
} from "./camera";
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
  /** The stage the camera films (`.board-perspective`). */
  stage: () => HTMLElement | null;
  project: Project;
  set: (beat: Partial<Beat>) => void;
  reduced: () => boolean;
};

/** Let the move itself land before the camera swings in. */
const LEAD_MS = MOVE_MS + 60;

/** Colour grades, styled on `.board-perspective[data-grade]` in cinema.css. */
export type Grade = "hush" | "inhale" | "gold" | "cold" | "noir" | "blood";

/** A blown-out exposure that recovers to the current grade. */
const OVEREXPOSED =
  "grayscale(0) sepia(0) hue-rotate(0deg) saturate(0.5) contrast(1.1) brightness(2.6)";
/** Manga impact frames: negative, crushed black, negative. */
const IMPACT = [
  "invert(1) grayscale(1) contrast(5) brightness(1.2)",
  "grayscale(1) contrast(6) brightness(0.3)",
  "invert(1) grayscale(1) contrast(5) brightness(1.2)",
];

/** `angle` expressed within half a turn of `ref`, so tweens take the short way round. */
const near = (angle: number, ref: number) =>
  angle + 2 * Math.PI * Math.round((ref - angle) / (2 * Math.PI));
type Spot = { floor: { x: number; y: number }; x: number; z: number };
const shot = (at: { x: number; z: number }, o: Partial<CameraPose>) => ({
  ...HOME,
  x: at.x,
  z: at.z,
  height: 0.6,
  distance: 3,
  elevation: 0.12,
  azimuth: 0,
  fov: 34,
  roll: 0,
  ...o,
});

/**
 * Directs one board-camera finisher: drives the camera, the grade, the overlay's
 * beat and the particles, then hands the board back. Every shot carries a token,
 * so a reset or skip mid-shot never leaves the camera zoomed or the board tinted.
 */
export class CinemaShot {
  private token = 0;

  constructor(private deps: CinemaDeps) {}

  cancel() {
    this.token++;
    this.grade(null);
    this.deps.camera.detach();
  }

  /** Resolves true when the shot played out, false when it was cancelled. */
  async run(show: CinemaShow): Promise<boolean> {
    const token = ++this.token;
    const { camera, stage, set, reduced } = this.deps;
    set({ phase: "lead", swapped: false, slain: false });
    if (!(await this.wait(LEAD_MS, token))) return false;
    const host = stage();
    if (reduced() || !host || !boardViews.has(host)) {
      set({ phase: "out", swapped: !!show.promo });
      this.deps.fx()?.flash("#fffbe8", 240);
      return this.wait(900, token);
    }
    camera.attach(host);
    // Screen-space marks drawn for the overview would float loose once the lens moves.
    this.deps.fx()?.clearEffects();
    try {
      for (const step of script(show.kind)) {
        set({ phase: step.phase });
        if (step.cue) this.cue(step.cue, show, token);
        if (!(await this.wait(step.ms, token))) return false;
      }
      return true;
    } finally {
      if (token === this.token) {
        this.grade(null);
        camera.detach();
      }
    }
  }

  private wait(ms: number, token: number) {
    return new Promise<boolean>((r) =>
      setTimeout(() => r(token === this.token), ms),
    );
  }

  private grade(g: Grade | null) {
    const host = this.deps.stage();
    if (!host) return;
    if (g) host.dataset.grade = g;
    else delete host.dataset.grade;
  }

  /** Filter keyframes over the filmed stage, easing back into whatever grade is live. */
  private expose(ms: number) {
    this.deps.stage()?.animate?.([{ filter: OVEREXPOSED, offset: 0 }], {
      duration: ms,
      easing: "cubic-bezier(0.1, 0.7, 0.2, 1)",
    });
  }
  private impact(frameMs = 60) {
    this.deps.stage()?.animate?.(
      IMPACT.map((filter, i) => ({
        filter,
        offset: i / IMPACT.length,
        easing: "steps(1, end)",
      })),
      { duration: IMPACT.length * frameMs },
    );
  }

  /** The same square in effect coordinates and 3D world coordinates. */
  private at(square: string): Spot {
    const floor = squarePoint(square);
    floor.y += PIECE_FORWARD_OFFSET * 12.5;
    return { floor, x: floor.x / 12.5 - 4, z: floor.y / 12.5 - 4 };
  }

  private cue(c: Cue, show: CinemaShow, token: number) {
    const f = this.deps.fx(),
      cam = this.deps.camera;
    const hero = this.at(show.square),
      victim = show.victim ? this.at(show.victim) : null;
    const on = (a: Spot, h: number) => ({ ...a.floor, h });
    const later = (ms: number, fn: () => void) =>
      setTimeout(() => token === this.token && fn(), ms);
    const every = (n: number, gap: number, fn: (i: number) => void) => {
      for (let i = 0; i < n; i++) later(i * gap, () => fn(i));
    };
    // Promotion orbits are measured from the view that looks at the hero from
    // off the board, so the rest of the board fills the background. The orbit
    // runs in whichever direction starts nearer the overview camera.
    const home = cam.home().azimuth;
    const outward = near(Math.atan2(hero.x, hero.z), home);
    const spin =
      Math.abs(outward + 1.1 - home) <= Math.abs(outward - 1.1 - home) ? 1 : -1;
    const turn = (k: number) => outward + spin * k;

    // Checkmate geometry: the line of attack and the views along and across it.
    const gap = victim ? Math.hypot(hero.x - victim.x, hero.z - victim.z) : 0;
    const behind = victim
      ? Math.atan2(hero.x - victim.x, hero.z - victim.z)
      : 0;
    const mid = victim
      ? { x: (hero.x + victim.x) / 2, z: (hero.z + victim.z) / 2 }
      : hero;
    // Across the line, from the side nearer the board edge so the board fills the background.
    const across = (() => {
      const a = behind + Math.PI / 2;
      return Math.sin(a) * mid.x + Math.cos(a) * mid.z >= 0 ? a : a + Math.PI;
    })();

    switch (c) {
      // ---------------- promotion ----------------
      case "approach":
        this.grade(show.kind === "promotion" ? "hush" : "cold");
        cam.handheld(0.3);
        if (show.kind === "promotion")
          void cam.focus(
            shot(hero, {
              height: 0.3,
              distance: 6.4,
              elevation: 0.62,
              azimuth: turn(1.5),
            }),
            560,
            "out",
          );
        else
          void cam.focus(
            shot(mid, {
              height: 0.2,
              distance: gap + 6,
              elevation: 0.85,
              azimuth: cam.pose.azimuth,
              fov: 34,
            }),
            480,
            "out",
          );
        break;
      case "crane":
        void cam.focus(
          shot(hero, {
            height: 0.55,
            distance: 3.3,
            elevation: 0.1,
            azimuth: turn(1.1),
            fov: 32,
          }),
          680,
          "inOut",
        );
        break;
      case "rise":
        cam.handheld(0.5);
        // A slow orbit to profile while the pawn lifts off and the air thickens.
        void cam.focus(
          shot(hero, {
            height: 0.8,
            distance: 2.8,
            elevation: 0.06,
            azimuth: turn(0.35),
            fov: 30,
          }),
          1300,
          "inOut",
        );
        every(6, 220, (i) => cam.shake(0.08 + i * 0.05));
        break;
      case "inhale":
        // The held breath: lights dip and the lens pushes in before the change.
        this.grade("inhale");
        cam.handheld(0.15);
        void cam.focus(
          { ...cam.pose, distance: 2.15, fov: 26, elevation: 0.04 },
          300,
          "in",
        );
        break;
      case "swap": {
        this.deps.set({ swapped: true });
        this.grade("gold");
        this.expose(520);
        cam.handheld(0.3);
        cam.shake(1.6);
        // Hard cut to a low hero angle from the far side, then a slow pull back.
        const low = shot(hero, {
          height: 0.85,
          distance: 2.3,
          elevation: -0.08,
          azimuth: turn(-0.3),
          fov: 42,
        });
        void cam.focus(low, 0);
        void cam.focus(
          {
            ...low,
            distance: 3.9,
            elevation: 0.03,
            height: 0.7,
            azimuth: turn(-0.7),
            fov: 36,
          },
          1500,
          "out",
        );
        f?.burst(on(hero, 0.6), "spark", { count: 28 });
        later(140, () => f?.burst(on(hero, 0.9), "confetti", { count: 26 }));
        break;
      }

      // ---------------- checkmate ----------------
      case "stalk": {
        if (!victim) break;
        cam.handheld(0.6);
        // Over the attacker's shoulder down a long lens, the king small and far.
        const ots = shot(
          {
            x: hero.x + (victim.x - hero.x) * 0.7,
            z: hero.z + (victim.z - hero.z) * 0.7,
          },
          {
            height: 0.55,
            distance: gap * 0.7 + 3.1,
            elevation: 0.1,
            azimuth: behind + 0.3,
            fov: 24,
          },
        );
        void cam.focus(ots, 0);
        void cam.focus(
          {
            ...ots,
            distance: ots.distance - 0.7,
            fov: 22,
            azimuth: behind + 0.26,
          },
          1100,
          "inOut",
        );
        // Heartbeat.
        for (const at of [80, 360, 820]) later(at, () => cam.shake(0.32));
        break;
      }
      case "face": {
        if (!victim) break;
        cam.handheld(0.35);
        // Cut across the line of attack: both pieces in profile, the frame tilting.
        const profile = shot(mid, {
          height: 0.6,
          distance: Math.max(3.6, gap + 2.4),
          elevation: 0.15,
          azimuth: across,
          fov: 30,
          roll: 0.1,
        });
        void cam.focus(profile, 0);
        void cam.focus(
          {
            ...profile,
            azimuth: across + 0.14,
            roll: 0.15,
            distance: profile.distance - 0.3,
          },
          720,
          "linear",
        );
        later(120, () => f?.tracer(on(hero, 0.55), on(victim, 0.55)));
        later(140, () => f?.burst(on(victim, 0.55), "spark", { count: 18 }));
        later(140, () => cam.shake(0.9));
        break;
      }
      case "dread": {
        if (!victim) break;
        this.grade("noir");
        cam.handheld(0.2);
        // Dolly zoom on the king: he holds his size while the world lunges at him.
        const start = shot(victim, {
          height: 0.55,
          distance: 5.4,
          elevation: 0.1,
          azimuth: behind + Math.PI + 0.18,
          fov: 20,
        });
        void cam.focus(start, 0);
        void cam.focus(
          { ...start, fov: 52, distance: dollyFor(start, 52), roll: -0.1 },
          1000,
          "inOut",
        );
        every(8, 120, (i) => cam.shake(0.06 + i * 0.03));
        break;
      }
      case "slash":
        if (!victim) break;
        this.deps.set({ slain: true });
        this.grade("blood");
        this.impact();
        cam.shake(2.4);
        cam.handheld(0.2);
        void cam.focus(
          shot(victim, {
            height: 0.5,
            distance: 2.6,
            elevation: 0.04,
            azimuth: across + 0.35,
            fov: 38,
            roll: 0.1,
          }),
          0,
        );
        break;
      case "aftermath":
        if (!victim) break;
        // Bullet time: a slow orbit of the wreck while the pieces fall.
        void cam.focus(
          {
            ...cam.pose,
            azimuth: cam.pose.azimuth + 0.75,
            distance: 3.2,
            roll: 0.02,
          },
          1400,
          "out",
        );
        f?.burst(on(victim, 0.5), "shards", {
          count: 40,
          colors:
            show.by === "w"
              ? ["#24374f", "#536c8c", "#a5bdd1", "#111b2a"]
              : ["#fff2d3", "#e1c797", "#c3ad83", "#695647"],
        });
        f?.burst(on(victim, 0.6), "spark", { count: 16 });
        break;

      case "settle":
        this.grade(null);
        cam.handheld(0);
        void cam.reset(820);
        break;
    }
  }
}
