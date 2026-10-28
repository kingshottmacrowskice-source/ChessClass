import { useLayoutEffect, useRef, useState } from "react";
import { boardViews } from "./camera";

/** DOM effects share the WebGL camera's projection, including during a dolly. */
export function useBoardProjection() {
  const ref = useRef<HTMLDivElement>(null);
  const [revision, update] = useState(0);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const changed = () => update((v) => v + 1);
    host.addEventListener("board-view", changed);
    changed();
    return () => host.removeEventListener("board-view", changed);
  }, []);
  void revision;
  const project = (x: number, y: number) =>
    (ref.current && boardViews.get(ref.current)?.project(x, y)) || {
      x: 0,
      y: 0,
      width: 0,
    };
  return { ref, project, ready: !!ref.current && boardViews.has(ref.current) };
}
