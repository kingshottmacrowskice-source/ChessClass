import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import ChessPiece from "./ChessPiece";
import { boardViews } from "./camera";
import { squarePoint, SQUARE, type Path, type Sample } from "./choreography";
import type { Point } from "./motion";

type Project = (
  x: number,
  y: number,
) => { x: number; y: number; width: number };
export type At = Point & { h?: number };
export type Tone = "hit" | "good" | "warn" | "info";
export type BurstKind =
  "dust" | "stars" | "shards" | "spark" | "confetti" | "zzz";
export type FxApi = {
  /** Fly a piece along a path; resolves when it comes to rest (or the layer is cleared). */
  fly(o: {
    piece: string;
    color: string;
    path: Path;
    onContact?: (index: number, at: Sample) => void;
  }): Promise<void>;
  burst(
    at: At,
    kind: BurstKind,
    o?: { colors?: string[]; count?: number; dir?: Point },
  ): void;
  text(at: At, text: string, tone?: Tone, size?: number): void;
  ring(at: At, color?: string): void;
  tracer(from: At, to: At): void;
  reticle(square: string, tone: Tone, ms?: number): void;
  flash(color?: string, ms?: number): void;
  shake(power: number): void;
  clear(): void;
};

const tones: Record<Tone, [string, string]> = {
  hit: ["#ffdf5d", "#7a1d12"],
  good: ["#b8f5a0", "#1f4a2c"],
  warn: ["#ff6b5a", "#3b0d08"],
  info: ["#dbeaff", "#1b2c4a"],
};
export const pieceColors = (color: string) =>
  color === "w"
    ? ["#fff2d3", "#e1c797", "#c3ad83", "#695647"]
    : ["#24374f", "#536c8c", "#a5bdd1", "#111b2a"];

type Particle = {
  kind: "particle";
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  color: string;
  born: number;
  life: number;
  glyph?: string;
  drag?: number;
};
type Effect =
  | Particle
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      tone: Tone;
      size: number;
      born: number;
      life: number;
    }
  | {
      kind: "ring";
      x: number;
      y: number;
      r: number;
      color: string;
      born: number;
      life: number;
    }
  | {
      kind: "tracer";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      born: number;
      life: number;
    }
  | {
      kind: "reticle";
      corners: Point[];
      tone: Tone;
      born: number;
      life: number;
    }
  | { kind: "flash"; color: string; born: number; life: number };
type Flight = {
  id: number;
  piece: string;
  color: string;
  path: Path;
  born: number;
  contacts: Set<number>;
  onContact?: (index: number, at: Sample) => void;
  done: () => void;
  s: Sample;
};

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Canvas particles and flying pieces above the board, driven by their own frame loop. */
const FxLayer = forwardRef<
  FxApi,
  { project: Project; shakeTarget: RefObject<HTMLElement> }
>(function FxLayer({ project, shakeTarget }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const effects = useRef<Effect[]>([]),
    flights = useRef<Flight[]>([]),
    loop = useRef(0),
    nextId = useRef(0);
  const [shown, setShown] = useState<Flight[]>([]);

  const screen = (at: At) => {
    const p = projectRef.current(at.x, at.y);
    return { x: p.x, y: p.y - (at.h ?? 0) * p.width, u: p.width || 40 };
  };
  const run = () => {
    if (!loop.current) loop.current = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    loop.current = 0;
    const c = canvas.current;
    // Flights advance first so contact callbacks can spawn particles this frame.
    if (flights.current.length) {
      for (const f of flights.current) {
        const t = Math.min(1, (now - f.born) / f.path.duration);
        f.s = f.path.sample(t);
        f.path.contacts.forEach((ct, i) => {
          if (t >= ct && !f.contacts.has(i)) {
            f.contacts.add(i);
            f.onContact?.(i, f.path.sample(ct));
          }
        });
        if (t >= 1) f.done();
      }
      flights.current = flights.current.filter(
        (f) => now - f.born < f.path.duration,
      );
      setShown([...flights.current]);
      if (shakeTarget.current)
        boardViews
          .get(shakeTarget.current)
          ?.flights(
            flights.current.map((f) => ({
              id: f.id,
              piece: f.piece,
              color: f.color,
              s: { ...f.s },
            })),
          );
    }
    if (c) {
      const parent = c.parentElement!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = parent.clientWidth,
        h = parent.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      effects.current = effects.current.filter((e) => now - e.born < e.life);
      for (const e of effects.current) draw(ctx, e, now, w, h);
    }
    if (effects.current.length || flights.current.length) run();
  };
  const draw = (
    ctx: CanvasRenderingContext2D,
    e: Effect,
    now: number,
    w: number,
    h: number,
  ) => {
    const age = (now - e.born) / 1000,
      t = (now - e.born) / e.life;
    if (e.kind === "particle") {
      const drag = Math.exp(-(e.drag ?? 0) * age);
      const x = e.x + e.vx * age * drag,
        y = e.y + e.vy * age * drag + 0.5 * e.g * age * age;
      ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
      if (e.glyph) {
        ctx.font = `bold ${Math.round(e.size)}px monospace`;
        ctx.fillStyle = e.color;
        ctx.strokeStyle = "#1b2c4a";
        ctx.lineWidth = 3;
        ctx.strokeText(e.glyph, x, y);
        ctx.fillText(e.glyph, x, y);
      } else {
        const s = Math.max(2, Math.round(e.size));
        ctx.fillStyle = e.color;
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
    } else if (e.kind === "text") {
      const pop = t < 0.12 ? 1.7 - (t / 0.12) * 0.7 : 1;
      const [fill, stroke] = tones[e.tone];
      ctx.save();
      ctx.translate(e.x, e.y - 28 * Math.min(1, t * 2.2));
      ctx.scale(pop, pop);
      ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
      ctx.font = `900 ${e.size}px "Courier New", "Microsoft YaHei", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "miter";
      ctx.lineWidth = Math.max(4, e.size / 4);
      ctx.strokeStyle = stroke;
      ctx.strokeText(e.text, 0, 0);
      ctx.fillStyle = fill;
      ctx.fillText(e.text, 0, 0);
      ctx.restore();
    } else if (e.kind === "ring") {
      const r = e.r * (0.3 + 1.4 * (1 - (1 - t) ** 2));
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(2, 6 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === "tracer") {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = "#fff6b0";
      ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
      ctx.strokeStyle = "#ff9a3d";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (e.kind === "reticle") {
      const pulse = 0.5 + 0.5 * Math.sin(age * 14);
      const grow = t < 0.15 ? 1.6 - (t / 0.15) * 0.6 : 1;
      const cx = e.corners.reduce((s, p) => s + p.x, 0) / 4,
        cy = e.corners.reduce((s, p) => s + p.y, 0) / 4;
      ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 0.65 + 0.35 * pulse;
      ctx.strokeStyle = tones[e.tone][0];
      ctx.lineWidth = 3;
      e.corners.forEach((p, i) => {
        const a = { x: cx + (p.x - cx) * grow, y: cy + (p.y - cy) * grow };
        const prev = e.corners[(i + 3) % 4],
          next = e.corners[(i + 1) % 4];
        ctx.beginPath();
        ctx.moveTo(a.x + (prev.x - p.x) * 0.3, a.y + (prev.y - p.y) * 0.3);
        ctx.lineTo(a.x, a.y);
        ctx.lineTo(a.x + (next.x - p.x) * 0.3, a.y + (next.y - p.y) * 0.3);
        ctx.stroke();
      });
    } else if (e.kind === "flash") {
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = e.color;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  };
  const add = (e: Effect) => {
    if (reduced()) return;
    effects.current.push(e);
    if (effects.current.length > 600) effects.current.splice(0, 100);
    run();
  };

  useImperativeHandle(ref, () => ({
    fly({ piece, color, path, onContact }) {
      if (reduced()) {
        path.contacts.forEach((ct, i) => onContact?.(i, path.sample(ct)));
        return Promise.resolve();
      }
      return new Promise<void>((done) => {
        const f: Flight = {
          id: nextId.current++,
          piece,
          color,
          path,
          born: performance.now(),
          contacts: new Set(),
          onContact,
          done,
          s: path.sample(0),
        };
        flights.current.push(f);
        setShown([...flights.current]);
        if (shakeTarget.current)
          boardViews
            .get(shakeTarget.current)
            ?.flights(
              flights.current.map((f) => ({
                id: f.id,
                piece: f.piece,
                color: f.color,
                s: { ...f.s },
              })),
            );
        run();
      });
    },
    burst(at, kind, o = {}) {
      const p = screen(at),
        now = performance.now(),
        u = p.u;
      const count =
        o.count ??
        { dust: 10, stars: 9, shards: 28, spark: 14, confetti: 46, zzz: 1 }[
          kind
        ];
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const base: Particle = {
          kind: "particle",
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          g: 0,
          size: u * 0.08,
          color: "#fff",
          born: now,
          life: 600,
        };
        if (kind === "dust") {
          const side = Math.random() < 0.5 ? -1 : 1;
          add({
            ...base,
            vx: side * u * (0.8 + Math.random() * 1.6),
            vy: -u * Math.random() * 0.6,
            g: u * 1.5,
            drag: 3,
            size: u * (0.07 + Math.random() * 0.08),
            color: ["#d8c3a0", "#b89a72", "#efe2c8"][i % 3],
            life: 420 + Math.random() * 260,
          });
        } else if (kind === "stars") {
          add({
            ...base,
            vx: Math.cos(a) * u * 2.6,
            vy: Math.sin(a) * u * 2 - u,
            g: u * 3,
            drag: 2,
            glyph: i % 3 ? "✦" : "★",
            size: u * 0.32,
            color: ["#ffe46b", "#fff8cf", "#ffb347"][i % 3],
            life: 700,
          });
        } else if (kind === "shards") {
          const colors = o.colors ?? pieceColors("w");
          add({
            ...base,
            vx:
              Math.cos(a) * u * (1.5 + Math.random() * 3.5) +
              (o.dir?.x ?? 0) * u * 2,
            vy: Math.sin(a) * u * (1 + Math.random() * 2.5) - u * 2.2,
            g: u * 9,
            size: u * (0.06 + Math.random() * 0.1),
            color: colors[i % colors.length],
            life: 700 + Math.random() * 500,
          });
        } else if (kind === "spark") {
          add({
            ...base,
            vx: Math.cos(a) * u * (2 + Math.random() * 3),
            vy: Math.sin(a) * u * (2 + Math.random() * 3),
            drag: 5,
            size: u * 0.07,
            color: ["#fff6b0", "#ffcf4a", "#ff8a3d"][i % 3],
            life: 260 + Math.random() * 200,
          });
        } else if (kind === "confetti") {
          add({
            ...base,
            vx: Math.cos(a) * u * (1 + Math.random() * 4),
            vy: -u * (2.5 + Math.random() * 4),
            g: u * 6,
            drag: 0.6,
            size: u * (0.08 + Math.random() * 0.06),
            color: (o.colors ?? [
              "#ffd84a",
              "#5ab0ff",
              "#ff6b8b",
              "#7dffb0",
              "#ffffff",
            ])[i % 5],
            life: 1400 + Math.random() * 800,
          });
        } else if (kind === "zzz") {
          add({
            ...base,
            x: p.x + u * 0.2,
            vx: u * 0.35,
            vy: -u * 0.7,
            glyph: "z",
            size: u * (0.28 + Math.random() * 0.12),
            color: "#dbeaff",
            life: 1600,
          });
        }
      }
    },
    text(at, text, tone = "hit", size) {
      const p = screen(at);
      add({
        kind: "text",
        x: p.x,
        y: p.y,
        text,
        tone,
        size: Math.round(size ?? Math.max(14, p.u * 0.42)),
        born: performance.now(),
        life: 1100,
      });
    },
    ring(at, color = "#fff2c4") {
      const p = screen(at);
      add({
        kind: "ring",
        x: p.x,
        y: p.y,
        r: p.u * 1.3,
        color,
        born: performance.now(),
        life: 520,
      });
    },
    tracer(from, to) {
      const a = screen(from),
        b = screen(to);
      add({
        kind: "tracer",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        born: performance.now(),
        life: 160,
      });
    },
    reticle(square, tone, ms = 1300) {
      const c = squarePoint(square),
        r = SQUARE / 2 - 0.4;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([dx, dy]) => {
        const p = projectRef.current(c.x + dx * r, c.y + dy * r);
        return { x: p.x, y: p.y };
      });
      add({
        kind: "reticle",
        corners,
        tone,
        born: performance.now(),
        life: ms,
      });
    },
    flash(color = "#fffbe8", ms = 220) {
      add({ kind: "flash", color, born: performance.now(), life: ms });
    },
    shake(power) {
      const el = shakeTarget.current;
      if (!el || reduced() || !el.animate) return;
      // A decaying rumble: alternating side-to-side jolts with a little roll,
      // so a heavy hit reads as the board itself shuddering.
      const amp = 3 + power * 10;
      const tilt = Math.min(1.4, power * 0.55);
      const frames = Array.from({ length: 11 }, (_, i) => {
        const k = (1 - i / 10) ** 1.5;
        const dir = i % 2 ? -1 : 1;
        return {
          transform:
            `translate(${(dir * amp * k * (0.6 + Math.random() * 0.4)).toFixed(1)}px, ` +
            `${((Math.random() - 0.5) * amp * k).toFixed(1)}px) ` +
            `rotate(${(dir * tilt * k).toFixed(2)}deg)`,
        };
      });
      frames[10] = { transform: "translate(0px, 0px) rotate(0deg)" };
      el.animate(frames, { duration: 260 + power * 200, easing: "linear" });
    },
    clear() {
      effects.current = [];
      const old = flights.current;
      flights.current = [];
      old.forEach((f) => f.done());
      setShown([]);
      if (shakeTarget.current) boardViews.get(shakeTarget.current)?.flights([]);
    },
  }));
  useEffect(
    () => () => {
      cancelAnimationFrame(loop.current);
      if (shakeTarget.current) boardViews.get(shakeTarget.current)?.flights([]);
    },
    [],
  );

  return (
    <>
      {shown.map((f) => {
        const p = projectRef.current(f.s.x, f.s.y);
        const lift = f.s.h * p.width;
        return (
          <div
            key={f.id}
            className="fx-piece"
            data-fx-piece={f.piece}
            style={{
              left: p.x,
              top: p.y,
              width: p.width * 0.76,
              height: p.width * 0.96,
              zIndex: Math.round(p.y * 10) + 5,
              opacity: f.s.alpha,
            }}
          >
            <span
              className="fx-shadow"
              style={{
                transform: `scale(${Math.max(0.25, 1 - f.s.h * 0.3)})`,
                opacity: Math.max(0.15, 0.55 - f.s.h * 0.15) * f.s.alpha,
              }}
            />
            <span
              className="fx-piece-art"
              style={{
                transform: `translateY(${-lift}px) rotate(${f.s.rot}deg) scale(${f.s.scale})`,
              }}
            >
              <ChessPiece type={f.piece} color={f.color} />
            </span>
          </div>
        );
      })}
      <canvas ref={canvas} className="fx-canvas" aria-hidden="true" />
    </>
  );
});
export default FxLayer;
