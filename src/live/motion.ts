import { useEffect, useRef, useState } from "react";
export type Point = { x: number; y: number };
export const WALK_SPEED = 18.75; // board percent/second: 1.5 squares per second
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
  const position = useRef<Point>({ x: 81.25, y: 18.75 });
  const [actor, setActor] = useState(position.current),
    [facing, setFacing] = useState(1),
    [moving, setMoving] = useState(false);
  const job = useRef<{ to: Point; done: (ok: boolean) => void } | null>(null);
  const stop = () => {
    const old = job.current;
    job.current = null;
    old?.done(false);
    setMoving(false);
  };
  const walkTo = (to: Point) => {
    stop();
    setFacing(to.x < position.current.x ? -1 : 1);
    setMoving(true);
    return new Promise<boolean>((done) => (job.current = { to, done }));
  };
  useEffect(() => {
    let frame = 0,
      last = performance.now();
    const tick = (time: number) => {
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      const current = job.current;
      if (current) {
        position.current = advance(position.current, current.to, dt);
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
