/** Instant local reactions, used without AI and as the first beat before a model replies. */
const pools = {
  myCapture: [
    "这枚{piece}，我收下了。",
    "{piece}？谢谢款待～",
    "嘿咻——{piece}出局！",
    "{square}现在归我了。",
  ],
  lostPiece: [
    "呜哇，我的{piece}！这下记住你们了。",
    "呜呜……{piece}真被你们拿走了。",
    "哦吼？我的{piece}呢？刚刚还在呀！",
    "唔咕，{piece}给你们，别得意太早。",
  ],
  myCheck: ["将军！你们的王在发抖哦。", "将军～先护好国王。", "叮！将军！"],
  gotChecked: [
    "哦吼哦吼，还真将到我了？",
    "呜哇！先让国王躲一下！",
    "咦咦？别追着我的王跑呀！",
    "唔咕……这步有点凶。",
  ],
  gotMated: [
    "呜……真没路了，这局我输了。",
    "哦吼？将死了？好吧，这次算你们厉害。",
    "咕呜……王跑不掉了。再来一局！",
    "呜哇，输掉了！下局我可要认真了。",
  ],
  myMate: ["将死！嘿嘿，这局我赢了。", "哦吼，国王没路可走了，我赢啦！"],
  myMove: [
    "{san}，就放这儿。",
    "{san}！轮到你们了。",
    "嗯……{san}，你们接得住吗？",
    "落子 {san}。下一步投什么？",
  ],
  theirMove: [
    "{san}？让我想想……",
    "观众选了 {san}，有意思。",
    "{san}啊，我看看。",
    "哦？{san}。",
  ],
  firstVote: [
    "第一票 {move}！10 秒内没人跟就落子咯。",
    "{name} 投了 {move}，还有人吗？",
  ],
  leadChange: ["{move} 反超了！", "风向变了，{move} 领先！"],
  welcome: [
    "欢迎 {names}！发 e4 或 马到f3 就能投票～",
    "{names} 来啦！一起来对付我吧。",
    "欢迎欢迎，{names}！",
  ],
  idle: [
    "你们在想什么呢？",
    "发个 e4 试试？",
    "下一步要不要投票呀～",
    "我等得都要睡着了……",
  ],
  wake: ["唔！我没睡！", "啊，来人了！"],
};
export type LineKind = keyof typeof pools;
const last = new Map<LineKind, number>();
export function line(
  kind: LineKind,
  vars: Record<string, string> = {},
  random = Math.random,
) {
  const list = pools[kind];
  let i = Math.floor(random() * list.length);
  // Avoid repeating the same line twice in a row.
  if (list.length > 1 && i === last.get(kind)) i = (i + 1) % list.length;
  last.set(kind, i);
  return list[i].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const pieceName: Record<string, string> = {
  p: "兵",
  n: "马",
  b: "象",
  r: "车",
  q: "后",
  k: "王",
};

/** Read SAN aloud in Chinese, e.g. Nxe5+ → 马 吃 e5，将军. */
export function explainSan(san: string) {
  if (/^O-O-O/.test(san))
    return withSuffix(san, "长易位（王向后翼走两格，车跳过王）");
  if (/^O-O/.test(san))
    return withSuffix(san, "短易位（王向王翼走两格，车跳过王）");
  const m = san.match(
    /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?/,
  );
  if (!m) return san;
  const [, piece, file, rank, capture, to, promo] = m;
  const who = pieceName[(piece || "p").toLowerCase()];
  const from = file || rank ? `（${file ?? ""}${rank ?? ""} 的那个）` : "";
  let text = `${who}${from}${capture ? " 吃 " : " 走到 "}${to}`;
  if (promo) text += `，升变为${pieceName[promo.toLowerCase()]}`;
  return withSuffix(san, text);
}
const withSuffix = (san: string, text: string) =>
  san.endsWith("#")
    ? text + "，将死"
    : san.endsWith("+")
      ? text + "，将军"
      : text;

const japanesePools = {
  myCapture: [
    "この{piece}、いただきます。",
    "{piece}？ごちそうさま。",
    "よいしょ、{piece}は退場！",
    "{square}は私のもの。",
  ],
  lostPiece: [
    "うわっ、私の{piece}！覚えておいてよ。",
    "ううっ……{piece}、本当に取られちゃった。",
    "オホ？私の{piece}は？さっきまでいたのに！",
    "うぐっ、{piece}はあげる。まだ調子に乗らないでよ。",
  ],
  myCheck: [
    "チェック！みんなのキング、震えてるよ。",
    "チェック。まずキングを守ってね。",
    "はい、チェック！",
  ],
  gotChecked: [
    "ほぉほぉ、本当にチェックしてきたの？",
    "うわっ！まずはキングを逃がさなきゃ！",
    "ええっ？私のキングを追いかけないでよ！",
    "うぐっ……その一手、ちょっと厳しいね。",
  ],
  gotMated: [
    "ううっ……もう逃げ道がない。私の負けだよ。",
    "オホ？チェックメイト？わかった、今回はみんなの勝ち。",
    "ぐぬぬ……キングが逃げられない。もう一局！",
    "うわぁ、負けちゃった！次は本気でいくからね。",
  ],
  myMate: [
    "チェックメイト！えへへ、私の勝ち。",
    "オホ、キングの逃げ道がないね。私の勝ち！",
  ],
  myMove: [
    "{san}、ここに置こう。",
    "{san}！みんなの番だよ。",
    "うーん、{san}。受けられるかな？",
    "{san}。次は何に投票する？",
  ],
  theirMove: [
    "{san}？ちょっと考えさせて。",
    "みんなは{san}を選んだんだ。面白いね。",
    "{san}か。見てみよう。",
    "おや？{san}。",
  ],
};
const japanesePieces: Record<string, string> = {
  p: "ポーン",
  n: "ナイト",
  b: "ビショップ",
  r: "ルーク",
  q: "クイーン",
  k: "キング",
};
export function moveReaction(m: {
  color: string;
  piece: string;
  captured?: string;
  to: string;
  san: string;
}) {
  const mine = m.color === "b";
  // Mate/check take precedence even when the checking move captures a piece.
  const kind = m.san.endsWith("#")
    ? mine
      ? "myMate"
      : "gotMated"
    : m.san.endsWith("+")
      ? mine
        ? "myCheck"
        : "gotChecked"
      : m.captured
        ? mine
          ? "myCapture"
          : "lostPiece"
        : mine
          ? "myMove"
          : "theirMove";
  const square = m.to.replace(
    /[a-h]/g,
    (c) =>
      ({
        a: "エー",
        b: "ビー",
        c: "シー",
        d: "ディー",
        e: "イー",
        f: "エフ",
        g: "ジー",
        h: "エイチ",
      })[c]!,
  );
  const vars = {
    piece: pieceName[m.captured || m.piece],
    square: m.to,
    san: m.san,
  };
  const text = line(kind, vars);
  const jaVars: Record<string, string> = {
    piece: japanesePieces[m.captured || m.piece],
    square,
    san: /^O-O-O/.test(m.san)
      ? "クイーンサイドにキャスリング"
      : /^O-O/.test(m.san)
        ? "キングサイドにキャスリング"
        : `${japanesePieces[m.piece]}を${square}へ`,
  };
  const japanese = japanesePools[kind][last.get(kind)!].replace(
    /\{(\w+)\}/g,
    (_, k) => jaVars[k] ?? "",
  );
  return { text, japanese, kind };
}

/** All fixed Japanese utterances, including piece/square substitutions. */
export function localJapaneseLines() {
  const squares = [
    ..."エー,ビー,シー,ディー,イー,エフ,ジー,エイチ".split(","),
  ].flatMap((f) => Array.from({ length: 8 }, (_, i) => f + (i + 1)));
  const pieces = Object.values(japanesePieces);
  const moves = pieces
    .flatMap((p) => squares.map((s) => `${p}を${s}へ`))
    .concat(["クイーンサイドにキャスリング", "キングサイドにキャスリング"]);
  const result = new Set([
    "うっ、寝てないよ！",
    "新しい対局！みんなが先手だよ。",
  ]);
  for (const template of Object.values(japanesePools).flat()) {
    const values = template.includes("{piece}")
      ? pieces
      : template.includes("{square}")
        ? squares
        : template.includes("{san}")
          ? moves
          : [""];
    for (const value of values) result.add(template.replace(/\{\w+\}/g, value));
  }
  return [...result];
}
