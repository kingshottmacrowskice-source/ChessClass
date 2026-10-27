export const actions = [
  { key: "idle", name: "待机 · 呼吸眨眼", loop: true },
  { key: "walk", name: "行走 · 交替步伐", loop: true },
  { key: "think", name: "思考 · 托腮", loop: true },
  { key: "wave", name: "欢迎 · 招手", loop: true },
  { key: "carry", name: "搬棋 · 举棋行走", loop: true },
  { key: "kick", name: "吃子 · 踢击", loop: false },
  { key: "shoot", name: "吃子 · 射击", loop: false },
  { key: "drop", name: "落子 · 放下", loop: false },
  { key: "slide", name: "落子 · 推滑", loop: false },
] as const;
export const FRAME_MS = 140;
export const FRAME_COUNT = 6;
export const actionFrame = (row: number, tick: number) =>
  actions[row]?.loop ? tick % FRAME_COUNT : Math.min(tick, FRAME_COUNT - 1);
