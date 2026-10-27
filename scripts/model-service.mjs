import { readFileSync } from "node:fs";

const providers = {
  mimo: {
    base: "https://token-plan-cn.xiaomimimo.com/v1",
    models: ["mimo-v2.6-pro"],
  },
  deepseek: {
    base: "https://api.deepseek.com",
    models: ["deepseek-flash", "deepseek-v4-pro"],
  },
};

export function modelMiddleware(configPath, fetcher = fetch) {
  return async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/model-chat") return next();
    const send = (status, code, content) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify(
          code ? { error: { code } } : { choices: [{ message: { content } }] },
        ),
      );
    };
    if (req.headers["sec-fetch-site"] === "cross-site")
      return send(403, "FORBIDDEN");
    try {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(403, "FORBIDDEN");
    } catch {
      return send(403, "FORBIDDEN");
    }
    if (req.method !== "POST") return send(405, "METHOD_NOT_ALLOWED");
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      return send(415, "JSON_REQUIRED");
    let body, provider;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) return send(413, "REQUEST_TOO_LARGE");
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Object.hasOwn(providers, body?.provider)) throw new Error();
      provider = providers[body.provider];
      if (
        !provider.models.includes(body.model) ||
        !Array.isArray(body.messages) ||
        !body.messages.length ||
        body.messages.length > 20 ||
        !body.messages.every(
          (m) =>
            m &&
            ["system", "user", "assistant"].includes(m.role) &&
            typeof m.content === "string",
        ) ||
        !Number.isFinite(body.timeout) ||
        body.timeout < 5 ||
        body.timeout > 1800
      )
        throw new Error();
    } catch {
      return send(400, "INVALID_MODEL_REQUEST");
    }
    let key;
    try {
      const config = JSON.parse(
        readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""),
      );
      key = config[body.provider]?.apiKey;
      if (typeof key !== "string" || !key.trim())
        return send(503, "MODEL_KEY_MISSING");
      key = key.trim();
    } catch {
      return send(503, "MODEL_CONFIG_UNAVAILABLE");
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      (body.timeout + 5) * 1000,
    );
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", cancel);
    try {
      const remote = await fetcher(provider.base + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify({
          model: body.model,
          messages: body.messages.map(({ role, content }) => ({
            role,
            content,
          })),
          temperature: Number.isFinite(body.temperature)
            ? Math.max(0, Math.min(2, body.temperature))
            : 0.2,
          stream: body.stream === true,
          ...(body.max_tokens
            ? {
                max_tokens: Math.max(
                  16,
                  Math.min(1024, Number(body.max_tokens) || 160),
                ),
              }
            : {}),
        }),
        signal: controller.signal,
        redirect: "error",
      });
      if (!remote.ok) return send(remote.status, "MODEL_UPSTREAM_ERROR");
      if (body.stream === true) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
        });
        for await (const chunk of remote.body) {
          if (res.destroyed) break;
          res.write(chunk);
        }
        res.end();
        return;
      }
      const result = await remote.json();
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== "string")
        return send(502, "MODEL_RESPONSE_INVALID");
      // Do not forward raw errors, headers, or other upstream metadata.
      return send(200, null, content);
    } catch {
      if (res.headersSent) {
        res.end();
        return;
      }
      return send(
        controller.signal.aborted ? 504 : 502,
        "MODEL_UPSTREAM_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
      res.off("close", cancel);
    }
  };
}

export default function modelServicePlugin() {
  const attach = (server) => {
    server.middlewares.use(
      modelMiddleware(server.config.root + "/server/models.local.json"),
    );
  };
  return {
    name: "server-model-service",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
