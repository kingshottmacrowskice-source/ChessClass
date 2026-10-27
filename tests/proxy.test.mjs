import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
test("optional proxy restricts origins and forwards fixed upstream without changing protocol", async () => {
  let authorization;
  const upstream = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
  });
  await new Promise((resolve) => upstream.listen(18889, "127.0.0.1", resolve));
  const child = spawn(process.execPath, ["scripts/proxy.mjs"], {
    env: {
      ...process.env,
      PROXY_PORT: "18890",
      UPSTREAM_BASE: "http://127.0.0.1:18889/v1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Proxy startup timeout")),
        5000,
      );
      child.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", reject);
    });
    const url = "http://127.0.0.1:18890/v1/chat/completions";
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "OPTIONS",
          headers: { Origin: "http://127.0.0.1:5173" },
        })
      ).status,
      204,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Content-Type": "application/json",
        Authorization: "Bearer test-placeholder",
      },
      body: JSON.stringify({ model: "test", messages: [] }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).choices[0].message.content, "OK");
    assert.equal(authorization, "Bearer test-placeholder");
  } finally {
    child.kill();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
