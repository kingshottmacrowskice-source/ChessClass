import { useEffect, useState } from "react";
import Sprite from "./Sprite";
import { actions } from "./actions";
import { useSpeechBubble, bubbleDuration } from "./speech";
import { useWalker } from "./motion";
import "./live.css";
import "./preview.css";
export default function ActionPreview() {
  const [selected, setSelected] = useState(0),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(true),
    [repeat, setRepeat] = useState(true),
    [fps, setFps] = useState(7),
    [facing, setFacing] = useState(1),
    [scale, setScale] = useState(4),
    [travel, setTravel] = useState(false),
    [grid, setGrid] = useState(true),
    [text, setText] = useState("这枚棋子，我就不客气啦。");
  const { bubble, say } = useSpeechBubble("");
  const walker = useWalker();
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (frame === 5) {
        if (repeat) setFrame(0);
        else setPlaying(false);
      } else setFrame((v) => v + 1);
    }, 1000 / fps);
    return () => clearTimeout(t);
  }, [playing, repeat, frame, fps]);
  useEffect(() => {
    if (!travel || !playing) return;
    let active = true;
    void (async () => {
      while (active) {
        if (!(await walker.walkTo({ x: 80, y: 70 })) || !active) break;
        if (!(await walker.walkTo({ x: 20, y: 70 })) || !active) break;
      }
    })();
    return () => {
      active = false;
      walker.stop();
    };
  }, [travel, playing]);
  const choose = (index: number) => {
    if (index !== 1 && index !== 4) setTravel(false);
    setSelected(index);
    setFrame(0);
    setPlaying(true);
    setRepeat(actions[index].loop);
  };
  return (
    <main className="live-page action-page">
      <header className="live-header">
        <div>
          <span className="live-eyebrow">DEEPSEEK / ANIMATION STUDIO</span>
          <h1>深深 · 动作放映室</h1>
          <p>9 组独立素材 · 每组 6 帧 · 与直播棋盘共用播放器</p>
        </div>
        <a className="action-preview-link" href="#live">
          进入直播棋盘
        </a>
      </header>
      <div className="preview-layout">
        <section>
          <div className={"preview-stage " + (grid ? "with-grid" : "")}>
            <div className="preview-ground" />
            <div
              className="preview-character"
              style={{
                left: travel ? walker.actor.x + "%" : "50%",
                top: "70%",
                width: 32 * scale,
                height: 40 * scale,
              }}
            >
              <Sprite
                row={selected}
                frame={frame}
                facing={travel ? walker.facing : facing}
              />
              {bubble && <div className="sprite-bubble">{bubble}</div>}
              <span className="foot-anchor" />
            </div>
            <span className="stage-label">
              {actions[selected].name} · 第 {frame + 1} / 6 帧
            </span>
          </div>
          <div className="preview-controls">
            <button onClick={() => setPlaying(!playing)}>
              {playing ? "暂停" : "播放"}
            </button>
            <button
              onClick={() => {
                setFrame(0);
                setPlaying(true);
              }}
            >
              重播
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setFrame((v) => (v + 5) % 6);
              }}
            >
              上一帧
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setFrame((v) => (v + 1) % 6);
              }}
            >
              下一帧
            </button>
            <button onClick={() => setFacing((v) => -v)}>转向</button>
          </div>
          <div className="frame-strip">
            {Array.from({ length: 6 }, (_, i) => (
              <button
                className={i === frame ? "selected" : ""}
                key={i}
                onClick={() => {
                  setFrame(i);
                  setPlaying(false);
                }}
                aria-label={"查看第" + (i + 1) + "帧"}
              >
                <Sprite row={selected} frame={i} facing={facing} />
                <span>{String(i + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
          <div className="preview-options">
            <label>
              播放速度：{fps} FPS
              <input
                type="range"
                min="2"
                max="15"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              />
            </label>
            <label>
              放大倍率：{scale}×
              <input
                type="range"
                min="2"
                max="6"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
              />
              循环播放
            </label>
            <label>
              <input
                type="checkbox"
                checked={grid}
                onChange={(e) => setGrid(e.target.checked)}
              />
              棋盘与脚底基准线
            </label>
            <label>
              <input
                type="checkbox"
                checked={travel}
                onChange={(e) => {
                  setTravel(e.target.checked);
                  if (e.target.checked) {
                    setSelected(1);
                    setRepeat(true);
                    setPlaying(true);
                  }
                }}
              />
              固定速度行走演示
            </label>
          </div>
          <section className="speech-demo">
            <h2>气泡展示时间</h2>
            <textarea
              aria-label="气泡测试文字"
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
            />
            <button onClick={() => say(text)}>显示测试气泡</button>
            <small>
              这段文字停留 {(bubbleDuration(text) / 1000).toFixed(1)}{" "}
              秒；直播流式回复结束后才开始计时。
            </small>
          </section>
        </section>
        <aside className="action-list">
          {actions.map((a, i) => (
            <button
              key={a.key}
              className={"action-card " + (selected === i ? "selected" : "")}
              onClick={() => choose(i)}
            >
              <Sprite row={i} frame={frame} facing={1} />
              <span>
                <b>{a.name}</b>
                <small>6 帧 · {a.loop ? "循环动作" : "单次动作"}</small>
              </span>
            </button>
          ))}
          <p>
            点击下方缩略帧可定格检查。红点是脚底锚点；攻击和落子在直播中只播放一次。
          </p>
          <a
            href={"/live/actions-v2/" + actions[selected].key + ".png"}
            target="_blank"
            rel="noreferrer"
          >
            查看当前动作原始动画表 ↗
          </a>
        </aside>
      </div>
    </main>
  );
}
