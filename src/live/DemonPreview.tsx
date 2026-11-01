import type { DemonAction } from "./demonFish";
import { useState, useEffect } from "react";
import ChessPiece from "./ChessPiece";
import ItemSprite from "./ItemSprite";
import { itemLabels } from "./demonWeights";
import type { SpriteName } from "./itemSprites";
import "./demon-preview.css";

type Entry = {
  id: string;
  name: string;
  art: SpriteName | "obelisk" | null;
  kind: string;
  detail: string;
  condition: string;
};
const items: Entry[] = [
  {
    id: "doom-shroom",
    name: itemLabels["doom-shroom"],
    art: "doom-shroom",
    kind: "范围攻击",
    condition: "落在合法空格",
    detail:
      "临时落场并攻击范围内的敌方非王棋子。攻击会结算护盾与听桥；未被打断时消除自身并留下坑位。",
  },
  {
    id: "monster-reborn",
    name: itemLabels["monster-reborn"],
    art: "monster-reborn",
    kind: "复活",
    condition: "存在可复活的阵亡棋子及合法落点",
    detail:
      "将阵亡棋子带回棋盘。通过此道具复活的巨神兵会在本次行动结束时击破。",
  },
  {
    id: "summon-cannon",
    name: itemLabels["summon-cannon"],
    art: "summon-cannon",
    kind: "召唤",
    condition: "己方半场有合法空格",
    detail:
      "召唤中国象棋炮子。横竖移动，吃子必须隔且仅隔一枚棋子；坑位不能作为炮架。白方红字，黑方黑字。",
  },
  {
    id: "tingqiao-stone",
    name: itemLabels["tingqiao-stone"],
    art: "tingqiao-stone",
    kind: "赋予技能",
    condition: "存在可学习技能的己方棋子",
    detail: "使棋子学会被动技能听桥。具体反击条件与冷却可在技能预览中查看。",
  },
  {
    id: "londinium-artillery",
    name: itemLabels["londinium-artillery"],
    art: null,
    kind: "延迟轰炸",
    condition: "存在可锁定的敌方棋子",
    detail:
      "锁定并跟随目标，双方共行动3步后轰炸中心及周围12格菱形区域，不分敌我。目标阵亡则轰炸最后位置，命中国王可决定胜负。",
  },
  {
    id: "summon-obelisk",
    name: itemLabels["summon-obelisk"],
    art: "obelisk",
    kind: "献祭召唤",
    condition: "三枚己方非王棋子与己方半场合法2×2空位",
    detail:
      "随机献祭三枚棋子，召唤占2×2格的巨神兵，初始护盾2点。整体沿任意方向移动一格。",
  },
];
const skills: Entry[] = [
  {
    id: "obelisk-fury",
    name: "巨神兵 · 神拳粉碎",
    art: "obelisk",
    kind: "主动技能",
    condition: "巨神兵在场，另有两枚可献祭的己方非王棋子",
    detail:
      "随机献祭两枚棋子，攻击巨神兵前沿所在行及再前方一行的所有敌人。同一多格单位只命中一次，并正常结算防御与护盾。",
  },
  {
    id: "tingqiao",
    name: "听桥",
    art: "tingqiao-stone",
    kind: "被动反击",
    condition: "已学会技能、冷却结束，受到有棋子来源的敌方攻击",
    detail:
      "尝试直接击破攻击来源；成功时免除伤害并中断整次攻击。冷却5回合（10次行动）。不反击友方误伤或无棋子来源的轰炸。",
  },
  {
    id: "obelisk-shield",
    name: "巨神兵 · 护盾",
    art: "obelisk",
    kind: "防御能力",
    condition: "专属道具召唤时获得2点护盾",
    detail:
      "每次受到攻击消耗1点护盾并挡住该次攻击，无盾才会被击破。直接击破绕过护盾，多格同时被范围攻击只结算一次。",
  },
];
function Art({ entry }: { entry: Entry }) {
  if (!entry.art) return null;
  return entry.art === "obelisk" ? (
    <ChessPiece type="o" color="b" />
  ) : (
    <ItemSprite item={entry.art} />
  );
}
export default function DemonPreview({
  positionKey,
  disabledReason,
  getActions,
  onUse,
}: {
  positionKey: string;
  disabledReason: string;
  getActions: () => DemonAction[];
  onUse: (action: DemonAction) => void;
}) {
  const [mode, setMode] = useState<"items" | "skills">("items");
  const [selected, setSelected] = useState(items[0].id);
  const entries = mode === "items" ? items : skills;
  const current = entries.find((e) => e.id === selected) ?? entries[0];
  const [actions, setActions] = useState<DemonAction[]>([]);
  const [targetIndex, setTargetIndex] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setActions([]);
    setTargetIndex(0);
    setMessage("");
  }, [current.id, positionKey, disabledReason]);
  const loadActions = () => {
    const available = getActions().filter(
      (a) => a.item === current.id || a.skill === current.id,
    );
    setActions(available);
    setTargetIndex(0);
    setMessage(
      available.length ? "" : "当前没有合法目标，请检查使用条件或先解除将军。",
    );
  };
  return (
    <section className="demon-preview" aria-label="道具与技能预览">
      <h2>魔鱼图鉴</h2>
      <div className="preview-tabs" role="group" aria-label="预览类型">
        <button
          type="button"
          aria-pressed={mode === "items"}
          onClick={() => {
            setMode("items");
            setSelected(items[0].id);
          }}
        >
          道具预览
        </button>
        <button
          type="button"
          aria-pressed={mode === "skills"}
          onClick={() => {
            setMode("skills");
            setSelected(skills[0].id);
          }}
        >
          技能预览
        </button>
      </div>
      <div className="preview-options" role="group" aria-label="选择预览内容">
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.id}
            aria-pressed={current.id === entry.id}
            onClick={() => setSelected(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="preview-detail" aria-live="polite" aria-atomic="true">
        {current.art && (
          <div className="preview-art" key={current.id}>
            <Art entry={current} />
          </div>
        )}
        <span className="preview-kind">{current.kind}</span>
        <h3>{current.name}</h3>
        <p>{current.detail}</p>
        <p className="preview-condition">
          <strong>条件：</strong>
          {current.condition}
        </p>
      </div>
      {current.id !== "tingqiao" && current.id !== "obelisk-shield" ? (
        <div className="preview-use">
          <button
            type="button"
            disabled={!!disabledReason}
            onClick={loadActions}
          >
            选择白方使用目标
          </button>
          {actions.length > 0 && !disabledReason && (
            <>
              <label>
                使用目标
                <select
                  aria-label="道具使用目标"
                  value={targetIndex}
                  onChange={(e) => setTargetIndex(Number(e.target.value))}
                >
                  {actions.map((a, i) => (
                    <option key={i} value={i}>
                      {a.item === "summon-obelisk"
                        ? "随机献祭并选择合法召唤位置"
                        : `${a.target}${a.item === "monster-reborn" ? ` · 复活${a.giant ? "巨神兵" : a.cannon ? "炮" : { p: "兵", r: "车", n: "马", b: "象", q: "后", k: "王" }[a.piece]}` : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  const action = actions[targetIndex];
                  setActions([]);
                  if (action) onUse(action);
                }}
              >
                白方使用 · 消耗本回合
              </button>
            </>
          )}
          <p role="status">{disabledReason || message}</p>
        </div>
      ) : (
        <small>被动能力自动生效，无需手动使用。</small>
      )}
      <small>控制台操作会实际改变对局，使用后清空本轮投票并轮到黑方。</small>
    </section>
  );
}
