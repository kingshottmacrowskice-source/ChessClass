import { cachedLocalVoice } from "./local-voice-cache.mjs";
import { synthesizeJapanese } from "./coeiroink.mjs";
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

export function audioMiddleware(configPath, fetcher = fetch) {
  return async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/audio-speech") return next();
    const send = (status, code) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(code ? JSON.stringify({ error: { code } }) : "{}");
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
    let body;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64 * 1024) return send(413, "REQUEST_TOO_LARGE");
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        typeof body?.input !== "string" ||
        !body.input.trim() ||
        body.input.length > 2000 ||
        typeof body?.voice !== "string"
      )
        throw new Error();
    } catch {
      return send(400, "INVALID_AUDIO_REQUEST");
    }
    if (body.provider === "coeiroink") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", cancel);
      try {
        const cached = await cachedLocalVoice(body);
        if (cached) {
          res.writeHead(200, {
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
          });
          res.end(cached);
          return;
        }
        const config = body.japanese
          ? {}
          : JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
        const audio = await synthesizeJapanese(
          body,
          config,
          fetcher,
          controller.signal,
        );
        if (res.destroyed) return;
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
        });
        res.end(Buffer.from(await audio.arrayBuffer()));
      } catch (error) {
        if (!res.destroyed)
          send(
            controller.signal.aborted ? 504 : 502,
            controller.signal.aborted
              ? "VOICE_TIMEOUT"
              : [
                    "TRANSLATION_KEY_MISSING",
                    "COEIROINK_ENGINE_UNAVAILABLE",
                    "COEIROINK_NO_VOICE",
                    "TRANSLATION_FAILED",
                    "TRANSLATION_INVALID",
                    "COEIROINK_SYNTHESIS_FAILED",
                  ].includes(error.code)
                ? error.code
                : "COEIROINK_UNAVAILABLE",
          );
      } finally {
        clearTimeout(timer);
        res.off("close", cancel);
      }
      return;
    }
    const provider = body.provider === "cosyvoice" ? "cosyvoice" : "openai";
    const clamp = (n, lo, hi) =>
      Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 1;
    let key, openaiBase;
    try {
      const config = JSON.parse(
        readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""),
      );
      if (provider === "cosyvoice") {
        key = config.cosyvoice?.apiKey;
        if (typeof key !== "string" || !key.trim())
          return send(503, "MODEL_KEY_MISSING");
      } else {
        const tts = config.tts;
        key = tts?.apiKey;
        if (typeof key !== "string" || !key.trim())
          return send(503, "MODEL_KEY_MISSING");
        openaiBase = (
          typeof tts.base === "string" && tts.base.trim()
            ? tts.base.trim().replace(/\/+$/, "")
            : "https://api.openai.com/v1"
        ).replace(/\/audio\/speech$/, "");
      }
      key = key.trim();
    } catch {
      return send(503, "MODEL_CONFIG_UNAVAILABLE");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", cancel);
    const pipeBytes = async (stream) => {
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      });
      for await (const chunk of stream) {
        if (res.destroyed) break;
        res.write(chunk);
      }
      res.end();
    };
    try {
      if (provider === "cosyvoice") {
        const remote = await fetcher(
          "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + key,
            },
            body: JSON.stringify({
              model: "cosyvoice-v1",
              input: {
                text: body.input,
                voice: body.voice,
                speech_rate: clamp(body.rate, 0.5, 2),
                pitch: clamp(body.pitch, 0.5, 2),
              },
              parameters: { format: "mp3", sample_rate: 48000, volume: 50 },
            }),
            signal: controller.signal,
            redirect: "error",
          },
        );
        if (!remote.ok) return send(remote.status, "AUDIO_UPSTREAM_ERROR");
        const result = await remote.json();
        const audio =
          result?.output?.audio ??
          result?.output?.choices?.[0]?.message?.content?.find(
            (c) => c?.audio || c?.type === "audio",
          )?.audio;
        if (audio?.url) {
          const blob = await fetcher(audio.url, { signal: controller.signal });
          if (!blob.ok) return send(502, "AUDIO_FETCH_FAILED");
          return await pipeBytes(blob.body);
        }
        if (audio?.data) {
          res.writeHead(200, {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          });
          res.end(Buffer.from(audio.data, "base64"));
          return;
        }
        return send(502, "AUDIO_RESPONSE_INVALID");
      }
      const remote = await fetcher(openaiBase + "/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: body.voice,
          input: body.input,
          response_format: "mp3",
          speed: clamp(body.rate, 0.25, 4),
        }),
        signal: controller.signal,
        redirect: "error",
      });
      if (!remote.ok) return send(remote.status, "AUDIO_UPSTREAM_ERROR");
      const contentType = remote.headers.get("content-type") || "audio/mpeg";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      for await (const chunk of remote.body) {
        if (res.destroyed) break;
        res.write(chunk);
      }
      res.end();
    } catch {
      if (res.headersSent) {
        res.end();
        return;
      }
      return send(
        controller.signal.aborted ? 504 : 502,
        "AUDIO_UPSTREAM_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
      res.off("close", cancel);
    }
  };
}

export default function modelServicePlugin() {
  const attach = (server) => {
    const configPath = server.config.root + "/server/models.local.json";
    server.middlewares.use(modelMiddleware(configPath));
    server.middlewares.use(audioMiddleware(configPath));
  };
  return {
    name: "server-model-service",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
