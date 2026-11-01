import type { Giants } from "./obelisk";
/** 巨神兵的 2×2 地面蓝框与护盾文字均已移除，这里不再渲染任何覆盖层。 */
export default function GiantOverlay(_props: {
  giants: Giants;
  project: (x: number, y: number) => { x: number; y: number; width: number };
}) {
  return null;
}
