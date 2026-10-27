import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  PositionDatabase,
  cacheMiddleware,
} from "../scripts/position-cache.mjs";

function database(t, maxBytes) {
  const dir = mkdtempSync(join(tmpdir(), "learnchess-cache-"));
  const path = join(dir, "positions.sqlite");
  const db = new PositionDatabase(path, maxBytes);
  t.after(() => {
    try {
      db.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, path };
}
const result = {
  engine: "test",
  fen: "test",
  position: { start: "test", moves: [] },
  bestmove: "e2e4",
  candidates: [
    {
      rank: 1,
      depth: 12,
      pv: ["e2e4"],
      score: { kind: "cp", turn: "w", raw: 20, white: 20 },
    },
  ],
};
const explanation = {
  task: "RecommendMove",
  fen: "test",
  summary: { text: "Explanation", evidenceRefs: ["candidate-1"] },
  intent: [],
  advantages: [],
  drawbacks: [],
  risks: [],
  responses: [],
  comparison: [],
  confidence: "low",
  confidenceReason: "Limited search",
};

test("explanations survive restart, share capacity and are cleared with positions", async (t) => {
  const bytes = Buffer.byteLength(JSON.stringify(explanation)) + 1;
  const { db, path } = database(t, bytes * 2);
  db.put("a", explanation, "explanation");
  db.put("b", explanation);
  db.close();
  const reopened = new PositionDatabase(path, bytes * 2);
  try {
    assert.deepEqual(reopened.get("a", "explanation"), explanation);
    assert.equal(reopened.stats().explanationCount, 1);
    await new Promise((r) => setTimeout(r, 10));
    reopened.get("b");
    await new Promise((r) => setTimeout(r, 10));
    reopened.put("c", explanation, "explanation");
    assert.equal(reopened.get("a", "explanation"), null);
    assert.ok(reopened.get("b"));
    assert.ok(reopened.get("c", "explanation"));
    assert.equal(reopened.stats().bytes, bytes * 2);
    reopened.clear();
    assert.equal(reopened.stats().count, 0);
    assert.equal(reopened.stats().explanationCount, 0);
    assert.equal(reopened.stats().bytes, 0);
  } finally {
    reopened.close();
  }
});

test("disk records survive reopening and are shared between connections", (t) => {
  const { db, path } = database(t);
  db.put("position", result);
  const other = new PositionDatabase(path);
  assert.equal(other.get("position").bestmove, "e2e4");
  other.close();
  db.close();
  const reopened = new PositionDatabase(path);
  assert.equal(reopened.get("position").source, "disk");
  assert.equal(reopened.stats().count, 1);
  reopened.clear();
  assert.equal(reopened.stats().bytes, 0);
  assert.equal(reopened.get("position"), null);
  reopened.close();
});
test("capacity evicts least recently used entries and upserts maintain byte totals", async (t) => {
  const bytes = Buffer.byteLength(JSON.stringify(result)) + 1;
  const { db } = database(t, bytes * 2);
  db.put("a", result);
  db.put("b", result);
  await new Promise((r) => setTimeout(r, 10));
  db.get("a");
  await new Promise((r) => setTimeout(r, 10));
  db.put("c", result);
  assert.equal(db.get("b"), null);
  assert.ok(db.get("a"));
  assert.ok(db.get("c"));
  db.put("c", result);
  assert.deepEqual(db.stats(), {
    count: 2,
    explanationCount: 0,
    bytes: bytes * 2,
    maxBytes: bytes * 2,
  });
  assert.equal(db.put("large", { text: "x".repeat(bytes * 3) }), false);
  assert.equal(db.stats().count, 2);
});
test("API validates writes, rejects cross-origin requests, strips extra fields and reports failures", async (t) => {
  const { db } = database(t);
  let unavailable = false;
  const middleware = cacheMiddleware(() => {
    if (unavailable) throw new Error();
    return db;
  });
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/positions`;
  const request = (data, headers = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  assert.equal(
    (await request({ action: "put", key: "key", result: {} })).status,
    400,
  );
  assert.equal(
    (
      await request(
        { action: "clear" },
        { Origin: "https://unrelated.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request({ action: "clear" }, { "Content-Type": "text/plain" }))
      .status,
    415,
  );
  assert.equal(
    (
      await request({
        action: "put",
        key: "key",
        result: { ...result, apiKey: "private" },
      })
    ).status,
    200,
  );
  const hit = await (await request({ action: "get", key: "key" })).json();
  assert.equal(hit.result.bestmove, "e2e4");
  assert.equal(hit.result.apiKey, undefined);
  assert.equal((await (await request({ action: "count" })).json()).count, 1);
  const key = "a".repeat(64);
  assert.equal(
    (await request({ action: "put", kind: "explanation", key, result: {} }))
      .status,
    400,
  );
  assert.equal(
    (
      await request({
        action: "put",
        kind: "explanation",
        key,
        result: { ...explanation, apiKey: "private" },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await request({ action: "get", kind: "explanation", key })).json())
      .result,
    explanation,
  );
  assert.equal(
    (await (await request({ action: "count", kind: "explanation" })).json())
      .count,
    1,
  );
  assert.equal(
    (await request({ action: "put", key: "x".repeat(1024 * 1024), result }))
      .status,
    413,
  );
  await request({ action: "clear" });
  const translation = {
    title: "Opening translation",
    paragraphs: ["A translated paragraph."],
  };
  assert.equal(
    (
      await request({
        action: "put",
        kind: "translation",
        key,
        result: translation,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await request({ action: "get", kind: "translation", key })).json())
      .result,
    translation,
  );
  assert.equal(
    (await (await request({ action: "count", kind: "explanation" })).json())
      .count,
    1,
  );
  await request({ action: "clear" });
  assert.equal(
    (await (await request({ action: "get", kind: "explanation", key })).json())
      .result,
    null,
  );
  assert.equal(
    (await (await request({ action: "get", key: "key" })).json()).result,
    null,
  );
  unavailable = true;
  assert.equal((await request({ action: "count" })).status, 503);
});
