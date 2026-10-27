export type VoiceConfig = {
  enabled: boolean;
  rate: number;
  pitch: number;
  provider: "browser" | "openai" | "cosyvoice";
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
    if (!["browser", "openai", "cosyvoice"].includes(c.provider))
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
export class Voice {
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

  /** Pick the most natural available Chinese voice instead of the OS default. */
  private browserVoice(): SpeechSynthesisVoice | undefined {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const voices = synth.getVoices();
    const zh = voices.filter(
      (v) => /^zh/i.test(v.lang) || /普通话|中文|國語|Chinese/i.test(v.name),
    );
    const pool = zh.length ? zh : voices;
    const prefer = (re: RegExp) => pool.find((v) => re.test(v.name));
    return (
      // 微软 Azure 神经网络音色（Edge/Windows），少女、清脆，最像真人。
      prefer(/Xiaoxiao|Xiaoyi/i) ??
      prefer(/Yunxi|Yunyang/i) ??
      // Chrome 自带的中文神经网络音色。
      prefer(/Google 普通话|Google 國語|Google 中文/i) ??
      // macOS / iOS 中文音色。
      prefer(/Ting-Ting|Sin-ji|Mei-Jia/i) ??
      // 其它常见中文音色兜底。
      prefer(/Huihui|Kangkang|Yaoyao/i) ??
      pool[0]
    );
  }

  cancel() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* TTS unavailable (e.g. headless test) — ignore. */
    }
  }

  async speak(text: string, force = false) {
    if ((!this.config.enabled && !force) || !text.trim()) return;
    if (this.config.provider === "openai") return this.speakRemote("openai", text);
    if (this.config.provider === "cosyvoice")
      return this.speakRemote("cosyvoice", text);
    this.speakBrowser(text);
  }

  speakBrowser(text: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = this.config.rate;
    u.pitch = this.config.pitch;
    const voice = this.browserVoice();
    if (voice) u.voice = voice;
    synth.speak(u);
  }

  /** 服务端合成并回传音频；provider 决定走 OpenAI 兼容还是 CosyVoice。 */
  async speakRemote(provider: "openai" | "cosyvoice", text: string) {
    const r = await fetch("/api/audio-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        voice: this.config.voice,
        input: text,
        rate: this.config.rate,
        pitch: this.config.pitch,
      }),
    });
    if (!r.ok)
      throw new Error(
        `语音合成失败 (${r.status})，请在 server/models.local.json 配置 ${
          provider === "cosyvoice" ? "cosyvoice" : "tts"
        } 服务。`,
      );
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("音频播放失败"));
        void audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
