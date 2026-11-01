import { itemImages } from "./itemImages";
import { useEffect, useRef } from "react";
import { EMPTY, sprites, type GridSpriteName } from "./itemSprites";

/**
 * Item art for the 3D board. ThreeBoard copies every `[data-art] canvas` into a
 * texture, so each item draws one canvas pixel per grid cell: the same crisp grid
 * the SVG shows, with no resampling. Wide art keeps its aspect ratio; the board
 * sizes the billboard from the canvas dimensions and `data-pixel-ratio`.
 */
export const ItemCanvas = ({ item }: { item: GridSpriteName }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = sprites[item];
  const imageArt = itemImages[item];
  const width = imageArt?.width ?? art.grid[0].length,
    height = imageArt?.height ?? art.grid.length;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (imageArt) {
      let active = true;
      canvas.current?.removeAttribute("data-loaded");
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let bottom = 0;
        for (let y = height - 1; y >= 0 && !bottom; y--)
          for (let x = 0; x < width; x++)
            if (pixels[(y * width + x) * 4 + 3] >= 100) { bottom = y + 1; break; }
        canvas.current?.setAttribute("data-pixel-bottom", String(bottom));
        canvas.current?.setAttribute("data-pixel-ratio", String(bottom / height));
        canvas.current?.setAttribute("data-loaded", "true");
      };
      image.src = imageArt.src;
      return () => { active = false; };
    }
    art.grid.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        const color = art.palette[cell];
        if (cell === EMPTY || !color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    let bottom = 0;
    for (let y = 0; y < height; y++)
      if ([...art.grid[y]].some((c) => c !== EMPTY)) bottom = y + 1;
    canvas.current?.setAttribute("data-pixel-bottom", String(bottom));
    canvas.current?.setAttribute("data-pixel-ratio", String(bottom / height));
    canvas.current?.setAttribute("data-loaded", "true");
  }, [item, width, height, art, imageArt]);
  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      className="item-canvas-art"
      role="img"
      aria-label={art.label}
    />
  );
};
export default ItemCanvas;
