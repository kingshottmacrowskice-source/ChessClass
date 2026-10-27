import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import CandidateArrows, { arrowColors } from "./CandidateArrows";
import {
  active,
  chess,
  exportPgn,
  initial,
  importGame,
  line,
  move,
  position,
  status,
  type Game,
  type Position,
} from "./core/game";
import { Engine, scoreText, type Analysis } from "./core/engine";
import {
  lookupOpening,
  openingEligible,
  type OpeningResult,
  type OpeningTranslation,
} from "./core/opening-book";
import {
  defaults,
  Llm,
  snapshot,
  type Settings,
  type Snapshot,
  type Evidence,
  type Explanation,
  type Claim,
} from "./core/explanation";

function readGame() {
  try {
    const g = JSON.parse(localStorage.getItem("chess-game") ?? "null");
    if (g) {
      chess(g.main);
      chess(position(g));
      return g as Game;
    }
  } catch {}
  return initial();
}
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("chess-settings") ?? "{}");
    if (saved.model?.startsWith("mimo-") && saved.modelTimeoutVersion !== 1) {
      saved.timeout = Math.max(Number(saved.timeout) || 0, 600);
      saved.modelTimeoutVersion = 1;
    }
    if (
      saved.base === "https://api.xiaomimimo.com/v1" &&
      saved.model === "mimo-v2.6-pro"
    ) {
      saved.base = "https://token-plan-cn.xiaomimimo.com/v1";
    }
    return {
      ...defaults,
      ...saved,
      ...(saved.enginePreset === 19
        ? {}
        : { enginePreset: 19, seconds: 8, threads: 15, hash: 16, multipv: 1 }),
      key: "",
    };
  } catch {
    return defaults;
  }
}
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "发生错误，请重试";
const pieceNames: Record<string, string> = {
  p: "兵",
  n: "马",
  b: "象",
  r: "车",
  q: "后",
  k: "王",
};
export default function App() {
  const [g, setG] = useState<Game>(readGame),
    [settings, setSettings] = useState<Settings>(readSettings);
  const [settingsOpen, setSettingsOpen] = useState(false),
    [tab, setTab] = useState<"move" | "next">("next"),
    [flipped, setFlipped] = useState(false);
  const [text, setText] = useState(""),
    [kind, setKind] = useState<"FEN" | "PGN">("PGN"),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Square | null>(null),
    [promotion, setPromotion] = useState<string | null>(null);
  const [storedResult, setResult] = useState<{
      after: Analysis;
      before?: Analysis;
      actual?: Analysis;
    }>(),
    [engineState, setEngineState] = useState("等待分析");
  const [revision, setRevision] = useState(0),
    [explainRevision, setExplainRevision] = useState(0),
    [modelState, setModelState] = useState(""),
    [explanation, setExplanation] = useState<Explanation>();
  const forceNext = useRef(false);
  const [openingState, setOpeningState] = useState<{
    key: string;
    result: OpeningResult;
  }>();
  const [bookOverride, setBookOverride] = useState("");
  const [openingTranslation, setOpeningTranslation] =
    useState<OpeningTranslation>();
  const [positionCount, setPositionCount] = useState(0);
  const [explanationCount, setExplanationCount] = useState(0);
  const [replay, setReplay] = useState<{
    e: Evidence;
    p: Position;
    index: number;
  } | null>(null);
  const engine = useMemo(() => new Engine(), []),
    llm = useMemo(() => new Llm(), []),
    engineAbort = useRef<AbortController>(),
    modelAbort = useRef<AbortController>();
  const p = position(g),
    positionKey = JSON.stringify(p),
    c = chess(p),
    fen = c.fen();
  const openingEnabled = settings.openingBook !== false;
  const openingResult =
    openingEnabled && openingState?.key === positionKey
      ? openingState.result
      : undefined;
  const openingArticle = openingResult?.article;
  const bookPending = openingEnabled && openingEligible(p) && !openingResult;
  const bookActive =
    !!openingArticle?.paragraphs.length && bookOverride !== positionKey;
  useEffect(() => {
    const controller = new AbortController();
    if (openingEnabled) {
      void lookupOpening(p, controller.signal).then((result) => {
        if (!controller.signal.aborted)
          setOpeningState({ key: positionKey, result });
      });
    }
    return () => controller.abort();
  }, [positionKey, openingEnabled]);
  const result =
    storedResult && JSON.stringify(storedResult.after.position) === positionKey
      ? storedResult
      : undefined;
  const shownFen = replay
    ? replay.index
      ? line(replay.e.fen, replay.e.pv)[replay.index - 1].fen
      : replay.e.fen
    : fen;
  const history = chess(active(g)).history({ verbose: true });
  const snap: Snapshot | undefined = useMemo(
    () =>
      result
        ? tab === "move"
          ? result.before && result.actual
            ? snapshot(
                result.after,
                result.before,
                result.actual,
                p.moves.at(-1),
              )
            : undefined
          : snapshot(result.after)
        : undefined,
    [result, tab, positionKey],
  );
  const snapKey = JSON.stringify(snap);
  useEffect(() => {
    try {
      localStorage.setItem("chess-game", JSON.stringify(g));
    } catch {}
  }, [g]);
  useEffect(() => {
    const { key, ...safe } = settings;
    try {
      localStorage.setItem("chess-settings", JSON.stringify(safe));
    } catch {}
  }, [settings]);
  useEffect(
    () => () => {
      engine.dispose();
      modelAbort.current?.abort();
    },
    [engine],
  );
  useEffect(() => {
    const controller = new AbortController();
    engineAbort.current = controller;
    const force = forceNext.current;
    forceNext.current = false;
    setResult(undefined);
    setReplay(null);
    setSelected(null);
    setPromotion(null);
    setEngineState("分析中 · 当前局面");
    const timer = setTimeout(async () => {
      try {
        const after = await engine.analyze(
          p,
          settings.depth,
          settings.multipv,
          controller.signal,
          undefined,
          settings,
          force,
        );
        if (controller.signal.aborted) return;
        setResult({ after });
        if (p.moves.length) {
          setEngineState("分析中 · 比较实际着法与最佳替代");
          const prev = { ...p, moves: p.moves.slice(0, -1) };
          const before = await engine.analyze(
            prev,
            settings.depth,
            settings.multipv,
            controller.signal,
            undefined,
            settings,
            force,
          );
          const actual = await engine.analyze(
            prev,
            settings.depth,
            1,
            controller.signal,
            p.moves.at(-1),
            settings,
            force,
          );
          if (controller.signal.aborted) return;
          setResult({ after, before, actual });
        }
        setEngineState(
          after.source === "disk"
            ? "分析完成 · 当前局面来自本地局面库"
            : after.source === "memory"
              ? "分析完成 · 当前局面来自内存缓存"
              : "分析完成",
        );
        void engine.store.count().then(setPositionCount);
        void llm.store.count().then(setExplanationCount);
      } catch (e) {
        if (!controller.signal.aborted)
          setEngineState("引擎失败 · " + errorText(e));
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    positionKey,
    settings.seconds,
    settings.threads,
    settings.hash,
    settings.multipv,
    revision,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    modelAbort.current = controller;
    setExplanation(undefined);
    setOpeningTranslation(undefined);
    setModelState("");
    if (bookPending) {
      setModelState("正在查询 Wikibooks 开局资料…");
      return () => controller.abort();
    }
    if (bookActive && openingArticle) {
      if (!settings.model) {
        setModelState("已找到开局文章 · 配置模型后可翻译为棋理讲解");
        return () => controller.abort();
      }
      if (!settings.auto && !explainRevision) {
        setModelState("已找到开局文章 · 点击翻译开局文章");
        return () => controller.abort();
      }
      const timer = setTimeout(() => {
        setModelState("开局文章翻译中…");
        void llm
          .translateOpening(openingArticle, settings, controller.signal)
          .then((value) => {
            if (controller.signal.aborted) return;
            setOpeningTranslation(value);
            setModelState(
              `${llm.translationSource === "disk" ? "来自局面库" : llm.translationSource === "memory" ? "来自内存缓存" : "来自模型"} · Wikibooks 开局文章 AI 翻译${!llm.translationStore.available ? " · 译文暂存于内存" : ""}`,
            );
            void llm.store.count().then(setExplanationCount);
          })
          .catch((error) => {
            if (!controller.signal.aborted) setModelState(errorText(error));
          });
      }, settings.debounce);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
    if (!snap || !snap.evidence.length) return () => controller.abort();
    const should = explainRevision > 0 || (tab === "move" && settings.auto);
    if (!settings.model) {
      setModelState("尚未配置模型 · 引擎分析可独立使用");
      return () => controller.abort();
    }
    if (!should) {
      setModelState("点击按钮生成基于当前证据的解释");
      return () => controller.abort();
    }
    const timer = setTimeout(() => {
      setModelState("模型解释生成中…");
      llm
        .explain(snap, settings, controller.signal)
        .then((e) => {
          if (!controller.signal.aborted) {
            setExplanation(e);
            setModelState(
              `${llm.source === "disk" ? "来自局面库 · AI 棋理讲解" : llm.source === "memory" ? "来自内存缓存 · AI 棋理讲解" : "来自模型"} · 结构与依据引用已校验，语义仍需复核${!llm.store.available ? " · 讲解存储暂不可用，本次仅保留内存缓存" : ""}`,
            );
            void llm.store.count().then(setExplanationCount);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setModelState(errorText(e));
        });
    }, settings.debounce);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    bookActive ? "opening-translation" : snapKey,
    explainRevision,
    settings,
    tab,
    bookPending,
    bookActive,
    openingArticle,
  ]);
  function navigate(cursor: number) {
    modelAbort.current?.abort();
    setExplainRevision(0);
    setG({
      ...g,
      cursor: Math.max(0, Math.min(active(g).moves.length, cursor)),
    });
  }
  function commit(uci: string) {
    try {
      setExplainRevision(0);
      setG(move(g, uci));
      setTab("move");
      setNotice("");
      setSelected(null);
      return true;
    } catch (e) {
      setNotice(errorText(e));
      return false;
    }
  }
  function attempt(from: Square, to: Square) {
    if (replay) return false;
    const choices = c
      .moves({ verbose: true })
      .filter((m) => m.from === from && m.to === to);
    if (!choices.length) return false;
    if (choices.some((m) => m.promotion)) {
      setPromotion(from + to);
      return false;
    }
    return commit(from + to);
  }
  function showEvidence(e: Evidence) {
    const source =
      result?.before?.fen === e.fen
        ? result.before.position
        : result?.after.fen === e.fen
          ? result.after.position
          : { start: e.fen, moves: [] };
    setReplay({ e, p: source, index: 0 });
  }
  function tryReplay() {
    if (!replay) return;
    const branch = {
      ...replay.p,
      moves: [...replay.p.moves, ...replay.e.pv.slice(0, replay.index)],
    };
    setG({ ...g, branch, cursor: branch.moves.length });
    setReplay(null);
    setExplainRevision(0);
  }
  function importText() {
    try {
      setG(importGame(text, kind));
      setExplainRevision(0);
      setNotice(
        kind === "FEN"
          ? "已导入 FEN；无法恢复此前重复局面历史。"
          : "已导入 PGN 主线；注释与括号变例不参与编辑和导出。",
      );
      setTab("next");
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  function download(format: "FEN" | "PGN") {
    const data = format === "FEN" ? fen : exportPgn(g);
    const url = URL.createObjectURL(
      new Blob([data], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${g.branch ? "branch" : "main"}-through-${g.cursor}.${format.toLowerCase()}`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const first = result?.after.candidates[0];
  const sideName = c.turn() === "w" ? "白方" : "黑方";
  const highlights: Record<string, { background: string }> = {};
  if (selected) {
    highlights[selected] = { background: "rgba(225,183,77,.65)" };
    c.moves({ square: selected, verbose: true }).forEach(
      (m) =>
        (highlights[m.to] = {
          background: "radial-gradient(circle, #d5ae52 18%, transparent 22%)",
        }),
    );
  }
  function renderClaim(claim: Claim, i: number) {
    return (
      <div className="claim" key={i}>
        <p>{claim.text}</p>
        <div className="refs">
          {claim.evidenceRefs.map((id) => (
            <button
              key={id}
              onClick={() => {
                const e = snap?.evidence.find((e) => e.id === id);
                if (e) showEvidence(e);
              }}
            >
              查看依据 · {id}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <>
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">♞</span>
          <span>
            弈见 <small>CHESS INSIGHT</small>
          </span>
        </a>
        <span className="header-caption">看懂每一步，走好下一步。</span>
        <button onClick={() => setSettingsOpen(true)}>⚙ 分析设置</button>
      </header>
      <main>
        <section className="intro">
          <div>
            <span className="eyebrow">YOUR PERSONAL ANALYSIS BOARD</span>
            <h1>让每一步，都有据可循。</h1>
            <p>本地引擎计算，AI 解释棋理。探索局面背后的选择。</p>
          </div>
          <div className="local-badge">
            <i /> Stockfish 本地运行
          </div>
        </section>
        <div className="workspace">
          <section className="board-column">
            <div className="board-top">
              <strong>{replay ? "变化回放" : status(c)}</strong>
              <span>
                {g.branch ? "临时试走分支" : "主棋谱"} · 第 {g.cursor} 步
              </span>
              <button onClick={() => setFlipped(!flipped)}>翻转棋盘</button>
            </div>
            <div className="board-wrap">
              <Chessboard
                id="analysis-board"
                position={shownFen}
                boardOrientation={flipped ? "black" : "white"}
                animationDuration={150}
                arePiecesDraggable={!replay && !c.isGameOver()}
                onPromotionCheck={() => false}
                onPieceDrop={(from, to) => attempt(from, to)}
                onSquareClick={(s) => {
                  if (replay) return;
                  if (selected && attempt(selected, s)) return;
                  setSelected(c.get(s)?.color === c.turn() ? s : null);
                }}
                customDarkSquareStyle={{ backgroundColor: "#719386" }}
                customLightSquareStyle={{ backgroundColor: "#e9eddf" }}
                customSquareStyles={highlights}
              />
              {!replay && result && (
                <CandidateArrows
                  candidates={result.after.candidates}
                  flipped={flipped}
                />
              )}
            </div>
            {!replay && first && (
              <div className="arrow-legend">
                <span>箭头为{sideName}的下一步：</span>
                {result?.after.candidates.map((row) => (
                  <span key={row.rank}>
                    <i
                      style={{
                        background:
                          arrowColors[(row.rank - 1) % arrowColors.length],
                        height: row.rank === 1 ? 4 : 2,
                      }}
                    />
                    {row.rank === 1 ? "首选（粗）" : `候选 ${row.rank}（细）`}
                  </span>
                ))}
              </div>
            )}
            {promotion && (
              <div className="promotion">
                <strong>请选择升变棋子</strong>
                {["q", "r", "b", "n"].map((x) => (
                  <button
                    key={x}
                    onClick={() => {
                      commit(promotion + x);
                      setPromotion(null);
                    }}
                  >
                    {pieceNames[x]}
                  </button>
                ))}
                <button onClick={() => setPromotion(null)}>取消</button>
              </div>
            )}
            {replay ? (
              <div className="replay">
                <strong>
                  依据 · {replay.e.id}　{replay.index}/{replay.e.pv.length}
                </strong>
                <div className="toolbar">
                  <button
                    disabled={!replay.index}
                    onClick={() =>
                      setReplay({ ...replay, index: replay.index - 1 })
                    }
                  >
                    ← 上一步
                  </button>
                  <button
                    disabled={replay.index === replay.e.pv.length}
                    onClick={() =>
                      setReplay({ ...replay, index: replay.index + 1 })
                    }
                  >
                    下一步 →
                  </button>
                  <button onClick={tryReplay}>从这里试走</button>
                  <button onClick={() => setReplay(null)}>返回分析位置</button>
                </div>
              </div>
            ) : (
              <div className="navigation">
                <button title="起点" onClick={() => navigate(0)}>
                  ⇤
                </button>
                <button
                  title="后退 / 悔棋"
                  disabled={!g.cursor}
                  onClick={() => navigate(g.cursor - 1)}
                >
                  ←
                </button>
                <span>
                  {g.cursor} / {active(g).moves.length}
                </span>
                <button
                  title="前进 / 恢复"
                  disabled={g.cursor === active(g).moves.length}
                  onClick={() => navigate(g.cursor + 1)}
                >
                  →
                </button>
                <button
                  title="终点"
                  onClick={() => navigate(active(g).moves.length)}
                >
                  ⇥
                </button>
              </div>
            )}
            <section className="card history">
              <div className="section-title">
                <h2>棋谱</h2>
                <span>点击棋步，查看当时的选择</span>
              </div>
              {g.branch && (
                <div className="branch-note">
                  原棋谱已保留。
                  <button
                    onClick={() => {
                      setG({
                        ...g,
                        branch: null,
                        cursor: Math.min(g.cursor, g.main.moves.length),
                      });
                      setExplainRevision(0);
                    }}
                  >
                    返回原棋谱
                  </button>
                </div>
              )}
              <div className="moves">
                {!history.length ? (
                  <p className="muted">
                    在棋盘上拖动棋子，或点击起点和终点开始。
                  </p>
                ) : (
                  history.map((m, i) => (
                    <button
                      className={i + 1 === g.cursor ? "selected" : ""}
                      key={i}
                      onClick={() => navigate(i + 1)}
                    >
                      <small>
                        {Math.floor(i / 2) + 1}
                        {m.color === "w" ? "." : "…"}
                      </small>{" "}
                      {m.san}
                    </button>
                  ))
                )}
              </div>
            </section>
            <details className="card import">
              <summary>
                导入与导出 <span>FEN / PGN</span>
              </summary>
              <div className="toolbar">
                <select
                  aria-label="导入格式"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "FEN" | "PGN")}
                >
                  <option>PGN</option>
                  <option>FEN</option>
                </select>
                <button
                  onClick={() => {
                    setG(initial());
                    setExplainRevision(0);
                    setNotice("已创建新棋局");
                  }}
                >
                  新棋局
                </button>
              </div>
              <textarea
                aria-label="棋谱内容"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="粘贴棋谱或局面…"
              />
              <p className="muted">
                PGN 仅读取主线与初始局面；注释、变例不保留。导出当前
                {g.branch ? "分支" : "主线"}至所选棋步。
              </p>
              <div className="toolbar">
                <button className="primary" onClick={importText}>
                  导入{kind}
                </button>
                <button onClick={() => download("PGN")}>导出 PGN</button>
                <button onClick={() => download("FEN")}>导出 FEN</button>
              </div>
              <code className="fen">{fen}</code>
            </details>
            {notice && (
              <p role="alert" className="notice">
                {notice}
              </p>
            )}
          </section>
          <section className="analysis-column">
            <div className="tabs">
              <button
                className={tab === "move" ? "active" : ""}
                onClick={() => {
                  setTab("move");
                  setExplainRevision(0);
                }}
              >
                当前走法分析
              </button>
              <button
                className={tab === "next" ? "active" : ""}
                onClick={() => {
                  setTab("next");
                  setExplainRevision(0);
                }}
              >
                下一步推荐
              </button>
            </div>
            <div className="engine-status" role="status">
              <span className={engineState.startsWith("分析中") ? "pulse" : ""}>
                ●
              </span>{" "}
              {engineState}
              <div>
                <button
                  onClick={() => {
                    engineAbort.current?.abort();
                    modelAbort.current?.abort();
                    setEngineState("已取消 · 可重新分析");
                    setModelState("已取消");
                  }}
                >
                  停止
                </button>
                <button
                  onClick={() => {
                    setExplainRevision(0);
                    forceNext.current = true;
                    setRevision(revision + 1);
                  }}
                >
                  强制重算
                </button>
              </div>
            </div>
            <div className="card analysis-card">
              {result && (
                <p
                  className="muted"
                  data-testid="analysis-source"
                  data-source={result.after.source ?? "computed"}
                >
                  当前局面来源：
                  {result.after.source === "disk"
                    ? "本地局面库 · 无需重新搜索"
                    : result.after.source === "memory"
                      ? "内存缓存 · 无需重新搜索"
                      : "本地引擎计算"}
                  {result.after.savedAt
                    ? ` · ${new Date(result.after.savedAt).toLocaleString()}`
                    : ""}
                </p>
              )}
              <div className="section-title">
                <h2>
                  {tab === "next" ? "寻找更好的下一步" : "理解刚才的选择"}
                </h2>
                <span className="tag">引擎证据</span>
              </div>
              <p className="score-perspective">
                评分统一用白方视角：正值利白，负值利黑。
                {tab === "next"
                  ? `${sideName}行棋，候选按${sideName}的利益排序${c.turn() === "b" ? "，黑方通常以更低评分为优" : ""}。`
                  : "本页评估上一手；棋盘箭头显示当前行棋方的下一步。"}
              </p>
              {tab === "move" && !g.cursor ? (
                <div className="empty">
                  <span>♙</span>
                  <h3>先走一步，开启分析</h3>
                  <p>也可以导入棋谱并选择历史棋步。</p>
                </div>
              ) : (
                <>
                  {tab === "move" && snap?.rating && (
                    <div className="rating">
                      <div>
                        <span>实际着法</span>
                        <h2>
                          {snap.evidence.find((e) => e.id === "actual")?.san[0]}
                        </h2>
                      </div>
                      <div>
                        <strong>{snap.rating.label}</strong>
                        <p>
                          估计得分损失 {(snap.rating.loss * 100).toFixed(1)}{" "}
                          个百分点
                        </p>
                      </div>
                    </div>
                  )}
                  {tab === "next" && first && (
                    <div className="best">
                      <div>
                        <span>{sideName}首选</span>
                        <h2>{line(fen, first.pv)[0]?.san}</h2>
                      </div>
                      <div>
                        <strong>{scoreText(first.score)}</strong>
                        <span>深度 {first.depth} · 白方视角评分</span>
                      </div>
                    </div>
                  )}
                  {result?.after.terminal && tab === "next" && (
                    <p className="notice">{status(c)} · 终局没有下一步候选。</p>
                  )}
                  {!snap && (
                    <p className="muted">
                      正在准备前后局面及实际着法的搜索结果…
                    </p>
                  )}
                  <div className="candidates">
                    {snap?.evidence.map((e, i) => (
                      <article className="candidate" key={e.id}>
                        <div>
                          <span className="rank">{i + 1}</span>
                          <strong>
                            {e.id === "best"
                              ? "最佳替代"
                              : e.id === "actual"
                                ? "实际着法"
                                : e.id.startsWith("reply")
                                  ? "对手应对"
                                  : "候选"}{" "}
                            ·{" "}
                            {new Chess(e.fen).turn() === "w" ? "白方" : "黑方"}{" "}
                            {e.san[0]}
                          </strong>
                          <b>{e.score && scoreText(e.score)}</b>
                        </div>
                        <button
                          className="pv"
                          onClick={() => showEvidence(e)}
                          title="点击回放变化"
                        >
                          {e.san.slice(0, 12).join("  ")}
                          {e.san.length > 12 ? " …" : ""}
                          <span> ↗ 回放</span>
                        </button>
                        <small>搜索深度 {e.depth} · 非强制变化证明</small>
                        <details>
                          <summary>规则可验证事实</summary>
                          <ul>
                            {e.facts.slice(0, 1).map((f, j) => (
                              <li key={j}>
                                {f.capture
                                  ? `吃掉${pieceNames[f.capture]}；`
                                  : "未吃子；"}
                                {f.checkmate
                                  ? "形成将杀；"
                                  : f.check
                                    ? "将军；"
                                    : ""}
                                落点{f.destinationAttacked ? "受" : "未受"}
                                对手攻击，{f.destinationDefended ? "有" : "无"}
                                己方保护。直接攻击：
                                {f.directAttacks.join("、") || "无"}
                                。中心控制格数变化：{f.centerControlDelta}
                                。新增保护：
                                {f.newlyProtected.join("、") || "无"}
                                ；失去保护：
                                {f.noLongerProtected.join("、") || "无"}。
                              </li>
                            ))}
                          </ul>
                          <p>
                            攻击与保护按规则库几何关系计算，包含被钉子；不能直接推出丢子或安全。
                          </p>
                        </details>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="card ai-card">
              <div className="section-title">
                <h2>✧ 开局资料与棋理讲解</h2>
                <button
                  className="primary"
                  disabled={
                    bookPending ||
                    (!bookActive && !snap?.evidence.length) ||
                    modelState === "模型解释生成中…" ||
                    modelState === "开局文章翻译中…"
                  }
                  onClick={() => {
                    if (!settings.model) setSettingsOpen(true);
                    else setExplainRevision(explainRevision + 1);
                  }}
                >
                  {bookActive
                    ? "翻译开局文章"
                    : tab === "next"
                      ? "分析下一步"
                      : "解释当前走法"}
                </button>
              </div>
              <p className="model-state" role="status">
                {modelState || "等待引擎证据快照"}
              </p>
              {bookActive && (
                <button
                  disabled={!snap?.evidence.length}
                  onClick={() => {
                    setBookOverride(positionKey);
                    if (!settings.model) setSettingsOpen(true);
                    else setExplainRevision(explainRevision + 1);
                  }}
                >
                  改用 AI 分析
                </button>
              )}
              {openingTranslation && openingArticle && (
                <div className="opening-translation">
                  <h3>{openingTranslation.title}</h3>
                  {openingTranslation.paragraphs.map((text, i) => (
                    <p key={i}>{text}</p>
                  ))}
                  <p className="muted">
                    以上棋理讲解为开局文章的 AI
                    译文，段落和棋步记号已校验，翻译准确性仍可对照原文复核。
                    原文作者：
                    <a
                      href={openingArticle.historyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wikibooks 编者
                    </a>{" "}
                    ·{" "}
                    <a
                      href={openingArticle.revisionUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      所用原文版本
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://en.wikibooks.org/wiki/Wikibooks:Copyrights"
                      target="_blank"
                      rel="noreferrer"
                    >
                      CC BY-SA（译文沿用）
                    </a>
                  </p>
                </div>
              )}
              {openingArticle && (
                <details
                  className="opening-book"
                  open={
                    !openingTranslation &&
                    (!settings.model || !openingArticle.paragraphs.length)
                  }
                >
                  <summary>Wikibooks · {openingArticle.name}</summary>
                  <p className="muted">
                    按当前实际走法顺序匹配 · 英文原文节选 ·{" "}
                    {openingResult?.cached ? "本地资料缓存" : "在线资料"}
                    {openingResult?.stale ? "（网络暂不可用，使用旧缓存）" : ""}
                    。开局资料不代表引擎最佳着法或当前走法评级。
                  </p>
                  {openingArticle.paragraphs.length ? (
                    openingArticle.paragraphs.map((text, i) => (
                      <p key={i}>{text}</p>
                    ))
                  ) : (
                    <p>
                      此条目暂无可展示的正文讲解，可阅读原文或继续使用 AI 分析。
                    </p>
                  )}
                  <p className="muted">
                    来源：
                    <a
                      href={openingArticle.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wikibooks 原文
                    </a>{" "}
                    ·{" "}
                    <a
                      href={openingArticle.historyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      作者与编辑历史
                    </a>{" "}
                    ·{" "}
                    <a
                      href={openingArticle.revisionUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      所用版本
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://en.wikibooks.org/wiki/Wikibooks:Copyrights"
                      target="_blank"
                      rel="noreferrer"
                    >
                      CC BY-SA
                    </a>
                    。 内容仅提取正文并省略图表和导航，未使用模型翻译。
                  </p>
                </details>
              )}
              {openingResult?.status === "not-found" && (
                <p className="muted">
                  未找到此走法顺序的开局条目，可继续使用 AI 讲解。
                </p>
              )}
              {openingResult?.status === "unavailable" && (
                <p className="muted">开局资料暂不可用，可继续使用 AI 讲解。</p>
              )}
              {!settings.model && !bookActive && (
                <p className="muted">
                  在设置中连接兼容 API 或本地
                  Ollama，即可生成中文解释。这里不会用演示文字代替模型。
                </p>
              )}
              {explanation && (
                <>
                  <div className="summary">
                    {renderClaim(explanation.summary, 0)}
                  </div>
                  {(
                    [
                      ["intent", "可能意图 / 计划"],
                      ["advantages", "主要优点"],
                      ["drawbacks", "主要缺点"],
                      ["risks", "具体风险"],
                      ["responses", "对手应对"],
                      ["comparison", "候选比较"],
                    ] as const
                  ).map(([k, label]) => (
                    <details open key={k}>
                      <summary>{label}</summary>
                      {explanation[k].length ? (
                        explanation[k].map(renderClaim)
                      ) : (
                        <p className="muted">
                          当前证据没有支持需要补充的结论。
                        </p>
                      )}
                    </details>
                  ))}
                  <p className="muted">
                    置信等级：{explanation.confidence} ·{" "}
                    {explanation.confidenceReason}
                  </p>
                </>
              )}
            </div>
            <p className="footnote">
              Stockfish 19 · 完整 NNUE（约 94 MB）· {settings.threads} 线程 ·{" "}
              {settings.hash} MB Hash · 每次搜索 {settings.seconds} 秒
              <br />
              评分来自引擎；估计得分不是实际胜率。自然语言解释不等同于战术证明。
            </p>
          </section>
        </div>
      </main>
      <footer>
        <span>弈见 · 把计算变成理解</span>
        <a href="/licenses/THIRD_PARTY_NOTICES.md" target="_blank">
          依赖与分发说明
        </a>
        <a href="/licenses/stockfish.txt" target="_blank">
          GPL v3 许可证
        </a>
        <a href="/source/stockfish-v19.0.1.tar.gz" download>
          Stockfish 19 对应源码
        </a>
      </footer>
      {settingsOpen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="分析设置"
          >
            <div className="section-title">
              <h2>分析设置</h2>
              <button onClick={() => setSettingsOpen(false)}>完成 ✕</button>
            </div>
            <p className="muted">
              设置自动保存；模型预设使用服务端密钥，自定义直连的 API Key
              仅保留在当前页面内存中。
            </p>
            <label>
              模型预设
              <select
                value={settings.serverProvider ? settings.model : "custom"}
                onChange={(e) => {
                  const model = e.target.value;
                  if (model === "custom") {
                    setSettings({
                      ...settings,
                      serverProvider: undefined,
                      model: "",
                      key: "",
                    });
                    setNotice("请填写自定义模型名称和服务地址。");
                    return;
                  }
                  const mimo = model === "mimo-v2.6-pro";
                  setSettings({
                    ...settings,
                    serverProvider: mimo ? "mimo" : "deepseek",
                    base: mimo
                      ? "https://token-plan-cn.xiaomimimo.com/v1"
                      : "https://api.deepseek.com",
                    model,
                    key: "",
                    timeout: Math.max(settings.timeout, 600),
                    modelTimeoutVersion: 1,
                  });
                  setNotice(
                    "已切换模型，使用 server/models.local.json 中的密钥；可点击测试连接。",
                  );
                }}
              >
                <option value="custom">自定义 / OpenAI 兼容 / Ollama</option>
                <option value="mimo-v2.6-pro">小米 MiMo 2.6 Pro</option>
                <option value="deepseek-flash">DeepSeek Flash</option>
                <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
              </select>
            </label>
            {(
              [
                ["base", "API Base URL"],
                ["key", "API Key"],
                ["model", "模型名称"],
                ["language", "解释语言"],
              ] as const
            )
              .filter(([key]) => !settings.serverProvider || key !== "key")
              .map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type={key === "key" ? "password" : "text"}
                    autoComplete="off"
                    readOnly={
                      !!settings.serverProvider &&
                      (key === "base" || key === "model")
                    }
                    value={settings[key]}
                    onChange={(e) =>
                      setSettings({ ...settings, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            <p className="muted">
              MiMo 和 DeepSeek 的 API Key 统一填写在项目目录
              server/models.local.json 中，保存后立即生效。 MiMo 使用 Token Plan
              专属 Key；DeepSeek 两个模型共用 DeepSeek
              Key。网页不会显示服务端密钥。
              如需其他服务地址或模型名称，请选择“自定义”。
            </p>
            <p className="muted">
              填写服务的 /v1 地址；自动拼接
              /chat/completions（已有该后缀不会重复）。Ollama
              示例：http://localhost:11434/v1，模型填写已安装名称，通常无需
              Key。需在服务端设置 OLLAMA_ORIGINS 允许本应用来源并重启。
            </p>
            <p className="muted">
              引擎：Stockfish 19 完整 NNUE（约 94 MB）。截图预设为 8 秒 / 1 候选
              / 15 线程 / 16 MB Hash。Hash 不含网络与线程占用的内存。1
              候选只显示首选箭头，改为 3
              可显示细候选箭头。实际走法比较包含最多三次搜索；实际深度由局面、硬件与时间决定，不等同于
              Lichess CLOUD 深度。
            </p>
            <div className="settings-grid">
              {(
                [
                  ["timeout", "请求超时（秒）", 5, 1800],
                  ["debounce", "解释防抖（毫秒）", 300, 2000],
                  ["seconds", "每次搜索时间（秒）", 1, 60],
                  ["threads", "引擎线程数", 1, 32],
                  ["hash", "搜索缓存（MB）", 16, 1024],
                  ["multipv", "候选数", 1, 5],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={settings[key]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        [key]: Math.max(
                          min,
                          Math.min(max, Number(e.target.value) || min),
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={openingEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, openingBook: e.target.checked })
                }
              />
              开局优先翻译 Wikibooks 文章作为棋理讲解（前 12 回合）
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.auto}
                onChange={(e) =>
                  setSettings({ ...settings, auto: e.target.checked })
                }
              />
              自动解释实际走法（历史切换后防抖）
            </label>
            <div className="toolbar">
              <button
                className="primary"
                onClick={async () => {
                  if (!settings.model) {
                    setNotice("请先填写模型名称");
                    return;
                  }
                  setNotice("正在测试模型连接…");
                  try {
                    await llm.test(settings);
                    setNotice(
                      "连接成功；此测试仅确认接口可用，不代表棋理语义已验证。",
                    );
                  } catch (e) {
                    setNotice(errorText(e));
                  }
                }}
              >
                测试连接
              </button>
              <button
                onClick={() => {
                  engineAbort.current?.abort();
                  modelAbort.current?.abort();
                  void engine.clearCache().then(() => {
                    setPositionCount(0);
                    setExplanationCount(0);
                    setNotice(
                      engine.store.available
                        ? "已清空本地局面库与内存缓存"
                        : "服务端局面库不可用，仅清空了内存缓存",
                    );
                  });
                  llm.clearMemory();
                  setExplanation(undefined);
                  setOpeningTranslation(undefined);
                  setEngineState("已取消 · 缓存已清空");
                }}
              >
                清空分析缓存
              </button>
            </div>
            <p className="muted">
              本地局面库：{positionCount} 条；AI 棋理讲解：{explanationCount}{" "}
              条（合计缓存内容上限 2 GB，超限时淘汰最久未使用的记录）。
              保存在运行项目的电脑中，不随浏览器清理而丢失；不同浏览器共享。搜索配置与和棋历史须兼容，不保存
              API
              Key。讲解按局面证据、服务地址、模型和语言区分，读取后重新校验引用；文字语义仍需复核。清空分析缓存会删除此项目所有浏览器共享的引擎结果和
              AI 讲解。
              {!engine.store.available
                ? " 服务端局面库暂不可用，将继续使用内存缓存，并稍后重试。"
                : ""}
            </p>
            {notice && <p role="alert">{notice}</p>}
          </section>
        </div>
      )}
    </>
  );
}
