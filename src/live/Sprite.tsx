import { useEffect, useRef, useState } from "react";
import { actions, actionAsset } from "./actions";
// Keep the source artwork detail instead of reducing each frame to 32 pixels.
const FRAME_SIZE = 512;
const CANVAS_HEIGHT = FRAME_SIZE * 1.25;
const FOOT_BASELINE = FRAME_SIZE * (34 / 32);
const baselines = new WeakMap<HTMLImageElement, number[]>();
const cache = new Map<string, Promise<HTMLImageElement>>();
function load(src: string) {
  if (!cache.has(src))
    cache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const probe = document.createElement("canvas");
          probe.width = img.width;
          probe.height = img.height;
          const ctx = probe.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, img.width, img.height).data;
          const cw = img.width / 3,
            ch = img.height / 2;
          const bottoms = Array.from({ length: 6 }, (_, f) => {
            let bottom = ch * 0.85;
            const ox = (f % 3) * cw,
              oy = Math.floor(f / 3) * ch;
            outer: for (let y = ch - 1; y >= ch * 0.5; y--) {
              for (let x = 0; x < cw; x += 2) {
                if (data[((oy + y) * img.width + ox + x) * 4 + 3] > 160) {
                  bottom = y + 1;
                  break outer;
                }
              }
            }
            return bottom;
          });
          baselines.set(img, bottoms);
          resolve(img);
        };
        img.onerror = () => {
          cache.delete(src);
          reject(new Error("动作素材加载失败"));
        };
        img.src = src;
      }),
    );
  return cache.get(src)!;
}
export default function Sprite({
  frame,
  row,
  facing,
}: {
  frame: number;
  row: number;
  facing: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    [img, setImg] = useState<HTMLImageElement>(),
    [error, setError] = useState(false);
  const action = actions[row] || actions[0];
  useEffect(() => {
    let active = true;
    setImg(undefined);
    setError(false);
    load(actionAsset(row))
      .then((value) => {
        if (active) setImg(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [action.key]);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FRAME_SIZE, CANVAS_HEIGHT);
    if (!img) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const f = Math.max(0, Math.min(5, frame));
    ctx.drawImage(
      img,
      ((f % 3) * img.width) / 3,
      (Math.floor(f / 3) * img.height) / 2,
      img.width / 3,
      img.height / 2,
      0,
      FOOT_BASELINE -
        ((baselines.get(img)?.[f] ?? img.height / 2) * FRAME_SIZE) /
          (img.height / 2),
      FRAME_SIZE,
      FRAME_SIZE,
    );
  }, [img, frame]);
  return (
    <canvas
      ref={ref}
      width={FRAME_SIZE}
      height={CANVAS_HEIGHT}
      className="character-sprite"
      role="img"
      aria-label={error ? "动作素材加载失败" : `大肥鱼：${action.name}`}
      data-frame={frame}
      data-row={row}
      data-loaded={!!img}
      style={{ transform: `scaleX(${facing})` }}
    />
  );
}
