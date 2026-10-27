/** Instant local reactions, used without AI and as the first beat before a model replies. */
const pools = {
  myCapture: [
    "这枚{piece}，我收下了。",
    "{piece}？谢谢款待～",
    "嘿咻——{piece}出局！",
    "{square}现在归我了。",
  ],
  lostPiece: [
    "我的{piece}！你们给我记住！",
    "呜……{piece}被吃了。",
    "等等，{piece}怎么就没了？",
    "好、好吧，{piece}算你们的。",
  ],
  myCheck: ["将军！你们的王在发抖哦。", "将军～先护好国王。", "叮！将军！"],
  gotChecked: ["呀！将我军？", "别、别过来！", "国王快跑！"],
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
  if (/^O-O-O/.test(san)) return withSuffix(san, "长易位（王向后翼走两格，车跳过王）");
  if (/^O-O/.test(san)) return withSuffix(san, "短易位（王向王翼走两格，车跳过王）");
  const m = san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?/);
  if (!m) return san;
  const [, piece, file, rank, capture, to, promo] = m;
  const who = pieceName[(piece || "p").toLowerCase()];
  const from = file || rank ? `（${file ?? ""}${rank ?? ""} 的那个）` : "";
  let text = `${who}${from}${capture ? " 吃 " : " 走到 "}${to}`;
  if (promo) text += `，升变为${pieceName[promo.toLowerCase()]}`;
  return withSuffix(san, text);
}
const withSuffix = (san: string, text: string) =>
  san.endsWith("#") ? text + "，将死" : san.endsWith("+") ? text + "，将军" : text;
