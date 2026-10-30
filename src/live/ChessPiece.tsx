import { useId, useEffect, useRef } from "react";

const names: Record<string, string> = {
  o: "欧贝利斯克的巨神兵",
  c: "炮",
  p: "兵",
  r: "车",
  n: "马",
  b: "象",
  q: "后",
  k: "王",
};

/** Sculpted SVG pieces: shared lighting, turned bases, and distinct silhouettes. */
function SculptedPiece({
  type,
  color = "b",
}: {
  type: string;
  color?: string;
}) {
  const id = useId().replace(/:/g, "");
  const white = color === "w";
  const paint = `url(#${id}-body)`;
  const rim = `url(#${id}-rim)`;
  const edge = white ? "#796b52" : "#080e19";
  return (
    <svg
      className="sculpted-piece-art"
      viewBox="0 0 100 120"
      role="img"
      aria-label={(white ? "白" : "黑") + (names[type] || "兵")}
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={white ? "#a99774" : "#111b2a"} />
          <stop offset=".27" stopColor={white ? "#fff9e6" : "#64778b"} />
          <stop offset=".44" stopColor={white ? "#ecdfbf" : "#304154"} />
          <stop offset=".75" stopColor={white ? "#c3ad83" : "#111a28"} />
          <stop offset="1" stopColor={white ? "#8d7958" : "#060b13"} />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={white ? "#fff8e4" : "#8192a4"} />
          <stop offset=".35" stopColor={white ? "#d6c39e" : "#344457"} />
          <stop offset="1" stopColor={white ? "#9c835b" : "#0b1220"} />
        </linearGradient>
        <radialGradient id={`${id}-orb`} cx=".32" cy=".23" r=".8">
          <stop stopColor={white ? "#fffef2" : "#8897a8"} />
          <stop offset=".4" stopColor={white ? "#eee0be" : "#3a4b60"} />
          <stop offset="1" stopColor={white ? "#927953" : "#080e18"} />
        </radialGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#030810" stopOpacity=".65" />
          <stop offset="1" stopColor="#030810" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        className="piece-contact-shadow"
        cx="53"
        cy="108"
        rx="44"
        ry="11"
        fill={`url(#${id}-shadow)`}
      />
      <g stroke={edge} strokeWidth="1.2" strokeLinejoin="round">
        <path d="M29 89 Q40 77 40 58 L60 58 Q60 77 71 89Z" fill={paint} />
        <ellipse cx="50" cy="61" rx="17" ry="5" fill={rim} />
        {type === "o" && (
          <g stroke="#102442" strokeWidth="2">
            <path d="M28 82L22 48L9 41L6 56L15 78L28 86ZM72 82L78 48L91 41L94 56L85 78L72 86Z" fill="#2862aa"/>
            <path d="M24 43L37 32H63L76 43L67 76H33Z" fill="#387ed1"/>
            <path d="M35 28L26 8L43 21H57L74 8L65 28L62 42H38Z" fill="#528ee0"/>
            <path d="M37 27H46V32H37ZM54 27H63V32H54Z" fill="#ff525d"/>
            <path d="M45 37H55V41H45Z" fill="#182641"/>
            <path d="M35 49H65V57H35ZM40 61H60V69H40Z" fill="#79b6ed"/>
            <path d="M32 75H48L45 101H27ZM52 75H68L73 101H55Z" fill="#204e90"/>
            <path d="M23 99H46V108H20ZM54 99H77L80 108H54Z" fill="#4280bd"/>
            <path d="M8 54H22V76H8ZM78 54H92V76H78Z" fill="#75b5df"/>
          </g>
        )}
        {type === "c" && (
          <g>
            <path d="M24 81 L30 42 L70 42 L76 81Z" fill={paint} />
            <ellipse cx="50" cy="42" rx="20" ry="10" fill={rim} />
            <ellipse cx="50" cy="42" rx="12" ry="6" fill="#080e19" />
            <path d="M28 62H72V69H28Z" fill="#bb8a42" />
            <path d="M34 72H66V83H34Z" fill={rim} />
          </g>
        )}
        {type === "p" && (
          <>
            <path d="M36 57 Q50 49 64 57 L65 62 Q50 68 35 62Z" fill={paint} />
            <circle cx="50" cy="39" r="17" fill={`url(#${id}-orb)`} />
          </>
        )}
        {type === "r" && (
          <>
            <path
              d="M31 31 L31 18 L40 18 L40 28 L46 28 L46 17 L55 17 L55 28 L61 28 L61 18 L70 18 L70 37 L62 47 L60 58 Q50 63 39 58 L38 47 L30 37Z"
              fill={paint}
            />
            <path
              d="M31 36 Q50 42 69 36 M38 47 Q50 51 62 47"
              fill="none"
              stroke={white ? "#fff4d8" : "#718398"}
              strokeWidth="2"
            />
          </>
        )}
        {type === "n" && (
          <>
            <path
              d="M30 61 Q32 48 46 39 L32 43 L23 37 L28 26 L42 17 L44 9 L52 17 L61 14 Q78 24 74 43 L69 62 Q49 68 30 61Z"
              fill={paint}
            />
            <path
              d="M56 20 Q70 31 61 48 L55 58"
              fill="none"
              stroke={white ? "#987e58" : "#080e19"}
              strokeWidth="5"
            />
            <path
              d="M34 29 L42 26"
              stroke={white ? "#fff8e8" : "#b0bdcb"}
              strokeWidth="2"
            />
            <circle cx="43" cy="27" r="2" fill="#101723" />
            <path d="M25 36 L34 37" stroke={edge} fill="none" />
          </>
        )}
        {type === "b" && (
          <>
            <path
              d="M50 14 C38 26 29 34 34 45 Q39 54 50 56 Q65 52 67 41 Q68 30 50 14Z"
              fill={`url(#${id}-orb)`}
            />
            <path d="M55 23 L45 38" stroke={edge} strokeWidth="4" />
            <circle cx="50" cy="12" r="4" fill={rim} />
            <ellipse cx="50" cy="57" rx="18" ry="4" fill={rim} />
          </>
        )}
        {type === "q" && (
          <>
            <path
              d="M27 26 L37 35 L39 18 L49 32 L59 18 L63 35 L74 26 L65 53 Q50 59 35 53Z"
              fill={paint}
            />
            {[
              [27, 24],
              [39, 17],
              [59, 17],
              [74, 24],
            ].map(([cx, cy]) => (
              <circle key={cx} cx={cx} cy={cy} r="4" fill={`url(#${id}-orb)`} />
            ))}
            <ellipse cx="50" cy="54" rx="17" ry="4" fill={rim} />
            <ellipse cx="50" cy="60" rx="18" ry="4" fill={rim} />
          </>
        )}
        {type === "k" && (
          <>
            <path
              d="M46 7 H54 V15 H62 V22 H54 V31 H46 V22 H38 V15 H46Z"
              fill={paint}
            />
            <path d="M31 36 Q50 26 69 36 L62 53 Q50 59 38 53Z" fill={paint} />
            <ellipse cx="50" cy="35" rx="19" ry="5" fill={rim} />
            <ellipse cx="50" cy="56" rx="16" ry="4" fill={rim} />
          </>
        )}
        <path
          d="M29 87 Q50 80 71 87 L76 95 L76 101 Q50 113 24 101 L24 95Z"
          fill={paint}
        />
        <ellipse cx="50" cy="88" rx="21" ry="6" fill={rim} />
        <path
          d="M24 98 Q50 110 76 98 L79 103 L79 107 Q50 119 21 107 L21 103Z"
          fill={paint}
        />
        <path
          d="M23 103 Q50 114 77 103"
          fill="none"
          stroke={white ? "#fff1ce" : "#738497"}
          strokeWidth="1.7"
        />
        <path
          d="M42 68 Q41 78 36 83"
          fill="none"
          stroke={white ? "#fff9e6" : "#8595a8"}
          strokeOpacity=".55"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}

// Rasterize the sculpted forms on a deliberate pixel grid; keep characters high resolution.
export default function ChessPiece({
  type,
  color = "b",
}: {
  type: string;
  color?: string;
}) {
  const source = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const svg = source.current?.querySelector("svg")?.cloneNode(true) as
      SVGElement | undefined;
    if (!svg) return;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "120");
    svg.querySelector(".piece-contact-shadow")?.remove();
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml",
      }),
    );
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, 32, 40);
      ctx.drawImage(image, 0, 0, 32, 40);
      const pixels = ctx.getImageData(0, 0, 32, 40);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i + 3] = pixels.data[i + 3] < 100 ? 0 : 255;
        for (let c = 0; c < 3; c++)
          pixels.data[i + c] = Math.round(pixels.data[i + c] / 16) * 16;
      }
      ctx.putImageData(pixels, 0, 0);
      let bottom = 0;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 32; x++) {
          if (pixels.data[(y * 32 + x) * 4 + 3]) bottom = y + 1;
        }
      }
      // Anchor the floor shadow to visible pixels, not transparent canvas padding.
      canvas.current
        ?.closest<HTMLElement>(".standing-piece")
        ?.style.setProperty("--piece-bottom", `${(bottom / 40) * 100}%`);
      canvas.current?.setAttribute("data-pixel-bottom", String(bottom));
      canvas.current?.setAttribute("data-loaded", "true");
    };
    image.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [type, color]);
  return (
    <>
      <span hidden ref={source} aria-hidden="true">
        <SculptedPiece type={type} color={color} />
      </span>
      <canvas
        ref={canvas}
        width={32}
        height={40}
        className="pixel-chess-art"
        role="img"
        aria-label={(color === "w" ? "白" : "黑") + (names[type] || "兵")}
      />
    </>
  );
}
