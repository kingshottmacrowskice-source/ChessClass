export const actions = [
  { key: "idle", name: "待机 · 静息眨眼", loop: true, ms: 140, impact: 0 },
  { key: "walk", name: "行走 · 交替步伐", loop: true, ms: 105, impact: 0 },
  { key: "think", name: "思考 · 托腮", loop: true, ms: 230, impact: 0 },
  { key: "wave", name: "欢迎 · 招手", loop: true, ms: 150, impact: 0 },
  { key: "carry", name: "搬棋 · 举棋行走", loop: true, ms: 110, impact: 0 },
  // Strike frames: the kick is fully extended / the shot fires on frame 4.
  { key: "kick", name: "吃子 · 踢击", loop: false, ms: 95, impact: 3 },
  { key: "shoot", name: "吃子 · 射击", loop: false, ms: 110, impact: 3 },
  // The throw releases on frame 3, then she settles.
  { key: "drop", name: "落子 · 放下", loop: false, ms: 115, impact: 2 },
  { key: "slide", name: "落子 · 推滑", loop: false, ms: 105, impact: 3 },
] as const;
export type ActionKey = (typeof actions)[number]["key"];
export const FRAME_MS = 140;
export const FRAME_COUNT = 6;
export const rowOf = (key: string) =>
  Math.max(
    0,
    actions.findIndex((a) => a.key === key),
  );
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
const frameMs = (row: number) => (actions[row] || actions[0]).ms;
/** Frame shown `elapsed` ms after a clip started. */
export const frameAt = (row: number, elapsed: number) =>
  actionFrame(row, Math.floor(Math.max(0, elapsed) / frameMs(row)));
/** Full length of a one-shot clip. */
export const clipMs = (row: number) => FRAME_COUNT * frameMs(row);
/** Moment the strike/release frame appears. */
export const impactMs = (row: number) =>
  ((actions[row] || actions[0]).impact + 0.4) * frameMs(row);
