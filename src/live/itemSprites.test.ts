import { describe, expect, it } from "vitest";
import {
  EMPTY,
  ITEM_BOARD_WIDTH,
  isItemSprite,
  sprites,
  type GridSpriteName,
} from "./itemSprites";

const names = Object.keys(sprites) as GridSpriteName[];

describe("item sprites", () => {
  it("covers every artwork the rules can put on the board", () => {
    expect(names.sort()).toEqual([
      "doom-shroom",
      "monster-reborn",
      "tingqiao-stone",
    ]);
    // 召唤炮复用中国象棋炮子，不单独保存网格。
    expect(isItemSprite("summon-cannon")).toBe(true);
    expect(isItemSprite("p")).toBe(false);
    expect(isItemSprite("o")).toBe(false);
  });
  it("declares a rectangular grid with no ragged rows", () => {
    for (const name of names) {
      const { grid } = sprites[name];
      expect(grid.length).toBeGreaterThan(0);
      const width = grid[0].length;
      expect(width).toBeGreaterThan(0);
      for (const row of grid)
        expect(row, `${name} 的行宽必须一致`).toHaveLength(width);
    }
  });
  it("gives every drawn pixel a colour and leaves EMPTY transparent", () => {
    for (const name of names) {
      const { grid, palette } = sprites[name];
      expect(palette[EMPTY]).toBeUndefined();
      for (const row of grid)
        for (const cell of row) {
          if (cell === EMPTY) continue;
          // 未登记的颜色会被静默跳过，导致贴图上出现空洞。
          expect(palette[cell], `${name} 缺少颜色 ${cell}`).toBeTruthy();
        }
    }
  });
  it("draws something and has a readable label", () => {
    for (const name of names) {
      const { grid, label } = sprites[name];
      expect(label.length).toBeGreaterThan(0);
      const filled = grid.join("").split("").filter((c) => c !== EMPTY).length;
      // 太稀疏说明这张图基本是空的。
      expect(filled).toBeGreaterThan(grid.length * 2);
    }
  });
  it("keeps items inside one board square", () => {
    expect(ITEM_BOARD_WIDTH).toBeLessThanOrEqual(1);
    expect(ITEM_BOARD_WIDTH).toBeGreaterThan(0.5);
  });
});
