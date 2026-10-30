import "./doom.css";
export default function DoomEffect({
  active,
  craters,
  project,
  interrupted = false,
}: {
  interrupted?: boolean;
  active: string | null;
  craters: string[];
  project: (x: number, y: number) => { x: number; y: number; width: number };
}) {
  return (
    <>
      {[...craters, ...(active ? [active] : [])].map((square) => {
        const p = project(
          (square.charCodeAt(0) - 97) * 12.5 + 6.25,
          (8 - Number(square[1])) * 12.5 + 6.25,
        );
        const firing = square === active;
        return (
          <div
            key={square}
            className={"doom-effect " + (firing ? "doom-firing" : "")}
            style={{ left: p.x, top: p.y, width: p.width, height: p.width }}
            title={firing ? "毁灭菇" : "永久坑位：禁止落子"}
          >
            <svg
              viewBox="0 0 32 32"
              shapeRendering="crispEdges"
              role="img"
              aria-label={firing ? "毁灭菇爆炸" : "不可落子的坑"}
            >
              {(!firing || !interrupted) && (
                <g className="doom-pit">
                  <path fill="#73513d" d="M6 16h20v3h4v7h-4v3H6v-3H2v-7h4z" />
                  <path fill="#211c28" d="M8 19h16v3h3v4H5v-4h3z" />
                  <path fill="#100e18" d="M10 22h12v4H10z" />
                </g>
              )}
              {firing && (
                <>
                  <g className="doom-mushroom">
                    <path fill="#dbc7ae" d="M12 17h9v10h-9z" />
                    <path fill="#392b49" d="M7 5h18v4h4v10H3V9h4z" />
                    <path fill="#8e67aa" d="M9 6h14v3h4v5H5V9h4z" />
                    <path fill="#d2b3df" d="M8 9h5v3H8zm11-2h4v4h-4z" />
                    <path fill="#251b30" d="M13 20h2v3h-2zm5 0h2v3h-2z" />
                  </g>
                  {!interrupted && (
                    <g className="doom-cloud">
                      <path
                        fill="#604265"
                        d="M11 3h10v3h7v4h4v9h-5v4H5v-4H0v-9h4V6h7z"
                      />
                      <path fill="#f2aa50" d="M8 8h16v3h5v7H3v-7h5z" />
                      <path fill="#ffe5a1" d="M10 9h12v6H10z" />
                      <path fill="#ac735b" d="M12 19h8v9h5v3H7v-3h5z" />
                    </g>
                  )}
                </>
              )}
            </svg>
          </div>
        );
      })}
    </>
  );
}
