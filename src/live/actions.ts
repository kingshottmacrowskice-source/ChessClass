export const actions = [
  { key: "idle", name: "待机 · 静息眨眼", loop: true },
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
export const actionAsset = (row: number) =>
  `/live/actions-v2/${row === 0 ? "idle-calm-v3" : (actions[row] || actions[0]).key}.png`;
export const frameHold = (row: number, frame: number) =>
  row === 0 ? [12, 10, 1, 1, 1, 10][frame] : 1;
export const actionFrame = (row: number, tick: number) => {
  if (row === 0) {
    let phase = tick % 35;
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const hold = frameHold(row, frame);
      if (phase < hold) return frame;
      phase -= hold;
    }
  }
  return actions[row]?.loop
    ? tick % FRAME_COUNT
    : Math.min(tick, FRAME_COUNT - 1);
};
