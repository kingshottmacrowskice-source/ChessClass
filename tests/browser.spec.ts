import { test, expect } from "@playwright/test";
test("server model presets keep keys out of the browser and support MiMo and DeepSeek", async ({
  page,
  request,
}) => {
  await page.route("**/engine/*.js", (route) => route.abort());
  const sent: Array<{
    model: string;
    provider: string;
    authorization: string | undefined;
  }> = [];
  await page.route("**/api/model-chat", async (route) => {
    const body = route.request().postDataJSON();
    sent.push({
      model: body.model,
      provider: body.provider,
      authorization: route.request().headers().authorization,
    });
    expect(JSON.stringify(body)).not.toContain("other-provider-placeholder");
    await route.fulfill({
      json: { choices: [{ message: { content: "OK" } }] },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "⚙ 分析设置" }).click();
  await page
    .getByLabel("API Key", { exact: true })
    .fill("other-provider-placeholder");
  for (const [model, provider, base] of [
    ["mimo-v2.6-pro", "mimo", "https://token-plan-cn.xiaomimimo.com/v1"],
    ["deepseek-flash", "deepseek", "https://api.deepseek.com"],
    ["deepseek-v4-pro", "deepseek", "https://api.deepseek.com"],
  ]) {
    await page.getByLabel("模型预设").selectOption(model);
    await expect(
      page.getByLabel("请求超时（秒）", { exact: true }),
    ).toHaveValue("600");
    await expect(page.getByLabel("API Base URL", { exact: true })).toHaveValue(
      base,
    );
    await expect(page.getByLabel("模型名称", { exact: true })).toHaveValue(
      model,
    );
    await expect(page.getByLabel("API Key", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "连接成功",
    );
    expect(sent.at(-1)).toEqual({ model, provider, authorization: undefined });
  }
  const saved = await page.evaluate(() =>
    localStorage.getItem("chess-settings"),
  );
  expect(saved).toContain("deepseek-v4-pro");
  expect(saved).not.toContain("other-provider-placeholder");
  expect((await request.get("/server/models.local.json")).status()).toBe(403);
  await page.getByLabel("模型预设").selectOption("custom");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await page.getByLabel("模型名称", { exact: true }).fill("custom-model");
});

test("persistent lookup survives reload, avoids loading Worker, and can force recompute or clear", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await expect(page.getByTestId("analysis-source")).toHaveAttribute(
    "data-source",
    "computed",
  );
  let loads = 0;
  await page.route("**/engine/*.js", (route) => {
    loads++;
    return route.abort();
  });
  await page.reload();
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await expect(page.getByTestId("analysis-source")).toHaveAttribute(
    "data-source",
    "disk",
  );
  expect(loads).toBe(0);
  const other = await browser.newContext();
  await other.addInitScript(() =>
    localStorage.setItem(
      "chess-settings",
      JSON.stringify({
        enginePreset: 19,
        seconds: 1,
        threads: 2,
        hash: 16,
        multipv: 3,
      }),
    ),
  );
  const otherPage = await other.newPage();
  await otherPage.route("**/engine/*.js", (route) => route.abort());
  await otherPage.goto("http://127.0.0.1:5174/");
  await expect(otherPage.getByTestId("analysis-source")).toHaveAttribute(
    "data-source",
    "disk",
  );
  await other.close();

  await page.getByRole("button", { name: "强制重算" }).click();
  await expect(page.locator(".engine-status")).toContainText("引擎失败");
  expect(loads).toBe(1);
  await page.unroute("**/engine/*.js");
  await page.getByRole("button", { name: "强制重算" }).click();
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await expect(page.getByTestId("analysis-source")).toHaveAttribute(
    "data-source",
    "computed",
  );
  await page.getByRole("button", { name: "⚙ 分析设置" }).click();
  await page.getByRole("button", { name: "清空分析缓存" }).click();
  await expect(page.getByRole("dialog")).toContainText("本地局面库：0 条");
  await page.route("**/engine/*.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".engine-status")).toContainText("引擎失败");
});
test.beforeEach(async ({ page, request }, info) => {
  await page.route("**/api/opening-book", (route) =>
    route.fulfill({ json: { article: null, status: "not-found" } }),
  );
  const cleared = await request.post("/api/positions", {
    data: { action: "clear" },
  });
  expect(cleared.ok()).toBeTruthy();
  if (info.title.startsWith("screenshot preset")) return;
  await page.addInitScript(() =>
    localStorage.setItem(
      "chess-settings",
      JSON.stringify({
        enginePreset: 19,
        seconds: 1,
        threads: 2,
        hash: 16,
        multipv: 3,
      }),
    ),
  );
});
test("opening articles are translated, cached after reload, and stubs fall back to analysis", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "chess-settings",
      JSON.stringify({
        model: "book-test",
        base: "http://127.0.0.1:5174/mock/v1",
        auto: true,
        enginePreset: 19,
        seconds: 1,
        threads: 2,
        hash: 16,
        multipv: 1,
      }),
    ),
  );
  let calls = 0;
  await page.route("**/mock/v1/chat/completions", async (route) => {
    calls++;
    const snapshot = JSON.parse(
      route.request().postDataJSON().messages[1].content,
    );
    if (snapshot.task === "TranslateOpening") {
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "开局资料译文",
                  paragraphs: ["这是当前局面对应开局文章的翻译。"],
                }),
              },
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                task: snapshot.task,
                fen: snapshot.fen,
                summary: {
                  text: "AI fallback test",
                  evidenceRefs: [snapshot.evidence[0].id],
                },
                intent: [],
                advantages: [],
                drawbacks: [],
                risks: [],
                responses: [],
                comparison: [],
                confidence: "low",
                confidenceReason: "test",
              }),
            },
          },
        ],
      },
    });
  });
  await page.route("**/api/opening-book", (route) =>
    route.fulfill({
      json: {
        status: "found",
        article: {
          name: "Opening test",
          title: "Chess Opening Theory/1. e4",
          paragraphs:
            route.request().postDataJSON().moves.length === 1
              ? ["Opening source text for the matched position."]
              : [],
          url: "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4",
          historyUrl: "https://en.wikibooks.org/w/index.php?action=history",
          revisionUrl: "https://en.wikibooks.org/w/index.php?oldid=123",
          fetchedAt: Date.now(),
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator(".opening-book")).toContainText(
    "Opening source text",
  );
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await expect(page.locator(".opening-translation")).toContainText(
    "开局资料译文",
  );
  await expect(page.locator(".model-state")).toContainText("开局文章 AI 翻译");
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.locator(".opening-translation")).toContainText(
    "开局资料译文",
  );
  await expect(page.locator(".model-state")).toContainText("来自局面库");
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "改用 AI 分析" }).click();
  await expect(page.locator(".summary")).toContainText("AI fallback test");
  expect(calls).toBe(2);
  await page.locator('[data-square="e7"]').click();
  await page.locator('[data-square="e5"]').click();
  await expect(page.locator(".opening-book")).toContainText(
    "暂无可展示的正文讲解",
  );
  await expect(page.locator(".summary")).toContainText("AI fallback test");
  expect(calls).toBe(3);
});
test("screenshot preset uses full Stockfish 19, 15 threads, 16 MB and eight seconds", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".engine-status")).toContainText("分析完成", {
    timeout: 60000,
  });
  await expect(page.locator(".candidate")).toHaveCount(1);
  await page.getByRole("button", { name: "⚙ 分析设置" }).click();
  await expect(page.getByLabel("每次搜索时间（秒）")).toHaveValue("8");
  await expect(page.getByLabel("引擎线程数")).toHaveValue("15");
  await expect(page.getByLabel("搜索缓存（MB）")).toHaveValue("16");
  await expect(page.getByLabel("候选数")).toHaveValue("1");
  const run = await page.evaluate(async () => {
    const { Engine } = await import("/src/core/engine.ts");
    const { initial, position } = await import("/src/core/game.ts");
    const commands: string[] = [];
    const outputs: string[] = [];
    const engine = new Engine(() => {
      const worker = new Worker("/engine/stockfish-19.js");
      worker.addEventListener("message", (e) => outputs.push(String(e.data)));
      const send = worker.postMessage.bind(worker);
      worker.postMessage = (s: string) => {
        commands.push(s);
        send(s);
      };
      return worker;
    });
    try {
      const start = performance.now();
      const a = await engine.analyze(
        position(initial()),
        14,
        1,
        undefined,
        undefined,
        { seconds: 8, threads: 15, hash: 16 },
        true,
      );
      return {
        isolated: crossOriginIsolated,
        elapsed: performance.now() - start,
        commands,
        name: outputs.find((s) => s.startsWith("id name ")),
        depth: a.candidates[0].depth,
      };
    } finally {
      engine.dispose();
    }
  });
  expect(run.isolated).toBe(true);
  expect(run.name).toContain("Stockfish 19");
  expect(run.commands).toContain("setoption name Threads value 15");
  expect(run.commands).toContain("setoption name Hash value 16");
  expect(run.commands).toContain("go movetime 8000");
  expect(run.elapsed).toBeGreaterThan(7500);
  await page.getByRole("button", { name: "完成 ✕" }).click();
  await page.screenshot({
    path: "test-results/stockfish19-preset.png",
    fullPage: true,
  });
});
test("black chooses its own best move and thin candidate arrows follow orientation", async ({
  page,
}) => {
  await page.goto("/");
  const black = await page.evaluate(async () => {
    const { Engine } = await import("/src/core/engine.ts");
    const { initial, position, move, chess, playUci } =
      await import("/src/core/game.ts");
    const engine = new Engine();
    try {
      const p = position(move(initial(), "e2e4"));
      const a = await engine.analyze(p, 12, 3);
      const matePosition = {
        start: "8/8/8/8/8/6k1/5q2/7K b - - 0 1",
        moves: [],
      };
      const mate = await engine.analyze(matePosition, 10, 3);
      const end = chess(matePosition);
      playUci(end, mate.bestmove);
      return {
        scores: a.candidates.map((c) => c.score.white),
        blackMoves: a.candidates.every(
          (c) => chess(p).get(c.pv[0].slice(0, 2))?.color === "b",
        ),
        firstIsBest: a.candidates[0].pv[0] === a.bestmove,
        mateIsBlack: mate.candidates[0].score.white < 0,
        isMate: end.isCheckmate(),
      };
    } finally {
      engine.dispose();
    }
  });
  expect(black.blackMoves).toBe(true);
  expect(black.firstIsBest).toBe(true);
  expect(black.scores[0]).toBeLessThanOrEqual(black.scores[1]);
  expect(black.scores[1]).toBeLessThanOrEqual(black.scores[2]);
  expect(black.mateIsBlack).toBe(true);
  expect(black.isMate).toBe(true);
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await page.getByRole("button", { name: "下一步推荐", exact: true }).click();
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await expect(page.locator(".best")).toContainText("黑方首选");
  await expect(page.locator(".score-perspective")).toContainText(
    "黑方通常以更低评分为优",
  );
  await expect(page.locator(".candidate-arrows line")).toHaveCount(3);
  const primary = page.locator('.candidate-arrows line[data-rank="1"]');
  const alternate = page.locator('.candidate-arrows line[data-rank="2"]');
  expect(Number(await alternate.getAttribute("stroke-width"))).toBeLessThan(
    Number(await primary.getAttribute("stroke-width")),
  );
  const oldX = Number(await primary.getAttribute("x1")),
    oldY = Number(await primary.getAttribute("y1"));
  await page.getByRole("button", { name: "翻转棋盘" }).click();
  await expect(primary).toHaveAttribute("x1", String(800 - oldX));
  await expect(primary).toHaveAttribute("y1", String(800 - oldY));
  await page.screenshot({
    path: "test-results/black-candidate-arrows.png",
    fullPage: true,
  });
  await page.locator(".pv").first().click();
  await expect(page.locator(".candidate-arrows")).toHaveCount(0);
  await page.getByRole("button", { name: "返回分析位置" }).click();
  await expect(page.locator(".candidate-arrows line")).toHaveCount(3);
});
test("real WASM handshake, search, stop, new position and mate", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { Engine } = await import("/src/core/engine.ts");
    const { initial, position, move, chess } =
      await import("/src/core/game.ts");
    const engine = new Engine();
    const p = position(initial());
    const a = await engine.analyze(p, 8, 3);
    const c = chess(p);
    c.move({ from: a.bestmove.slice(0, 2), to: a.bestmove.slice(2, 4) });
    const abort = new AbortController();
    const canceled = engine.analyze(p, 22, 3, abort.signal).then(
      () => false,
      (e) => e.name === "AbortError",
    );
    setTimeout(() => abort.abort(), 100);
    const didCancel = await canceled;
    const next = position(move(initial(), "e2e4"));
    const b = await engine.analyze(next, 8, 3);
    const mate = await engine.analyze(
      { start: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1", moves: [] },
      10,
      3,
    );
    engine.dispose();
    return {
      count: a.candidates.length,
      legal: !!c,
      changed: b.fen === chess(next).fen(),
      didCancel,
      mate: mate.candidates[0].score.kind,
    };
  });
  expect(result).toEqual({
    count: 3,
    legal: true,
    changed: true,
    didCancel: true,
    mate: "mate",
  });
});
test("model protocol, manual recommendation, invalid output fallback and session-only key", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "chess-settings",
      JSON.stringify({
        base: "http://127.0.0.1:5174/mock/v1",
        model: "test-model",
        depth: 8,
        debounce: 300,
        auto: false,
        enginePreset: 19,
        seconds: 1,
        threads: 2,
        hash: 16,
        multipv: 3,
      }),
    ),
  );
  let calls = 0;
  let bad = false;
  await page.route(
    "http://127.0.0.1:5174/mock/v1/chat/completions",
    async (route) => {
      calls++;
      const body = route.request().postDataJSON();
      const s = JSON.parse(body.messages[1].content);
      const content = bad
        ? "not-json"
        : JSON.stringify({
            task: s.task,
            fen: s.fen,
            summary: { text: "协议测试输出", evidenceRefs: [s.evidence[0].id] },
            intent: [],
            advantages: [],
            drawbacks: [],
            risks: [],
            responses: [],
            comparison: [],
            confidence: "low",
            confidenceReason: "仅测试协议，不作真实模型验收",
          });
      await route.fulfill({ json: { choices: [{ message: { content } }] } });
    },
  );
  await page.goto("/");
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "分析下一步", exact: true }).click();
  await expect(page.locator(".summary")).toContainText("协议测试输出");
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.locator(".engine-status")).toContainText("分析完成");
  await page.getByRole("button", { name: "分析下一步", exact: true }).click();
  await expect(page.locator(".summary")).toContainText("协议测试输出");
  await expect(page.locator(".model-state")).toContainText("来自局面库");
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "⚙ 分析设置" }).click();
  await expect(page.getByRole("dialog")).toContainText("AI 棋理讲解：1 条");
  await page
    .getByLabel("API Key", { exact: true })
    .fill("test-placeholder-key");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "test-placeholder-key",
  );
  await page.getByRole("button", { name: "清空分析缓存" }).click();
  await expect(page.getByRole("dialog")).toContainText("AI 棋理讲解：0 条");
  await page.getByRole("button", { name: "完成 ✕" }).click();
  bad = true;
  await page.getByRole("button", { name: "分析下一步", exact: true }).click();
  await expect(page.locator(".model-state")).toContainText("不是严格 JSON");
  await expect(page.locator(".candidate")).toHaveCount(3);
  await expect(page.locator(".summary")).toHaveCount(0);
});
test("engine asset unavailable keeps board usable", async ({ page }) => {
  await page.route("**/engine/*.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".engine-status")).toContainText("引擎失败");
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator(".moves")).toContainText("e4");
});
test("board, PGN history, branch, replay, engine-only and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".engine-status")).toContainText("分析完成", {
    timeout: 45000,
  });
  await expect(page.locator(".candidate")).toHaveCount(3);
  await page.locator(".pv").first().click();
  await expect(
    page.getByRole("button", { name: "返回分析位置" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一步 →" }).click();
  await page.getByRole("button", { name: "从这里试走" }).click();
  await expect(page.getByRole("button", { name: "返回原棋谱" })).toBeVisible();
  await page.getByRole("button", { name: "返回原棋谱" }).click();
  await page.getByText("导入与导出", { exact: false }).click();
  await page.getByLabel("棋谱内容").fill("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");
  await page.getByRole("button", { name: "导入PGN", exact: true }).click();
  await expect(page.locator(".moves button")).toHaveCount(6);
  await page.locator(".moves button").first().click();
  await page.locator('[data-square="c7"]').click();
  await page.locator('[data-square="c5"]').click();
  await expect(page.getByRole("button", { name: "返回原棋谱" })).toBeVisible();
  await expect(page.locator(".engine-status")).toContainText("分析完成", {
    timeout: 60000,
  });
  await expect(page.locator(".rating")).toContainText("c5");
  await page.getByRole("button", { name: "返回原棋谱" }).click();
  await expect(page.locator(".moves button")).toHaveCount(6);
  for (let i = 0; i < 14; i++)
    await page
      .locator(".moves button")
      .nth(i % 6)
      .click();
  await page.locator(".moves button").nth(5).click();
  await expect(page.locator(".engine-status")).toContainText("分析完成", {
    timeout: 60000,
  });
  await expect(page.locator(".rating")).toContainText("a6");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBeTruthy();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
