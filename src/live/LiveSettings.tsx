import { useEffect, useRef, useState } from "react";
import { useLiveSettings, type LiveSettings } from "./liveConfig";
import { Voice, type VoiceConfig } from "./voice";
import BilibiliLogin from "./BilibiliLogin";
import "./live.css";
import "./live-fx.css";

const PRESETS: [string, string][] = [
  [
    "元气女仆",
    "你是大肥鱼，蓝发鲸鱼女仆棋手。可爱、自信，偶尔简短犀利地吐槽棋，但不攻击观众本人。中文，每次最多60字。",
  ],
  [
    "毒舌棋圣",
    "你是大肥鱼，自称棋圣的毒舌少女。说话简短、带点傲娇和嘲讽，但只吐槽棋步、不攻击观众本人。中文，每次最多50字。",
  ],
  [
    "温柔老师",
    "你是大肥鱼，耐心的国际象棋老师。用鼓励的语气顺带讲一点棋理或规则，让新手学会下棋。中文，每次最多60字。",
  ],
];

export default function LiveSettings() {
  const [settings, update, syncStatus] = useLiveSettings(true);
  const [danmakuStatus, setDanmakuStatus] = useState("");
  const [danmakuNotice, setDanmakuNotice] = useState("");
  useEffect(() => {
    setDanmakuStatus("");
    setDanmakuNotice("");
    if (!settings.autoConnect || !/^\d{1,15}$/.test(settings.room)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(
          "/api/live/bilibili?room=" + encodeURIComponent(settings.room),
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "连接失败");
        if (!stopped) {
          setDanmakuStatus(
            `${data.status || "等待连接"} · 已收到 ${data.received || 0} 条直播事件`,
          );
          setDanmakuNotice(data.notice || "");
        }
      } catch (error) {
        if (!stopped)
          setDanmakuStatus(
            error instanceof Error ? error.message : "无法读取弹幕状态",
          );
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [settings.room, settings.autoConnect]);
  const voiceRef = useRef(new Voice(settings.voiceConfig));
  voiceRef.current.config = settings.voiceConfig;

  const set = (patch: Partial<LiveSettings>) => update(patch);

  return (
    <main className="live-page live-settings-page">
      <header className="live-header">
        <div>
          <span className="live-eyebrow">DEEPSEEK / LIVE SETTINGS</span>
          <h1>直播设置</h1>
          <p>设置自动保存并同步到直播软件的网页源，通常 1–2 秒生效。</p>
          <p role="status">{syncStatus}</p>
        </div>
        <a className="action-preview-link" href="#live">
          返回直播棋盘
        </a>
      </header>

      <BilibiliLogin />
      <section className="settings-panel">
        <h2>直播画面</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.broadcastMode}
            onChange={(e) => set({ broadcastMode: e.target.checked })}
          />
          直播模式（放大 LIVE 页字号）
        </label>
        <label>
          字号大小：{settings.liveTextScale}%
          <input
            aria-label="直播字号大小"
            type="range"
            min="125"
            max="200"
            step="25"
            disabled={!settings.broadcastMode}
            value={settings.liveTextScale}
            onChange={(e) => set({ liveTextScale: Number(e.target.value) })}
          />
        </label>
        <small>
          放大角色对话、弹幕、规则和状态文字，棋盘大小不变。自动同步到直播源，无需刷新。
        </small>
        <label>
          棋盘俯视角度：{settings.boardAngle}°
          {settings.boardAngle === 90 ? "（垂直俯视）" : ""}
          <input
            aria-label="棋盘俯视角度"
            type="range"
            min="30"
            max="90"
            step="1"
            value={settings.boardAngle}
            onChange={(e) => set({ boardAngle: Number(e.target.value) })}
          />
        </label>
        <div className="persona-presets">
          <button type="button" onClick={() => set({ boardAngle: 58 })}>
            默认视角
          </button>
          <button type="button" onClick={() => set({ boardAngle: 90 })}>
            90° 垂直俯视
          </button>
        </div>
        <small>
          角度越大越接近正上方，30°–90°
          可调。自动保存并同步；大招特写结束后回到此角度。
        </small>
      </section>
      <section className="settings-panel">
        <h2>直播间</h2>
        <label>
          直播间号
          <input
            value={settings.room}
            onChange={(e) => set({ room: e.target.value })}
            placeholder="Bilibili 数字房间号"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autoConnect}
            onChange={(e) => set({ autoConnect: e.target.checked })}
          />
          自动连接直播间弹幕
        </label>
        <small>
          填写数字房间号后自动连接，修改房间号会自动切换；取消勾选即可断开。
        </small>
        {danmakuStatus && <p aria-label="弹幕接收状态">{danmakuStatus}</p>}
        {danmakuNotice && (
          <p>{danmakuNotice}。若一直收不到弹幕，请在上方扫码登录 B站。</p>
        )}
      </section>

      <section className="settings-panel">
        <h2>对局</h2>
        <label>
          Stockfish 深度：{settings.depth}
          <input
            type="range"
            min="1"
            max="6"
            value={settings.depth}
            onChange={(e) => set({ depth: Number(e.target.value) })}
          />
        </label>
        <label>
          AI 强度：{settings.difficulty}%
          <input
            aria-label="AI 强度"
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.difficulty}
            onChange={(e) => set({ difficulty: Number(e.target.value) })}
          />
        </label>
        <small>
          100%
          只走最优着法（最强）；调低后大肥鱼会偶尔走次优着法、甚至乱走送子，方便新手赢棋。
        </small>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.ai}
            onChange={(e) => set({ ai: e.target.checked })}
          />
          启用 AI 走法识别与定时聊天
        </label>
        <small>
          棋局与弹幕汇集为事件流，独立聊天模块定时读取。事件多时最短每 10
          秒读取一次， 事件少时逐步延长，最长每 10 分钟一次；没有新事件时不请求
          AI。
        </small>
      </section>

      <section className="settings-panel">
        <h2>模型参数</h2>
        <p>
          密钥：server/models.local.json →
          deepseek.apiKey（保存后下次请求生效）。
        </p>
        {(
          [
            ["parseModel", "走法识别模型"],
            ["chatModel", "聊天模型"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={settings.modelConfig[key]}
              onChange={(e) =>
                set({
                  modelConfig: {
                    ...settings.modelConfig,
                    [key]: e.target.value,
                  },
                })
              }
            >
              <option value="deepseek-flash">DeepSeek Flash</option>
              <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
            </select>
          </label>
        ))}
        {(
          [
            ["temperature", "聊天温度", 0, 2, 0.1],
            ["chatTokens", "聊天最大输出", 32, 1024, 1],
            ["parseTokens", "识别最大输出", 128, 1024, 1],
            ["timeout", "请求超时（秒）", 5, 180, 1],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={settings.modelConfig[key]}
              onChange={(e) =>
                set({
                  modelConfig: {
                    ...settings.modelConfig,
                    [key]: Math.max(
                      min,
                      Math.min(max, Number(e.target.value) || min),
                    ),
                  },
                })
              }
            />
          </label>
        ))}
        <small>识别温度固定 0，优先稳定。</small>
      </section>

      <section className="settings-panel">
        <h2>声音（让大肥鱼开口说话）</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.voiceConfig.enabled}
            onChange={(e) =>
              set({
                voiceConfig: {
                  ...settings.voiceConfig,
                  enabled: e.target.checked,
                },
              })
            }
          />
          启用语音朗读
        </label>
        <label>
          声音来源
          <select
            aria-label="声音来源"
            value={settings.voiceConfig.provider}
            onChange={(e) => {
              const provider = e.target.value as VoiceConfig["provider"];
              set({
                voiceConfig: {
                  ...settings.voiceConfig,
                  provider,
                  voice: provider === "openai" ? "alloy" : "longxiaochun",
                },
              });
            }}
          >
            <option value="browser">浏览器语音（无需配置）</option>
            <option value="cosyvoice">CosyVoice（阿里云，最自然）</option>
            <option value="openai">OpenAI 兼容 TTS</option>
          </select>
        </label>
        {settings.voiceConfig.provider !== "browser" && (
          <>
            <label>
              音色
              <select
                aria-label="音色"
                value={settings.voiceConfig.voice}
                onChange={(e) =>
                  set({
                    voiceConfig: {
                      ...settings.voiceConfig,
                      voice: e.target.value,
                    },
                  })
                }
              >
                {(settings.voiceConfig.provider === "cosyvoice"
                  ? [
                      ["longxiaochun", "龙小淳 · 活泼少女"],
                      ["longxiaoxia", "龙小夏 · 温柔"],
                      ["longwan", "龙婉 · 温柔"],
                      ["longjing", "龙静 · 知性"],
                      ["longshu", "龙淑 · 温柔"],
                      ["longfei", "龙飞 · 男声"],
                      ["longxun", "龙勋 · 男声"],
                      ["longzheng", "龙铮 · 男声"],
                    ]
                  : [
                      ["alloy", "alloy"],
                      ["echo", "echo"],
                      ["fable", "fable"],
                      ["onyx", "onyx"],
                      ["nova", "nova"],
                      ["shimmer", "shimmer"],
                    ]
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <small>
              {settings.voiceConfig.provider === "cosyvoice"
                ? "需在 server/models.local.json 填写 cosyvoice.apiKey（阿里云 DashScope 密钥）。"
                : "需在 server/models.local.json 填写 tts.apiKey。"}
            </small>
          </>
        )}
        {(
          [
            ["rate", "语速", 0.5, 2, 0.1],
            ["pitch", "音调", 0.5, 2, 0.1],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={settings.voiceConfig[key]}
              onChange={(e) =>
                set({
                  voiceConfig: {
                    ...settings.voiceConfig,
                    [key]: Math.max(
                      min,
                      Math.min(max, Number(e.target.value) || min),
                    ),
                  },
                })
              }
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() =>
            void voiceRef.current
              .speak("你好呀，我是大肥鱼，会下棋也会聊天。", true)
              .catch(() => {})
          }
        >
          试听
        </button>
      </section>

      <section className="settings-panel">
        <h2>大肥鱼的人设</h2>
        <textarea
          value={settings.persona}
          onChange={(e) => set({ persona: e.target.value })}
          maxLength={1500}
        />
        <div className="persona-presets" role="group" aria-label="人设预设">
          {PRESETS.map(([name, text]) => (
            <button
              key={name}
              type="button"
              onClick={() => set({ persona: text })}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
