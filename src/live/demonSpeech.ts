import type { DemonAction } from "./demonFish";

/** Spoken reactions are separate from the factual action labels in the log. */
export function demonSpeech(action: DemonAction): string {
  let lines: readonly string[];
  switch (action.item ?? action.skill ?? action.kind) {
    case "destroy":
      lines = [
        "你这个棋子叛变了，我帮你处理掉。",
        "这颗棋子我看着不太顺眼，先拿走了啊。",
        "它刚才说想下班，我同意了。",
        "别找了，你那颗棋子让我收走了。",
        "这颗留着太碍事了，我替你腾个地方。",
      ];
      break;
    case "movement":
      lines = [
        "虽然规则上没写，但是我就是能这么走。",
        "你问它怎么能这么走？我教的。",
        "偶尔换个走法嘛，别这么死板。",
        "先走了啊，规则的事咱们一会儿再聊。",
        "我这颗棋子会的比较多，你慢慢适应。",
      ];
      break;
    case "doom-shroom":
      lines = [
        "你这边有点挤啊，种个毁灭菇，松快松快。",
        "下棋带个蘑菇怎么了？又没说不让带。",
        "借个地方种蘑菇啊，动静可能有点大。",
        "哎，这蘑菇可不是拿来吃的。",
      ];
      break;
    case "monster-reborn":
      lines = [
        "刚才那颗不算白送，我还能捞回来。",
        "谁说被吃了就得退场？回来接着上班。",
        "你吃你的，我复活我的，没毛病吧。",
        "别急着高兴，它又回来了。",
      ];
      break;
    case "summon-cannon":
      lines = [
        "我从隔壁象棋借了门炮，凑合用用。",
        "国际象棋没有炮？现在有了。",
        "等一下，我叫个外援。对，就是这门炮。",
        "都是下棋的，借门炮不过分吧。",
      ];
      break;
    case "londinium-artillery":
      lines = ["城防副炮已经瞄准了，三步后见。", "青春版也是炮，你们最好散开一点。", "借了门城防炮，范围里的可都要挨一下。"];
      break;
    case "summon-obelisk":
      lines = ["三颗棋子换一位巨神兵，这买卖我做了。", "给欧贝利斯克腾个位子，它有点大。"];
      break;
    case "obelisk-fury":
      lines = ["两位先退场，巨神兵要动手了。", "前面这两行，准备接招。"];
      break;
    case "tingqiao-stone":
      lines = [
        "给它补个课，听桥这招现学现用。",
        "这颗我偷偷培训过了，现在会听桥。",
        "等一下，给它装个听桥，你再琢磨琢磨。",
        "下着下着学会个听桥，很合理吧。",
      ];
      break;
    default:
      lines = ["我还有这一手呢，没想到吧。", "这招你先看着，我就不细解释了。"];
  }
  return lines[Math.floor(Math.random() * lines.length)];
}
