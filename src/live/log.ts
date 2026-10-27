/** 直播日志：把关键事件（AI 请求/响应、AI 说的话、落子）追加到服务端日志文件。
 *  日志文件由 Vite 插件的 /api/live/log 端点写入 data/live.log（JSONL，每行一条）。 */
export type LiveLogEntry = {
  type: "request" | "response" | "speech" | "move";
  [key: string]: unknown;
};

export function logLive(entry: LiveLogEntry) {
  try {
    void fetch("/api/live/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {
      /* 日志失败不影响直播。 */
    });
  } catch {
    /* 忽略日志异常。 */
  }
}
