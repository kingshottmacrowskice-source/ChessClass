import { readModelConfig } from "./core";
export type VoiceConfig = {
  enabled: boolean;
  rate: number;
  pitch: number;
  provider: "browser" | "openai" | "cosyvoice" | "coeiroink";
  voice: string;
};

export const voiceDefaults: VoiceConfig = {
  enabled: false,
  rate: 1.05,
  pitch: 1,
  provider: "browser",
  voice: "longxiaochun",
};

export function readVoiceConfig(): VoiceConfig {
  try {
    const v = JSON.parse(localStorage.getItem("live-voice-config") || "{}");
    const c: VoiceConfig = { ...voiceDefaults, ...v };
    for (const [k, min, max] of [
      ["rate", 0.5, 2],
      ["pitch", 0.5, 2],
    ] as const)
      c[k] = Number.isFinite(c[k])
        ? Math.max(min, Math.min(max, c[k]))
        : voiceDefaults[k];
    if (!["browser", "openai", "cosyvoice", "coeiroink"].includes(c.provider))
      c.provider = voiceDefaults.provider;
    return c;
  } catch {
    return { ...voiceDefaults };
  }
}

/**
 * 给“大肥鱼”配上声音。参考 Coopanion 的 TTS 思路：
 *  - `browser`：浏览器原生 SpeechSynthesizer，优先挑微软/Google 的中文神经网络音色，零配置。
 *  - `cosyvoice`：阿里云 DashScope CosyVoice（Coopanion 同款神经 TTS），声音最自然，需密钥。
 *  - `openai`：任意 OpenAI 兼容 /v1/audio/speech 接口。
 */
export type SpeechOptions = { japanese?: string; onStart?: () => void };
export class Voice {
  private controller?: AbortController;
  private audio?: HTMLAudioElement;
  private finishPlayback?: () => void;
  constructor(public config: VoiceConfig = readVoiceConfig()) {
    // Warm the voice list so a good Chinese voice is available on first speak.
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.getVoices();
        synth.onvoiceschanged = () => synth.getVoices();
      }
    } catch {
      /* TTS unavailable — ignore. */
    }
  }

  /**
   * Pick the most natural available Chinese voice instead of the OS default.
   * 神经/在线音色（微软 Edge 的 "Online (Natural)"、Chrome 的 "Natural"）远比
   * 离线 SAPI 音色自然——这正是浏览器语音“好听”与否的关键：同一个系统里，
   * "Microsoft Xiaoxiao Online (Natural)" 和 "Microsoft Xiaoxiao" 是两回事。
   */
  private browserVoice(): SpeechSynthesisVoice | undefined {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const voices = synth.getVoices();
    const zh = voices.filter(
      (v) => /^zh/i.test(v.lang) || /普通话|中文|國語|Chinese/i.test(v.name),
    );
    const pool = zh.length ? zh : voices;
    const isNeural = (v: SpeechSynthesisVoice) =>
      /online|natural|neural|在线|自然|神经/i.test(v.name);
    const neural = (re: RegExp) =>
      pool.find((v) => isNeural(v) && re.test(v.name));
    const any = (re: RegExp) => pool.find((v) => re.test(v.name));
    return (
      // 少女音（晓晓/晓伊）在线神经版，最贴合“大肥鱼”的女仆少女设定。
      neural(/Xiaoxiao|Xiaoyi/i) ??
      // 其它 Azure 女声神经音色兜底（晓涵/晓墨/晓睿/晓颜/晓辰）。
      neural(/Xiaohan|Xiaomo|Xiaorui|Xiaoyan|Xiaochen/i) ??
      // 男声神经音色（云希/云扬/云健/云枫）。
      neural(/Yunxi|Yunyang|Yunjian|Yunfeng/i) ??
      // 任意中文神经/在线音色，仍优于离线音色。
      pool.find(isNeural) ??
      // Chrome 自带的中文神经音色。
      any(/Google 普通话|Google 國語|Google 中文/i) ??
      // macOS / iOS 中文音色（Siri 音色本身较自然）。
      any(/Ting-Ting|Sin-ji|Mei-Jia/i) ??
      // 离线微软中文音色兜底（没有神经音色时的最后选择）。
      any(/Xiaoxiao|Xiaoyi|Xiaohan|Xiaomo|Xiaorui|Xiaoyan|Xiaochen/i) ??
      any(/Yunxi|Yunyang|Huihui|Kangkang|Yaoyao/i) ??
      pool[0]
    );
  }

  cancel() {
    this.controller?.abort();
    this.audio?.pause();
    this.finishPlayback?.();
    this.audio = undefined;
    this.finishPlayback = undefined;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* TTS unavailable (e.g. headless test) — ignore. */
    }
  }

  async speak(text: string, force = false, options: SpeechOptions = {}) {
    if ((!this.config.enabled && !force) || !text.trim()) return;
    if (this.config.provider === "coeiroink")
      return this.speakRemote("coeiroink", text, options);
    if (this.config.provider === "openai")
      return this.speakRemote("openai", text, options);
    if (this.config.provider === "cosyvoice")
      return this.speakRemote("cosyvoice", text, options);
    return this.speakBrowser(text, options);
  }

  speakBrowser(text: string, options: SpeechOptions = {}) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    this.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.config.rate;
    u.pitch = this.config.pitch;
    const voice = this.browserVoice();
    if (voice) {
      u.voice = voice;
      // 让 lang 跟随所选音色：硬编码 zh-CN 时，某些浏览器会在音色的
      // lang 与之不一致时退回默认机械音，白费上面的神经音色选择。
      u.lang = voice.lang || "zh-CN";
    } else {
      u.lang = "zh-CN";
    }
    return new Promise<void>((resolve, reject) => {
      this.finishPlayback = resolve;
      u.onstart = () => options.onStart?.();
      u.onend = () => resolve();
      u.onerror = () => reject(new Error("语音播放失败"));
      synth.speak(u);
    });
  }

  /** 服务端合成并回传音频；provider 决定走 OpenAI 兼容还是 CosyVoice。 */
  async speakRemote(
    provider: "openai" | "cosyvoice" | "coeiroink",
    text: string,
    options: SpeechOptions = {},
  ) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const r = await fetch("/api/audio-speech", {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        japanese: options.japanese,
        translationModel: readModelConfig().chatModel,
        voice: this.config.voice,
        input: text,
        rate: this.config.rate,
        pitch: this.config.pitch,
      }),
    });
    if (!r.ok && provider === "coeiroink") {
      const result = await r.json().catch(() => ({}));
      const code = result.error?.code || "COEIROINK_UNAVAILABLE";
      const messages: Record<string, string> = {
        TRANSLATION_KEY_MISSING: "缺少日语翻译所需的 DeepSeek 密钥",
        TRANSLATION_FAILED: "日语翻译服务请求失败",
        TRANSLATION_INVALID: "日语翻译未返回完整文本",
        COEIROINK_ENGINE_UNAVAILABLE: "无法连接 COEIROINK 引擎",
        COEIROINK_NO_VOICE: "COEIROINK 没有可用音色",
        COEIROINK_SYNTHESIS_FAILED: "COEIROINK 音频合成失败",
        VOICE_TIMEOUT: "语音请求超过 120 秒",
      };
      throw new Error(
        "日语配音失败：" +
          (messages[code] || "语音服务不可用") +
          "（" +
          r.status +
          " / " +
          code +
          "）",
      );
    }
    if (!r.ok)
      throw new Error(
        `语音合成失败 (${r.status})，请在 server/models.local.json 配置 ${
          provider === "cosyvoice" ? "cosyvoice" : "tts"
        } 服务。`,
      );
    const blob = await r.blob();
    if (controller.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        this.audio = audio;
        this.finishPlayback = resolve;
        audio.onplaying = () => {
          options.onStart?.();
        };
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("音频播放失败"));
        void audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
      if (this.controller === controller) {
        this.audio = undefined;
        this.finishPlayback = undefined;
      }
    }
  }
}
