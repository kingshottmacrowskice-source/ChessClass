import { useEffect, useRef, useState } from "react";
export type Point = { x: number; y: number };
export const WALK_SPEED = 18.75; // board percent/second: 1.5 squares per second
export const REST_MIN_MS = 45000;
export const REST_RANGE_MS = 30000;
export function roamTarget(
  from: Point,
  occupied: Point[],
  random = Math.random,
): Point {
  for (let attempt = 0; attempt < 16; attempt++) {
    const to = {
      x: Math.max(7, Math.min(93, from.x + (random() - 0.5) * 32)),
      y: Math.max(12, Math.min(90, from.y + (random() - 0.5) * 28)),
    };
    if (Math.hypot(to.x - from.x, to.y - from.y) < 8) continue;
    if (occupied.some((p) => Math.hypot(p.x - to.x, p.y - to.y) < 7)) continue;
    return to;
  }
  return from;
}
export function advance(from: Point, to: Point, seconds: number): Point {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    d = Math.hypot(dx, dy),
    step = WALK_SPEED * seconds;
  return d <= step
    ? to
    : { x: from.x + (dx / d) * step, y: from.y + (dy / d) * step };
}
export function useWalker() {
  const position = useRef<Point>({ x: 82, y: 32 });
  const [actor, setActor] = useState(position.current),
    [facing, setFacing] = useState(1),
    [moving, setMoving] = useState(false);
  const job = useRef<{
    to: Point;
    pace: number;
    done: (ok: boolean) => void;
  } | null>(null);
  const stop = () => {
    const old = job.current;
    job.current = null;
    old?.done(false);
    setMoving(false);
  };
  const walkTo = (to: Point, pace = 1) => {
    stop();
    setFacing(to.x < position.current.x ? -1 : 1);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      position.current = to;
      setActor(to);
      return Promise.resolve(true);
    }
    setMoving(true);
    return new Promise<boolean>((done) => (job.current = { to, pace, done }));
  };
  useEffect(() => {
    let frame = 0,
      last = performance.now();
    const tick = (time: number) => {
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      const current = job.current;
      if (current) {
        position.current = advance(
          position.current,
          current.to,
          dt * current.pace,
        );
        setActor(position.current);
        if (position.current === current.to) {
          job.current = null;
          setMoving(false);
          current.done(true);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      const old = job.current;
      job.current = null;
      old?.done(false);
    };
  }, []);
  return { actor, facing, moving, walkTo, stop };
}
