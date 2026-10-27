import http from "node:http";
const port = Number(process.env.PROXY_PORT || 8787);
const origins = new Set(
  (
    process.env.ALLOWED_ORIGINS ||
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173"
  ).split(","),
);
const upstream = new URL(
  process.env.UPSTREAM_BASE || "http://127.0.0.1:11434/v1",
);
if (
  !["http:", "https:"].includes(upstream.protocol) ||
  upstream.username ||
  upstream.password ||
  upstream.search ||
  upstream.hash
)
  throw new Error("Invalid UPSTREAM_BASE");
const target =
  upstream.href.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") +
  "/chat/completions";
const server = http.createServer(async (req, res) => {
  if (!origins.has(req.headers.origin)) {
    res.writeHead(403);
    res.end("Origin not allowed");
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.url !== "/v1/chat/completions") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  const controller = new AbortController();
  // Allow the UI's maximum 30-minute wait, plus a small network margin.
  const timer = setTimeout(() => controller.abort(), 1830000);
  res.on("close", () => controller.abort());
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 524288) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    try {
      JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end("Invalid JSON");
      return;
    }
    const remote = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization
          ? { Authorization: req.headers.authorization }
          : {}),
      },
      body,
      signal: controller.signal,
    });
    res.writeHead(remote.status, { "Content-Type": "application/json" });
    if (!remote.ok) {
      res.end(JSON.stringify({ error: "Upstream request failed" }));
      return;
    }
    res.end(await remote.text());
  } catch {
    if (!res.headersSent) res.writeHead(502);
    res.end('{"error":"Upstream unavailable or timeout"}');
  } finally {
    clearTimeout(timer);
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Optional local proxy: http://127.0.0.1:${port}/v1 (loopback only)`,
  ),
);
