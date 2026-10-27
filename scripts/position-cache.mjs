import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class PositionDatabase {
  constructor(path, maxBytes = 2 * 1024 ** 3) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
      throw new Error("Invalid cache size");
    mkdirSync(dirname(path), { recursive: true });
    this.maxBytes = maxBytes;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout = 1500;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS positions (
        key TEXT PRIMARY KEY, result TEXT NOT NULL,
        saved_at INTEGER NOT NULL, touched INTEGER NOT NULL, bytes INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS positions_lru ON positions(touched);
      CREATE TABLE IF NOT EXISTS cache_size (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL);
      INSERT OR IGNORE INTO cache_size SELECT 1, COALESCE(SUM(bytes), 0) FROM positions;
      CREATE TRIGGER IF NOT EXISTS positions_insert AFTER INSERT ON positions BEGIN
        UPDATE cache_size SET bytes = bytes + NEW.bytes WHERE id = 1;
      END;
      CREATE TRIGGER IF NOT EXISTS positions_delete AFTER DELETE ON positions BEGIN
        UPDATE cache_size SET bytes = bytes - OLD.bytes WHERE id = 1;
      END;
      CREATE TRIGGER IF NOT EXISTS positions_update AFTER UPDATE OF bytes ON positions BEGIN
        UPDATE cache_size SET bytes = bytes + NEW.bytes - OLD.bytes WHERE id = 1;
      END;
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS explanations (
        key TEXT PRIMARY KEY, result TEXT NOT NULL,
        saved_at INTEGER NOT NULL, touched INTEGER NOT NULL, bytes INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS explanations_lru ON explanations(touched);
      CREATE TRIGGER IF NOT EXISTS explanations_insert AFTER INSERT ON explanations BEGIN
        UPDATE cache_size SET bytes = bytes + NEW.bytes WHERE id = 1;
      END;
      CREATE TRIGGER IF NOT EXISTS explanations_delete AFTER DELETE ON explanations BEGIN
        UPDATE cache_size SET bytes = bytes - OLD.bytes WHERE id = 1;
      END;
      CREATE TRIGGER IF NOT EXISTS explanations_update AFTER UPDATE OF bytes ON explanations BEGIN
        UPDATE cache_size SET bytes = bytes + NEW.bytes - OLD.bytes WHERE id = 1;
      END;
    `);
  }
  table(kind) {
    return ["explanation", "translation"].includes(kind)
      ? "explanations"
      : "positions";
  }
  get(key, kind) {
    const table = this.table(kind);
    const row = this.db
      .prepare(`SELECT result, saved_at FROM ${table} WHERE key = ?`)
      .get(key);
    if (!row) return null;
    try {
      const result = JSON.parse(row.result);
      this.db
        .prepare(`UPDATE ${table} SET touched = ? WHERE key = ?`)
        .run(Date.now(), key);
      return ["explanation", "translation"].includes(kind)
        ? result
        : { ...result, savedAt: row.saved_at, source: "disk" };
    } catch {
      this.db.prepare(`DELETE FROM ${table} WHERE key = ?`).run(key);
      return null;
    }
  }
  put(key, result, kind) {
    const table = this.table(kind);
    const json = JSON.stringify(result);
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(json);
    if (bytes > this.maxBytes) return false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO ${table} VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET result=excluded.result, saved_at=excluded.saved_at,
        touched=excluded.touched, bytes=excluded.bytes`,
        )
        .run(key, json, now, now, bytes);
      while (
        this.db.prepare("SELECT bytes FROM cache_size WHERE id = 1").get()
          .bytes > this.maxBytes
      ) {
        const oldest = this.db
          .prepare(
            `
          SELECT key, 'positions' AS bucket, touched FROM positions
          UNION ALL SELECT key, 'explanations' AS bucket, touched FROM explanations
          ORDER BY touched, key LIMIT 1
        `,
          )
          .get();
        this.db
          .prepare(`DELETE FROM ${oldest.bucket} WHERE key = ?`)
          .run(oldest.key);
      }
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  stats() {
    return {
      count: this.db.prepare("SELECT COUNT(*) AS count FROM positions").get()
        .count,
      explanationCount: this.db
        .prepare("SELECT COUNT(*) AS count FROM explanations")
        .get().count,
      bytes: this.db.prepare("SELECT bytes FROM cache_size WHERE id = 1").get()
        .bytes,
      maxBytes: this.maxBytes,
    };
  }
  clear() {
    this.db.exec(
      "BEGIN IMMEDIATE; DELETE FROM positions; DELETE FROM explanations; COMMIT;",
    );
  }
  close() {
    this.db.close();
  }
}

// Only analysis fields are persisted; model configuration and credentials never belong here.
function cleanAnalysis(value) {
  if (
    !value ||
    typeof value.engine !== "string" ||
    typeof value.fen !== "string" ||
    typeof value.bestmove !== "string" ||
    typeof value.position?.start !== "string" ||
    !Array.isArray(value.position.moves) ||
    !value.position.moves.every((x) => typeof x === "string") ||
    !Array.isArray(value.candidates) ||
    !value.candidates.length ||
    value.candidates.length > 5
  )
    throw new Error("Invalid analysis");
  const candidates = value.candidates.map((row) => {
    if (
      !Number.isFinite(row.rank) ||
      !Number.isFinite(row.depth) ||
      !["cp", "mate"].includes(row.score?.kind) ||
      !["w", "b"].includes(row.score?.turn) ||
      !Number.isFinite(row.score.raw) ||
      !Number.isFinite(row.score.white) ||
      !Array.isArray(row.pv) ||
      !row.pv.length ||
      !row.pv.every((x) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(x))
    )
      throw new Error("Invalid candidate");
    return {
      rank: row.rank,
      depth: row.depth,
      pv: row.pv,
      score: {
        kind: row.score.kind,
        turn: row.score.turn,
        raw: row.score.raw,
        white: row.score.white,
      },
    };
  });
  return {
    engine: value.engine,
    fen: value.fen,
    bestmove: value.bestmove,
    position: { start: value.position.start, moves: value.position.moves },
    candidates,
  };
}

function cleanExplanation(value) {
  if (
    !value ||
    !["AnalyzeMove", "RecommendMove"].includes(value.task) ||
    typeof value.fen !== "string" ||
    !["low", "medium"].includes(value.confidence) ||
    typeof value.confidenceReason !== "string" ||
    value.confidenceReason.length > 2400
  )
    throw new Error("Invalid explanation");
  const claim = (c) => {
    if (
      !c ||
      typeof c.text !== "string" ||
      !c.text.trim() ||
      c.text.length > 2400 ||
      !Array.isArray(c.evidenceRefs) ||
      !c.evidenceRefs.length ||
      c.evidenceRefs.length > 32 ||
      !c.evidenceRefs.every((id) => typeof id === "string" && id.length <= 80)
    )
      throw new Error("Invalid claim");
    return { text: c.text, evidenceRefs: c.evidenceRefs };
  };
  const cleaned = {
    task: value.task,
    fen: value.fen,
    summary: claim(value.summary),
    confidence: value.confidence,
    confidenceReason: value.confidenceReason,
  };
  for (const name of [
    "intent",
    "advantages",
    "drawbacks",
    "risks",
    "responses",
    "comparison",
  ]) {
    if (!Array.isArray(value[name]) || value[name].length > 12)
      throw new Error("Invalid claims");
    cleaned[name] = value[name].map(claim);
  }
  return cleaned;
}

function cleanTranslation(value) {
  if (
    !value ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 500 ||
    !Array.isArray(value.paragraphs) ||
    !value.paragraphs.length ||
    value.paragraphs.length > 20 ||
    !value.paragraphs.every(
      (p) => typeof p === "string" && p.trim() && p.length <= 32000,
    )
  )
    throw new Error("Invalid translation");
  return { title: value.title, paragraphs: value.paragraphs };
}

export function cacheMiddleware(openDatabase) {
  return async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/positions") return next();
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    // JSON-only, same-origin writes prevent unrelated websites modifying the local cache.
    if (req.headers["sec-fetch-site"] === "cross-site")
      return send(403, { error: "Forbidden" });
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          return send(403, { error: "Forbidden" });
      } catch {
        return send(403, { error: "Forbidden" });
      }
    }
    if (req.method !== "POST") return send(405, { error: "Use POST" });
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      return send(415, { error: "JSON required" });
    let body;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024)
          return send(413, { error: "Request too large" });
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!["get", "put", "count", "clear"].includes(body?.action))
        throw new Error();
      if (
        ["get", "put"].includes(body.action) &&
        (typeof body.key !== "string" ||
          !body.key.length ||
          Buffer.byteLength(body.key) > 65536)
      )
        throw new Error();
      if (
        body.kind !== undefined &&
        !["analysis", "explanation", "translation"].includes(body.kind)
      )
        throw new Error();
      if (
        ["explanation", "translation"].includes(body.kind) &&
        ["get", "put"].includes(body.action) &&
        !/^[a-f0-9]{64}$/.test(body.key)
      )
        throw new Error();
      if (body.action === "put")
        body.result =
          body.kind === "translation"
            ? cleanTranslation(body.result)
            : body.kind === "explanation"
              ? cleanExplanation(body.result)
              : cleanAnalysis(body.result);
    } catch {
      return send(400, { error: "Invalid cache request" });
    }
    try {
      const db = openDatabase();
      switch (body.action) {
        case "get":
          return send(200, { result: db.get(body.key, body.kind) });
        case "put":
          return send(200, {
            stored: db.put(body.key, body.result, body.kind),
          });
        case "count": {
          const stats = db.stats();
          return send(200, {
            ...stats,
            count: ["explanation", "translation"].includes(body.kind)
              ? stats.explanationCount
              : stats.count,
          });
        }
        case "clear":
          db.clear();
          return send(200, { cleared: true });
      }
    } catch {
      return send(503, { error: "Position database unavailable" });
    }
  };
}
