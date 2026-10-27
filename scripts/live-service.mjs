import { readdir } from "node:fs/promises";
export default function livePlugin() {
  const attach = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/api/live/")) return next();
      const send = (status, data) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(data));
      };
      if (req.method !== "GET") return send(405, { error: "GET required" });
      if (req.headers["sec-fetch-site"] === "cross-site")
        return send(403, { error: "Forbidden" });
      if (url.pathname === "/api/live/videos") {
        const result = {};
        for (const kind of ["promotion", "checkmate"]) {
          try {
            result[kind] = (
              await readdir(`${server.config.root}/public/live-videos/${kind}`)
            )
              .filter((f) => /\.(mp4|webm|ogv)$/i.test(f))
              .map((f) => `/live-videos/${kind}/${encodeURIComponent(f)}`);
          } catch {
            result[kind] = [];
          }
        }
        return send(200, result);
      }
      if (url.pathname !== "/api/live/bilibili") return send(404, {});
      const room = url.searchParams.get("room");
      if (!/^\d{1,15}$/.test(room || ""))
        return send(400, { error: "请输入数字直播间号" });
      try {
        const r = await fetch(
          `https://api.live.bilibili.com/xlive/web-room/v1/dM/gethistory?roomid=${room}`,
          {
            headers: {
              Referer: `https://live.bilibili.com/${room}`,
              "User-Agent": "Mozilla/5.0",
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (data.code !== 0 || !Array.isArray(data.data?.room))
          throw new Error();
        return send(200, {
          messages: data.data.room
            .filter((m) => m.uid)
            .map((m) => ({
              id: `${m.uid}:${m.timeline}:${m.text}`,
              user: String(m.uid),
              name: String(m.nickname || m.uid).slice(0, 40),
              text: String(m.text).slice(0, 300),
            })),
        });
      } catch {
        return send(502, {
          error: "Bilibili 弹幕拉取失败，稍后自动重连；可用本地弹幕测试",
        });
      }
    });
  };
  return {
    name: "live-chess",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
