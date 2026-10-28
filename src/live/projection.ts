import { useLayoutEffect, useRef, useState } from "react";
import { withoutCamera } from "./camera";

type Row = { left: number; right: number; y: number; width: number };
// Measure the projected floor, then place upright billboards in a separate layer.
export function useBoardProjection() {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    // A camera shot scales the stage; measure the board as authored, not as filmed.
    const measure = () => withoutCamera(() => {
      const origin = container.getBoundingClientRect();
      const cells = [...container.querySelectorAll(".pixel-square")];
      if (cells.length !== 64) return;
      setRows(
        Array.from({ length: 8 }, (_, row) => {
          const a = cells[row * 8].getBoundingClientRect();
          const b = cells[row * 8 + 7].getBoundingClientRect();
          return {
            left: (a.left + a.right) / 2 - origin.left,
            right: (b.left + b.right) / 2 - origin.left,
            y: (a.top + a.bottom) / 2 - origin.top,
            width: a.width,
          };
        }),
      );
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const project = (x: number, y: number) => {
    if (!rows.length) return { x: 0, y: 0, width: 0 };
    const row = (y - 6.25) / 12.5;
    const first = Math.max(0, Math.min(6, Math.floor(row)));
    const t = row - first;
    const mix = (a: number, b: number) => a + (b - a) * t;
    const a = rows[first],
      b = rows[first + 1];
    const left = mix(a.left, b.left),
      right = mix(a.right, b.right);
    return {
      x: left + (right - left) * ((x - 6.25) / 87.5),
      y: mix(a.y, b.y),
      width: mix(a.width, b.width),
    };
  };
  return { ref, project, ready: rows.length === 8 };
}
