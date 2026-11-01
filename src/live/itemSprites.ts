/**
 * 魔鱼道具的像素图数据。
 *
 * 每件道具是一张字符网格：一个字符一个像素，`.` 为透明，其余字符查 palette。
 * 造型按各道具的来源作品重新绘制（保留配色与轮廓特征，不复制原素材）：
 * - 毁灭菇 / 植物大战僵尸：深紫色伞盖、奶油色柄、红眼。
 * - 死者苏生 / 游戏王：绿色通常魔法卡框，深色卡图里的白色生命十字。
 * - 听桥技能石 / 洛克王国：世界：刻着武系符文的技能石。
 *
 * 召唤炮不在这里：它和场上召唤出的棋子必须是同一枚中国象棋炮子，直接复用
 * ChessPiece 的 `c` 绘制，见 ItemSprite。
 */
export type SpriteArt = {
  /** 字符网格，第 0 行在最上面。所有行必须等宽。 */
  grid: string[];
  /** 非透明字符 → 颜色。 */
  palette: Record<string, string>;
  /** 无障碍名称。 */
  label: string;
};

export type GridSpriteName =
  | "doom-shroom"
  | "monster-reborn"
  | "tingqiao-stone";
export type SpriteName = GridSpriteName | "summon-cannon";

/** 透明像素。 */
export const EMPTY = ".";

/**
 * 道具在纹理管线里的颜色键。棋子的纹理键是「颜色 + 类型」，道具借同一个
 * `[data-art]` 通道，用 `i` 作颜色、道具名作类型，ThreeBoard 据此换成宽扁精灵。
 */
export const ITEM_ART_COLOR = "i";

/** 网格道具在 3D 棋盘上的统一宽度（棋盘一格为 1）。 */
export const ITEM_BOARD_WIDTH = 0.92;

export const sprites: Record<GridSpriteName, SpriteArt> = {
  "doom-shroom": {
    label: "毁灭菇",
    palette: {
      o: "#1d0f26",
      p: "#5a2d78",
      h: "#8b52b0",
      c: "#e8dcc0",
      r: "#e8434b",
      k: "#14091c",
    },
    grid: [
      "................",
      ".....oooooo.....",
      "...ooppppppoo...",
      "..oppphhhhpppo..",
      ".opppphhhhppppo.",
      ".oppppppppppppo.",
      "oppppppppppppppo",
      "oppppppppppppppo",
      ".oppppppppppppo.",
      "..oooooooooooo..",
      "...occcccccco...",
      "...ocrrccrrco...",
      "...occkkckkco...",
      "...occcccccco...",
      "....occcccco....",
      ".....oooooo.....",
    ],
  },
  "monster-reborn": {
    label: "魔法卡·死者苏生",
    palette: {
      o: "#0d2a1a",
      l: "#57b878",
      g: "#2d7f4e",
      b: "#0f0d1b",
      w: "#eaf6ff",
    },
    grid: [
      "oooooooooooo",
      "ollllllllllo",
      "ogbbbbbbbbgo",
      "ogbbwwwwbbgo",
      "ogbbwbbwbbgo",
      "ogbbwbbwbbgo",
      "ogbbbwwbbbgo",
      "ogbbwwwwbbgo",
      "ogbwwwwwwbgo",
      "ogbbwwwwbbgo",
      "ogbbbbbbbbgo",
      "oggggggggggo",
      "oglwwwwwwlgo",
      "oggggggggggo",
      "oooooooooooo",
    ],
  },
  "tingqiao-stone": {
    label: "技能石·听桥",
    palette: {
      d: "#2a2230",
      S: "#8b8494",
      h: "#c9c3cf",
      a: "#ffb347",
      A: "#ffe9a8",
    },
    grid: [
      "....dddd....",
      "..ddSSSSdd..",
      ".dSSShhSSSd.",
      "dSSShaaahSSd",
      "dSShAaaAhSSd",
      "dSShAaaAhSSd",
      "dSSShaaahSSd",
      "dSSSSShhSSSd",
      ".dSSSSSSSSd.",
      "..ddSSSSdd..",
      "...ddSSdd...",
      "....dddd....",
    ],
  },

};

const ITEM_NAMES = new Set<string>([...Object.keys(sprites), "summon-cannon"]);

/** 飞行/瞬态物件该画道具还是画棋子。 */
export function isItemSprite(piece: string): piece is SpriteName {
  return ITEM_NAMES.has(piece);
}
