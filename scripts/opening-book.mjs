import { Chess, DEFAULT_POSITION } from "chess.js";
import { parseHTML } from "linkedom";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function openingTitle(position) {
  if (
    position?.start !== DEFAULT_POSITION ||
    !Array.isArray(position.moves) ||
    !position.moves.length ||
    position.moves.length > 24
  )
    return null;
  const chess = new Chess();
  const parts = position.moves.map((uci, i) => {
    if (typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
      throw new Error("Invalid move");
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return `${Math.floor(i / 2) + 1}${i % 2 ? "..." : ". "}${move.san}`;
  });
  return "Chess Opening Theory/" + parts.join("/");
}

export function extractArticle(parsed, now = Date.now()) {
  if (
    !parsed ||
    typeof parsed.text !== "string" ||
    !parsed.title?.startsWith("Chess Opening Theory/") ||
    !Number.isSafeInteger(parsed.revid) ||
    parsed.revid <= 0
  )
    throw new Error("Invalid wiki response");
  const { document } = parseHTML(parsed.text);
  const root = document.querySelector(".mw-parser-output");
  if (!root) throw new Error("Missing wiki body");
  const name = (
    root.querySelector(".infobox th")?.textContent ||
    parsed.title.split("/").at(-1)
  ).trim();
  root
    .querySelectorAll(
      "table, script, style, figure, .thumb, .navbox, .noprint, .metadata, .reflist, .references, .toc, .mw-editsection, .hatnote, .subpages, sup.reference",
    )
    .forEach((n) => n.remove());
  const paragraphs = [];
  let length = 0;
  for (const node of root.querySelectorAll("h1,h2,h3,p,li")) {
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (/^H[123]$/.test(node.tagName)) {
      if (
        /^(References|External links|See also|Bibliography|Theory table|Notes)\b/i.test(
          text,
        )
      )
        break;
      continue;
    }
    if (node.tagName === "LI" && node.querySelector("p,li")) continue;
    if (
      text.length < 30 ||
      /^(This .*stub|Retrieved from|Position in Forsyth|Moves:|Parent:)/i.test(
        text,
      )
    )
      continue;
    if (length + text.length > 16000 || paragraphs.length >= 20) break;
    paragraphs.push(text);
    length += text.length;
  }
  return {
    name: name.slice(0, 200),
    title: parsed.title,
    paragraphs,
    url:
      "https://en.wikibooks.org/wiki/" +
      parsed.title
        .split("/")
        .map((p) => encodeURIComponent(p.replaceAll(" ", "_")))
        .join("/"),
    revisionUrl: `https://en.wikibooks.org/w/index.php?oldid=${parsed.revid}`,
    historyUrl:
      "https://en.wikibooks.org/w/index.php?title=" +
      encodeURIComponent(parsed.title) +
      "&action=history",
    fetchedAt: now,
  };
}

export class OpeningBook {
  constructor(path, fetcher = fetch) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1500;
      CREATE TABLE IF NOT EXISTS articles(title TEXT PRIMARY KEY, result TEXT NOT NULL, expires INTEGER NOT NULL, touched INTEGER NOT NULL, bytes INTEGER NOT NULL);`);
    this.fetcher = fetcher;
    this.pending = new Map();
  }
  async lookup(position) {
    const title = openingTitle(position);
    if (!title) return { article: null, status: "not-applicable" };
    let cached;
    const row = this.db
      .prepare("SELECT result, expires FROM articles WHERE title=?")
      .get(title);
    if (row) {
      try {
        cached = JSON.parse(row.result);
      } catch {
        /* Refresh damaged entries. */
      }
      if (cached && row.expires > Date.now()) {
        this.db
          .prepare("UPDATE articles SET touched=? WHERE title=?")
          .run(Date.now(), title);
        return { ...cached, cached: true };
      }
    }
    if (this.pending.has(title)) return this.pending.get(title);
    const job = (async () => {
      try {
        const url = new URL("https://en.wikibooks.org/w/api.php");
        url.search = new URLSearchParams({
          action: "parse",
          page: title,
          prop: "text|revid",
          format: "json",
          formatversion: "2",
          redirects: "1",
          disableeditsection: "1",
        }).toString();
        const response = await this.fetcher(url, {
          signal: AbortSignal.timeout(7000),
          headers: { "User-Agent": "LearnChess/1.0 (local chess study tool)" },
        });
        if (!response.ok) throw new Error("Wiki unavailable");
        const data = await response.json();
        if (data.error && data.error.code !== "missingtitle")
          throw new Error("Wiki error");
        const article = data.error ? null : extractArticle(data.parse);
        const result = { article, status: article ? "found" : "not-found" };
        const json = JSON.stringify(result);
        const now = Date.now();
        this.db
          .prepare(
            `INSERT INTO articles VALUES (?,?,?,?,?) ON CONFLICT(title) DO UPDATE SET
          result=excluded.result,expires=excluded.expires,touched=excluded.touched,bytes=excluded.bytes`,
          )
          .run(
            title,
            json,
            now + (article ? 30 : 1) * 86400000,
            now,
            Buffer.byteLength(json) + Buffer.byteLength(title),
          );
        while (true) {
          const size = this.db
            .prepare(
              "SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM articles",
            )
            .get();
          if (size.count <= 1000 && size.bytes <= 16 * 1024 * 1024) break;
          this.db.exec(
            "DELETE FROM articles WHERE title=(SELECT title FROM articles ORDER BY touched LIMIT 1)",
          );
        }
        return { ...result, cached: false };
      } catch {
        return cached?.article
          ? { ...cached, cached: true, stale: true }
          : { article: null, status: "unavailable" };
      }
    })();
    this.pending.set(title, job);
    try {
      return await job;
    } finally {
      this.pending.delete(title);
    }
  }
  close() {
    this.db.close();
  }
}

export function openingMiddleware(getBook) {
  return async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/opening-book") return next();
    const send = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host)
      )
        return send(403, {});
      if (
        req.method !== "POST" ||
        req.headers["content-type"]?.split(";")[0] !== "application/json"
      )
        return send(400, {});
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) return send(413, {});
        chunks.push(chunk);
      }
      const position = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      openingTitle(position); // Validate before opening storage.
      return send(200, await getBook().lookup(position));
    } catch {
      return send(200, { article: null, status: "unavailable" });
    }
  };
}

export default function openingBookPlugin() {
  const attach = (server) => {
    let book;
    server.middlewares.use(
      openingMiddleware(
        () =>
          (book ??= new OpeningBook(
            resolve(
              server.config.root,
              server.config.mode === "cache-test"
                ? "data/openings-test.sqlite"
                : "data/openings.sqlite",
            ),
          )),
      ),
    );
    server.httpServer?.once("close", () => {
      book?.close();
      book = undefined;
    });
  };
  return {
    name: "wikibooks-opening-book",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
