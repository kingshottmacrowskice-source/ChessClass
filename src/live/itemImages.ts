import type { GridSpriteName } from "./itemSprites";
/** User-supplied artwork shared by previews, effects and board textures. */
export const itemImages: Partial<Record<GridSpriteName, { src: string; width: number; height: number }>> = {
  "tingqiao-stone": { src: `${import.meta.env.BASE_URL}assets/items/tingqiao-star-v1.png`, width: 1254, height: 1254 },
  "monster-reborn": { src: `${import.meta.env.BASE_URL}assets/items/monster-reborn-user-v1.png`, width: 381, height: 558 },
  "doom-shroom": { src: `${import.meta.env.BASE_URL}assets/items/doom-shroom-user-v1.png`, width: 1254, height: 1254 },
};
