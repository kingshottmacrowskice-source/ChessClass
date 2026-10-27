import {
  readdir,
  readFile,
  appendFile,
  mkdir,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { createBilibiliRelay } from "./bilibili-live.mjs";
import { BilibiliLogin } from "./bilibili-login.mjs";
export default function livePlugin() {
  let relay;
  let login;
  const attach = (server) => {
    relay?.close();
    login?.close();
    const credentialFile = `${server.config.root}/${server.config.mode === "cache-test" ? "data/bilibili.test.json" : "server/bilibili.local.json"}`;
    const credentials = {
      async loadCookie() {
        let config;
        try {
          config = JSON.parse(await readFile(credentialFile, "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") return "";
          throw new Error(
            "无法读取 server/bilibili.local.json，请检查 JSON 格式",
          );
        }
        const cookie = config.cookie || "";
        if (
          typeof cookie !== "string" ||
          /[\r\n]/.test(cookie) ||
          cookie.length > 16384
        )
          throw new Error("Bilibili 登录配置格式无效");
        if (
          cookie &&
          (!/(?:^|;\s*)SESSDATA=\S+/.test(cookie) ||
            !/(?:^|;\s*)DedeUserID=\d+/.test(cookie))
        )
          throw new Error("Bilibili Cookie 需包含 SESSDATA 和 DedeUserID");
        return cookie;
      },
      async saveCookie(cookie, active) {
        await mkdir(dirname(credentialFile), { recursive: true });
        const temp = credentialFile + ".tmp-" + randomUUID();
        try {
          await writeFile(temp, JSON.stringify({ cookie }), { mode: 0o600 });
          if (active()) await rename(temp, credentialFile);
        } finally {
          await rm(temp, { force: true });
        }
      },
    };
    relay = createBilibiliRelay({ loadCookie: credentials.loadCookie });
    login = new BilibiliLogin(credentials);
    const currentLogin = login;
    const currentRelay = relay;
    server.httpServer?.once("close", () => {
      currentRelay.close();
      currentLogin.close();
    });
    const file = `${server.config.root}/data/live-settings${server.config.mode === "cache-test" ? ".test" : ""}.json`;
    let writes = Promise.resolve();
    // 直播日志：JSONL 追加写，串行化避免并发交叉。
    let logWrites = Promise.resolve();
    const appendLog = async (entry) => {
      const line =
        JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
      logWrites = logWrites
        .then(async () => {
          await mkdir(`${server.config.root}/data`, { recursive: true });
          await appendFile(`${server.config.root}/data/live.log`, line, "utf8");
        })
        .catch(() => {});
      await logWrites;
    };
    const read = async () => {
      try {
        const settings = JSON.parse(await readFile(file, "utf8"));
        if (typeof settings?.persona === "string")
          settings.persona = settings.persona.replaceAll("深深", "大肥鱼");
        return settings;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    };
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
      if (req.headers["sec-fetch-site"] === "cross-site")
        return send(403, { error: "Forbidden" });
      if (url.pathname.startsWith("/api/live/login")) {
        const host = req.headers.host;
        if (
          req.headers.origin &&
          req.headers.origin !== `http://${host}` &&
          req.headers.origin !== `https://${host}`
        )
          return send(403, { error: "Forbidden" });
        if (
          req.method !== "GET" &&
          (req.method !== "POST" ||
            !req.headers["content-type"]?.startsWith("application/json"))
        )
          return send(405, { error: "JSON POST required" });
        try {
          if (url.pathname === "/api/live/login" && req.method === "GET")
            return send(200, await currentLogin.status());
          if (req.method !== "POST")
            return send(405, { error: "POST required" });
          if (url.pathname === "/api/live/login/qr")
            return send(200, await currentLogin.start());
          if (url.pathname === "/api/live/login/poll")
            return send(
              200,
              await currentLogin.poll(url.searchParams.get("id")),
            );
          if (url.pathname === "/api/live/login/cancel")
            return send(200, currentLogin.cancel(url.searchParams.get("id")));
          if (url.pathname === "/api/live/login/logout")
            return send(200, await currentLogin.logout());
          return send(404, {});
        } catch (error) {
          return send(503, { error: error.message });
        }
      }
      if (url.pathname === "/api/live/settings") {
        try {
          if (req.method === "GET") {
            await writes;
            return send(200, { settings: await read() });
          }
          if (req.method !== "PATCH")
            return send(405, { error: "GET or PATCH required" });
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(415, { error: "JSON required" });
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16384)
              return send(413, { error: "Settings too large" });
          }
          const patch = JSON.parse(body);
          if (!patch || Array.isArray(patch) || typeof patch !== "object")
            return send(400, { error: "Invalid settings" });
          const types = {
            room: "string",
            depth: "number",
            difficulty: "number",
            commentaryRate: "number",
            ai: "boolean",
            autoConnect: "boolean",
            broadcastMode: "boolean",
            liveTextScale: "number",
            persona: "string",
            modelConfig: "object",
            voiceConfig: "object",
          };
          for (const [key, value] of Object.entries(patch)) {
            if (
              !Object.hasOwn(types, key) ||
              typeof value !== types[key] ||
              value === null ||
              Array.isArray(value)
            )
              return send(400, { error: "Invalid settings" });
          }
          const write = writes.then(async () => {
            const settings = { ...(await read()), ...patch };
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file + ".tmp", JSON.stringify(settings), "utf8");
            await rename(file + ".tmp", file);
            return settings;
          });
          writes = write.then(
            () => {},
            () => {},
          );
          return send(200, { settings: await write });
        } catch {
          return send(500, { error: "直播设置暂时无法保存或读取" });
        }
      }
      if (url.pathname === "/api/live/log") {
        if (req.method !== "POST") return send(405, { error: "POST required" });
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(415, { error: "JSON required" });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 262144)
            return send(413, { error: "Log entry too large" });
        }
        try {
          const entry = JSON.parse(body);
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error();
          await appendLog(entry);
          return send(200, { ok: true });
        } catch {
          return send(400, { error: "Invalid log entry" });
        }
      }
      if (req.method !== "GET") return send(405, { error: "GET required" });
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
        return send(200, await currentRelay.get(room));
      } catch (error) {
        return send(503, { error: error.message });
      }
    });
  };
  return {
    name: "live-chess",
    configureServer: attach,
    configurePreviewServer: attach,
    closeBundle() {
      relay?.close();
      login?.close();
    },
  };
}
