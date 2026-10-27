import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_POSITION } from "chess.js";
import {
  OpeningBook,
  openingTitle,
  extractArticle,
} from "../scripts/opening-book.mjs";
const position = { start: DEFAULT_POSITION, moves: ["e2e4"] };
const parsed = {
  title: "Chess Opening Theory/1. e4",
  revid: 123,
  text: `<div class="mw-parser-output"><table class="infobox"><tr><th>King's Pawn</th></tr></table>
  <p>A sample opening explanation with enough words for this test.</p><script>unsafe()</script>
  <table><tr><td><p>Unrelated navigation paragraph should not be included here.</p></td></tr></table>
  <h2>References</h2><p>References should not become the main opening explanation.</p></div>`,
};

test("builds exact legal move paths including castling and rejects invented histories", () => {
  assert.equal(
    openingTitle({
      start: DEFAULT_POSITION,
      moves: [
        "e2e4",
        "e7e5",
        "g1f3",
        "b8c6",
        "f1b5",
        "g8f6",
        "e1g1",
        "f6e4",
        "f1e1",
      ],
    }),
    "Chess Opening Theory/1. e4/1...e5/2. Nf3/2...Nc6/3. Bb5/3...Nf6/4. O-O/4...Nxe4/5. Re1",
  );
  assert.equal(
    openingTitle({
      ...position,
      start: DEFAULT_POSITION.replace("0 1", "0 2"),
    }),
    null,
  );
  assert.equal(
    openingTitle({ ...position, moves: Array(25).fill("e2e4") }),
    null,
  );
  assert.throws(() => openingTitle({ ...position, moves: ["e2e5"] }));
});
test("extracts text without rendering scripts, diagrams or navigation and distinguishes stubs", () => {
  const article = extractArticle(parsed);
  assert.deepEqual(article.paragraphs, [
    "A sample opening explanation with enough words for this test.",
  ]);
  assert.equal(
    article.revisionUrl,
    "https://en.wikibooks.org/w/index.php?oldid=123",
  );
  assert.equal(
    extractArticle({
      ...parsed,
      text: '<div class="mw-parser-output"><h1>Opening</h1><h2>Theory table</h2></div>',
    }).paragraphs.length,
    0,
  );
});
test("persists article and missing pages, deduplicates and uses stale content offline", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "learnchess-opening-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "openings.sqlite");
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    assert.equal(url.hostname, "en.wikibooks.org");
    return Response.json(
      url.searchParams.get("page").endsWith("1. d4")
        ? { error: { code: "missingtitle" } }
        : { parse: parsed },
    );
  };
  const book = new OpeningBook(path, fetcher);
  const [one, two] = await Promise.all([
    book.lookup(position),
    book.lookup(position),
  ]);
  assert.deepEqual(one, two);
  assert.equal(calls, 1);
  assert.equal((await book.lookup(position)).cached, true);
  await book.lookup({ ...position, moves: ["d2d4"] });
  assert.equal(
    (await book.lookup({ ...position, moves: ["d2d4"] })).status,
    "not-found",
  );
  assert.equal(calls, 2);
  book.db.exec("UPDATE articles SET expires=0");
  book.close();
  const offline = new OpeningBook(path, async () => {
    throw new Error("offline");
  });
  try {
    assert.equal((await offline.lookup(position)).stale, true);
    assert.equal(
      (await offline.lookup({ ...position, moves: ["g1f3"] })).status,
      "unavailable",
    );
  } finally {
    offline.close();
  }
});
