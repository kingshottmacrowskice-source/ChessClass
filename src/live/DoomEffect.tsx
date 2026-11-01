import { useId, type CSSProperties } from "react";
import { itemImages } from "./itemImages";
import "./doom.css";
const base = `${import.meta.env.BASE_URL}assets/effects/`;
// Bounds are explicit because the generated sheet has unequal frame spacing.
// All frames retain the same pixel scale and ground baseline.
const frames = [
  [65, 530, 200, 165], [370, 370, 225, 325],
  [630, 290, 270, 405], [900, 195, 354, 500],
  [0, 700, 410, 500], [410, 735, 300, 465],
  [735, 800, 245, 400], [1030, 850, 224, 350],
];
// 爆炸蘑菇云在 32×32 视图内的缩放：原始尺寸的两倍（0.075 × 2）。
const cloudScale = 0.075 * 2;
// 蘑菇云底部基准线：原为 27，往下移 3 个单位到 30（32 为棋盘格底边）。
const cloudBaseline = 30;
export default function DoomEffect({active, craters, project, interrupted = false}: {
  interrupted?: boolean; active: string | null; craters: string[];
  project: (x: number, y: number) => {x: number; y: number; width: number};
}) {
  const id = useId().replace(/:/g, "");
  return <>{[...new Set([...craters, ...(active ? [active] : [])])].map(square => {
    const p = project((square.charCodeAt(0) - 97) * 12.5 + 6.25, (8 - Number(square[1])) * 12.5 + 6.25);
    const firing = square === active;
    const cap = `${id}-${square}-cap`, stem = `${id}-${square}-stem`;
    return <div key={square} className={"doom-effect " + (firing ? "doom-firing" : "")}
      style={{left:p.x,top:p.y,width:p.width,height:p.width}}
      title={firing ? "毁灭菇" : "永久坑位：禁止落子"}>
      <svg viewBox="0 0 32 32" shapeRendering="crispEdges" role="img" aria-label={firing ? "毁灭菇爆炸" : "不可落子的坑"}>
        {(!firing || !interrupted) && <g className="doom-pit">
          <image href={`${base}doom-crater-user.png`} x="0" y="14" width="32" height="18" preserveAspectRatio="none" />
        </g>}
        {firing && <>
          <svg x="3" y="-1" width="26" height="26" viewBox="0 0 1254 1254" className="doom-mushroom">
            <defs>
              <clipPath id={cap}><rect width="1254" height="730" /></clipPath>
              <clipPath id={stem}><rect y="730" width="1254" height="524" /></clipPath>
            </defs>
            <g className="doom-stem" clipPath={`url(#${stem})`}><image href={itemImages["doom-shroom"]!.src} width="1254" height="1254" /></g>
            <g className="doom-cap"><g clipPath={`url(#${cap})`}><image href={itemImages["doom-shroom"]!.src} width="1254" height="1254" /></g></g>
          </svg>
          {!interrupted && <g className="doom-cloud">
            {frames.map(([x,y,w,h], index) => <g key={index} className="doom-cloud-frame" style={{"--frame":index} as CSSProperties}>
              <svg x={16 - w * cloudScale / 2} y={cloudBaseline - h * cloudScale} width={w * cloudScale} height={h * cloudScale} viewBox={`${x} ${y} ${w} ${h}`} overflow="hidden">
                <image href={`${base}doom-cloud-8frames.png`} width="1254" height="1254" />
              </svg>
            </g>)}
          </g>}
        </>}
      </svg>
    </div>;
  })}</>;
}
