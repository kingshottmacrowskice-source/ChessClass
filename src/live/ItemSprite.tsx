import { itemImages } from "./itemImages";
import ChessPiece from "./ChessPiece";
import { EMPTY, sprites, type SpriteName } from "./itemSprites";

/**
 * 只画像素方块，不带 `<svg>` 外壳。需要把道具嵌进别的坐标系时用它，
 * 例如毁灭菇要在 32×32 的爆炸图里复用同一张 16×16 贴图。
 */
export function ItemPixels({ item }: { item: Exclude<SpriteName, "summon-cannon"> }) {
  const art = sprites[item];
  const image = itemImages[item];
  if (image) return <image href={image.src} width={art.grid[0].length} height={art.grid.length} preserveAspectRatio="xMidYMax meet" style={{imageRendering: "pixelated"}} />;
  return (
    <>
      {art.grid.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === EMPTY || !art.palette[cell] ? null : (
            <rect
              key={y * row.length + x}
              x={x}
              y={y}
              width="1"
              height="1"
              fill={art.palette[cell]}
            />
          ),
        ),
      )}
    </>
  );
}

/**
 * 道具的场上形象。网格道具逐像素绘制（crispEdges 保持硬边）；
 * 召唤炮直接复用中国象棋的炮子绘制，保证道具与召唤出的棋子完全一致。
 */
export default function ItemSprite({
  item,
  className = "",
}: {
  item: SpriteName;
  className?: string;
}) {
  if (item === "summon-cannon")
    return (
      <span
        className={"item-sprite item-cannon " + className}
        role="img"
        aria-label="召唤炮"
      >
        <ChessPiece type="c" color="b" />
      </span>
    );
  const art = sprites[item];
  const image = itemImages[item];
  if (image) return <img className={"item-sprite " + className} src={image.src} alt={art.label} style={{imageRendering: "pixelated", objectFit: "contain"}} />;
  return (
    <svg
      className={"item-sprite " + className}
      viewBox={`0 0 ${art.grid[0].length} ${art.grid.length}`}
      /* 保持像素比例，并让底边贴住容器底部，飞行时不会浮在半空。 */
      preserveAspectRatio="xMidYMax meet"
      shapeRendering="crispEdges"
      role="img"
      aria-label={art.label}
    >
      <ItemPixels item={item} />
    </svg>
  );
}
