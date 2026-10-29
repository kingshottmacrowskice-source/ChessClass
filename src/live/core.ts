import { logLive } from "./log";
export type ModelConfig = {
  parseModel: string;
  chatModel: string;
  temperature: number;
  chatTokens: number;
  parseTokens: number;
  timeout: number;
};
const modelDefaults: ModelConfig = {
  parseModel: "deepseek-flash",
  chatModel: "deepseek-flash",
  temperature: 0.7,
  chatTokens: 160,
  parseTokens: 500,
  timeout: 30,
};
export function readModelConfig(): ModelConfig {
  try {
    const v = JSON.parse(localStorage.getItem("live-model-config") || "{}");
    const c = { ...modelDefaults, ...v };
    for (const k of ["parseModel", "chatModel"] as const)
      if (!["deepseek-flash", "deepseek-v4-pro"].includes(c[k]))
        c[k] = modelDefaults[k];
    for (const [k, min, max] of [
      ["temperature", 0, 2],
      ["chatTokens", 32, 1024],
      ["parseTokens", 128, 1024],
      ["timeout", 5, 180],
    ] as const)
      c[k] = Number.isFinite(c[k])
        ? Math.max(min, Math.min(max, c[k]))
        : modelDefaults[k];
    return c;
  } catch {
    return { ...modelDefaults };
  }
}
import { Chess } from "chess.js";
export const uciOf = (m: { from: string; to: string; promotion?: string }) =>
  m.from + m.to + (m.promotion || "");
export function resolveMove(c: Chess, text: string): string | null {
  const s = text
    .trim()
    .replace(/^投票\s*/, "")
    .replace(/\s+/g, "");
  const moves = c.moves({ verbose: true });
  const direct = moves.filter(
    (m) =>
      uciOf(m).toLowerCase() === s.toLowerCase() ||
      m.san.replace(/[+#]/g, "").toLowerCase() ===
        s.replace(/[+#]/g, "").toLowerCase(),
  );
  if (direct.length === 1) return uciOf(direct[0]);
  const match = s.match(/^([a-h][1-8])(?:到|走|至|→|-)([a-h][1-8])([qrbn])?$/i);
  if (match) return resolveMove(c, match[1] + match[2] + (match[3] || ""));
  const cn = s.match(/^(兵|马|象|车|后|王)(?:到|走|至|吃)?([a-h][1-8])$/i);
  if (cn) {
    const p: Record<string, string> = {
      兵: "p",
      马: "n",
      象: "b",
      车: "r",
      后: "q",
      王: "k",
    };
    const list = moves.filter((m) => m.piece === p[cn[1]] && m.to === cn[2]);
    if (list.length === 1) return uciOf(list[0]);
  }
  return null;
}
export const SURRENDER = "surrender";
export const voteLabel = (choice: string) =>
  choice === SURRENDER ? "投降" : choice;
export class VoteRound {
  votes = new Map<string, string>();
  first = 0;
  last = 0;
  /** Last vote that started or reset the shared countdown. */
  private countdownAt = 0;
  add(user: string, move: string, now: number) {
    if (this.votes.has(user) || now >= this.deadline()) return false;
    const leader = this.tally()[0]?.[0];
    this.votes.set(user, move);
    if (this.votes.size === 1) this.first = now;
    if (move !== leader) this.countdownAt = now;
    this.last = now;
    return true;
  }
  deadline() {
    return this.votes.size
      ? Math.min(
          this.first + 300000,
          this.countdownAt + (this.tally()[0][0] === SURRENDER ? 60000 : 10000),
        )
      : Infinity;
  }
  tally() {
    const counts = new Map<string, number>();
    for (const m of this.votes.values())
      counts.set(m, (counts.get(m) || 0) + 1);
    return [...counts].sort(
      (a, b) =>
        b[1] - a[1] || Number(a[0] === SURRENDER) - Number(b[0] === SURRENDER),
    );
  }
  winner(now: number) {
    return now >= this.deadline() ? this.tally()[0]?.[0] : undefined;
  }
}
export async function model(
  system: string,
  text: string,
  signal: AbortSignal,
  onText?: (s: string) => void,
  config: ModelConfig = modelDefaults,
  label = "model",
) {
  const modelName = onText ? config.chatModel : config.parseModel;
  logLive({
    type: "request",
    label,
    provider: "deepseek",
    model: modelName,
    temperature: onText ? config.temperature : 0,
    system,
    user: text,
  });
  try {
    const r = await fetch("/api/model-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        provider: "deepseek",
        model: modelName,
        temperature: onText ? config.temperature : 0,
        timeout: config.timeout,
        stream: !!onText,
        max_tokens: onText ? config.chatTokens : config.parseTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
      }),
    });
    if (!r.ok)
      throw new Error(`AI 暂不可用 (${r.status})，请检查服务端 DeepSeek 密钥`);
    let content: string;
    if (!onText) {
      content = (await r.json()).choices[0].message.content as string;
    } else {
      const reader = r.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const token = JSON.parse(data).choices?.[0]?.delta?.content;
            if (token) {
              result += token;
              onText(result);
            }
          } catch {}
        }
      }
      content = result;
    }
    logLive({ type: "response", label, content });
    return content;
  } catch (e) {
    logLive({
      type: "response",
      label,
      ...(signal.aborted
        ? { aborted: true }
        : { error: e instanceof Error ? e.message : String(e) }),
    });
    throw e;
  }
}
