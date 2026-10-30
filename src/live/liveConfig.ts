import {
  normalizeWeights,
  defaultBehaviorWeights,
  defaultItemWeights,
  type BehaviorWeights,
  type ItemWeights,
} from "./demonWeights";
import { boardAngle, DEFAULT_BOARD_ANGLE } from "./boardView";
import { useCallback, useEffect, useRef, useState } from "react";
import { readModelConfig, type ModelConfig } from "./core";
import { readVoiceConfig, type VoiceConfig } from "./voice";

/** 配置以本机服务为准，localStorage 仅作为本浏览器的启动缓存。 */
export type LiveSettings = {
  room: string;
  autoConnect: boolean;
  broadcastMode: boolean;
  liveTextScale: number;
  boardAngle: number;
  depth: number;
  difficulty: number;
  demonMode: boolean;
  demonChance: number;
  demonBehaviorWeights: BehaviorWeights;
  demonItemWeights: ItemWeights;
  commentaryRate: number;
  ai: boolean;
  persona: string;
  modelConfig: ModelConfig;
  voiceConfig: VoiceConfig;
};

export const PERSONA_DEFAULT =
  "你是大肥鱼，蓝发鲸鱼女仆棋手。可爱、自信，偶尔简短犀利地吐槽棋，但不攻击观众本人。中文，每次最多60字。";

const CONTROL_KEY = "live-control-config";

function readControl(): Pick<
  LiveSettings,
  | "room"
  | "autoConnect"
  | "broadcastMode"
  | "liveTextScale"
  | "boardAngle"
  | "depth"
  | "difficulty"
  | "demonMode"
  | "demonChance"
  | "demonBehaviorWeights"
  | "demonItemWeights"
  | "commentaryRate"
  | "ai"
> {
  try {
    const v = JSON.parse(localStorage.getItem(CONTROL_KEY) || "{}");
    return {
      room: typeof v.room === "string" ? v.room.slice(0, 64) : "",
      autoConnect: v.autoConnect !== false,
      broadcastMode: v.broadcastMode === true,
      liveTextScale: Number.isFinite(v.liveTextScale)
        ? Math.max(125, Math.min(200, v.liveTextScale))
        : 150,
      boardAngle: boardAngle(v.boardAngle),
      depth: Number.isFinite(v.depth)
        ? Math.max(1, Math.min(6, Math.round(v.depth)))
        : 2,
      difficulty: Number.isFinite(v.difficulty)
        ? Math.max(0, Math.min(100, Math.round(v.difficulty)))
        : 100,
      commentaryRate: Number.isFinite(v.commentaryRate)
        ? Math.max(0, Math.min(100, Math.round(v.commentaryRate)))
        : 35,
      ai: typeof v.ai === "boolean" ? v.ai : false,
      demonMode: v.demonMode === true,
      demonBehaviorWeights: normalizeWeights(
        v.demonBehaviorWeights,
        defaultBehaviorWeights,
      ),
      demonItemWeights: normalizeWeights(
        v.demonItemWeights,
        defaultItemWeights,
      ),
      demonChance: Number.isFinite(v.demonChance)
        ? Math.max(0, Math.min(100, Math.round(v.demonChance)))
        : 30,
    };
  } catch {
    return {
      room: "",
      autoConnect: true,
      broadcastMode: false,
      liveTextScale: 150,
      boardAngle: DEFAULT_BOARD_ANGLE,
      depth: 2,
      difficulty: 100,
      demonMode: false,
      demonChance: 30,
      demonBehaviorWeights: { ...defaultBehaviorWeights },
      demonItemWeights: { ...defaultItemWeights },
      commentaryRate: 35,
      ai: false,
    };
  }
}

export function readLiveSettings(): LiveSettings {
  let persona = PERSONA_DEFAULT;
  try {
    persona = (
      localStorage.getItem("live-persona") || PERSONA_DEFAULT
    ).replaceAll("深深", "大肥鱼");
  } catch {
    /* localStorage unavailable — fall back to defaults. */
  }
  return {
    ...readControl(),
    persona,
    modelConfig: readModelConfig(),
    voiceConfig: readVoiceConfig(),
  };
}

function persist(next: LiveSettings) {
  try {
    localStorage.setItem(
      CONTROL_KEY,
      JSON.stringify({
        room: next.room,
        autoConnect: next.autoConnect,
        broadcastMode: next.broadcastMode,
        liveTextScale: next.liveTextScale,
        boardAngle: next.boardAngle,
        depth: next.depth,
        difficulty: next.difficulty,
        demonMode: next.demonMode,
        demonChance: next.demonChance,
        demonBehaviorWeights: next.demonBehaviorWeights,
        demonItemWeights: next.demonItemWeights,
        commentaryRate: next.commentaryRate,
        ai: next.ai,
      }),
    );
    localStorage.setItem("live-persona", next.persona);
    localStorage.setItem("live-model-config", JSON.stringify(next.modelConfig));
    localStorage.setItem("live-voice-config", JSON.stringify(next.voiceConfig));
  } catch {
    /* localStorage may be unavailable — keep in-memory state. */
  }
}

/** 设置页写入本机服务，直播源自动读取；无需共享浏览器存储。 */
export function useLiveSettings(editor = false) {
  const [settings, setSettings] = useState<LiveSettings>(readLiveSettings);
  const current = useRef(settings);
  const pending = useRef<Partial<LiveSettings>>({});
  const [syncStatus, setSyncStatus] = useState("正在同步直播设置…");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    const sync = async () => {
      const patch = pending.current;
      pending.current = {};
      const saving = Object.keys(patch).length > 0;
      // Live-streaming apps embed older browsers. Avoid AbortSignal.any/timeout:
      // an unsupported static method would prevent even sending the request.
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/live/settings", {
          method: saving ? "PATCH" : "GET",
          ...(saving
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
              }
            : {}),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("同步失败");
        const data = await response.json();
        if (stopped) return;
        if (data.settings) {
          const next = {
            ...current.current,
            ...data.settings,
            ...pending.current,
          } as LiveSettings;
          next.demonBehaviorWeights = normalizeWeights(
            next.demonBehaviorWeights,
            defaultBehaviorWeights,
          );
          next.demonItemWeights = normalizeWeights(
            next.demonItemWeights,
            defaultItemWeights,
          );
          current.current = next;
          persist(next);
          setSettings((prev) =>
            JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
          );
          setSyncStatus(
            Object.keys(pending.current).length
              ? "正在保存…"
              : "已同步到直播源，无需刷新或点击直播页",
          );
        } else if (editor) {
          // Only the settings editor migrates legacy browser settings. A fresh
          // OBS browser source must never overwrite them with its defaults.
          pending.current = { ...current.current, ...pending.current };
          setSyncStatus("正在保存到直播服务…");
        } else setSyncStatus("请先在直播设置页保存配置");
      } catch (error) {
        pending.current = { ...patch, ...pending.current };
        if (!stopped)
          setSyncStatus(
            controller.signal.aborted
              ? "读取直播配置超时，正在自动重试…"
              : "直播配置同步失败，正在自动重试：" +
                  (error instanceof Error ? error.message : String(error)),
          );
      } finally {
        clearTimeout(timeout);
        if (request === controller) request = undefined;
      }
      if (!stopped) timer = setTimeout(sync, 1000);
    };
    void sync();
    return () => {
      stopped = true;
      request?.abort();
      clearTimeout(timer);
    };
  }, [editor]);
  const update = useCallback((patch: Partial<LiveSettings>) => {
    pending.current = { ...pending.current, ...patch };
    const next = { ...current.current, ...patch };
    current.current = next;
    persist(next);
    setSettings(next);
    setSyncStatus("正在保存…");
  }, []);
  return [settings, update, syncStatus] as const;
}
