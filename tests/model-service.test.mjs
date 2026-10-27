import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { modelMiddleware } from "../scripts/model-service.mjs";

test("server selects fixed provider, reads refreshed keys and never exposes secrets", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "learnchess-models-"));
  const path = join(dir, "models.local.json");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (key) =>
    writeFileSync(
      path,
      JSON.stringify({
        mimo: { apiKey: "fake-mimo" },
        deepseek: { apiKey: key },
      }),
    );
  write("fake-deepseek");
  const calls = [];
  let fail = false;
  const fake = async (url, init) => {
    calls.push({ url, init });
    return fail
      ? new Response("secret upstream body", { status: 401 })
      : Response.json({
          choices: [{ message: { content: "OK" } }],
          internal: "private",
        });
  };
  const middleware = modelMiddleware(path, fake);
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/model-chat`;
  const body = {
    provider: "deepseek",
    model: "deepseek-flash",
    messages: [{ role: "user", content: "Hello" }],
    timeout: 600,
  };
  const request = (data = body, headers = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  const response = await request({
    ...body,
    base: "https://unrelated.invalid",
    key: "ignored-browser-key",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    choices: [{ message: { content: "OK" } }],
  });
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer fake-deepseek");
  assert.equal(calls[0].init.redirect, "error");
  assert.ok(!calls[0].init.body.includes("ignored-browser-key"));
  write("fake-updated");
  await request({ ...body, model: "deepseek-v4-pro" });
  assert.equal(calls[1].init.headers.Authorization, "Bearer fake-updated");
  await request({ ...body, provider: "mimo", model: "mimo-v2.6-pro" });
  assert.equal(
    calls[2].url,
    "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
  );
  assert.equal(calls[2].init.headers.Authorization, "Bearer fake-mimo");
  assert.equal(
    (await request({ ...body, model: "unapproved-model" })).status,
    400,
  );
  assert.equal(
    (await request(body, { Origin: "https://unrelated.invalid" })).status,
    403,
  );
  assert.equal(
    (await request(body, { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal(calls.length, 3);
  write("");
  assert.equal(
    (await (await request()).json()).error.code,
    "MODEL_KEY_MISSING",
  );
  writeFileSync(path, "invalid JSON containing fake-secret");
  const invalid = await request();
  assert.equal(invalid.status, 503);
  assert.ok(!(await invalid.text()).includes("fake-secret"));
  write("fake-deepseek");
  fail = true;
  const error = await request();
  assert.equal(error.status, 401);
  assert.ok(!(await error.text()).includes("secret upstream body"));
});

test("live SSE forwards chunks without buffering and caps completion budget", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "learnchess-stream-"));
  const path = join(dir, "models.local.json");
  writeFileSync(path, JSON.stringify({ deepseek: { apiKey: "fake" } }));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const middleware = modelMiddleware(path, async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.stream, true);
    assert.equal(body.max_tokens, 160);
    return new Response(
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const server = createServer((req, res) =>
    middleware(req, res, () => res.end()),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const r = await fetch(
    `http://127.0.0.1:${server.address().port}/api/model-chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        model: "deepseek-flash",
        timeout: 30,
        stream: true,
        max_tokens: 160,
        messages: [{ role: "user", content: "hello" }],
      }),
    },
  );
  assert.match(r.headers.get("content-type"), /text\/event-stream/);
  assert.match(await r.text(), /你好/);
});
