import { test, expect, type Page } from "@playwright/test";
test("live arena accepts votes, ignores repeat users and resets safely", async ({
  page,
}) => {
  await page.goto("/#live");
  await checkFooterPanels(page);
  await expect(page.getByRole("main", { name: "大肥鱼的棋盘" })).toBeVisible();
  await expect(page.locator(".pixel-square")).toHaveCount(64);
  await expect(page.locator(".character-sprite")).toBeVisible();
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator('[data-vote="e2e4"]')).toHaveAttribute(
    "data-leading",
    "true",
  );
  await expect(page.locator(".chat-feedback").last()).toContainText("已计票 · e2e4");
  await page.getByLabel("测试弹幕").fill("d4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".board-vote")).toHaveCount(1);
  await expect(page.locator(".chat-feedback").last()).toContainText("不能重复投票");
  await page.getByLabel("测试观众").fill("第二个观众");
  await page.getByLabel("测试弹幕").fill("d4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".board-vote")).toHaveCount(2);
  await expect(page.locator('[data-vote="e2e4"]')).toHaveAttribute(
    "data-leading",
    "true",
  );
  await page.getByLabel("测试观众").fill("第三个观众");
  await page.getByLabel("测试弹幕").fill("d4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator('[data-vote="d2d4"]')).toHaveAttribute(
    "data-leading",
    "true",
  );
  await expect(page.locator('[data-vote="d2d4"]')).toHaveAttribute(
    "aria-label",
    "d2d4，2票，当前第一名",
  );
  await expect(page.locator('[data-vote-line="d2d4"]')).toHaveCSS(
    "stroke",
    "rgb(161, 62, 50)",
  );
  await expect(page.locator('[data-vote-line="e2e4"]')).toHaveCSS(
    "stroke",
    "rgb(46, 74, 63)",
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const line = document.querySelector(
            '[data-vote-line="d2d4"]',
          ) as SVGPathElement;
          const root = document
            .querySelector(".board-perspective")!
            .getBoundingClientRect();
          const target = document
            .querySelector('[data-square="d4"]')!
            .getBoundingClientRect();
          const end = line.getPointAtLength(line.getTotalLength());
          return Math.hypot(
            root.x + end.x - (target.left + target.right) / 2,
            root.y + end.y - (target.top + target.bottom) / 2,
          );
        }),
      )
      .toBeLessThan(1);
    await page.screenshot({
      path: `test-results/board-votes-${width}.png`,
      fullPage: true,
    });
  }
  await page.screenshot({
    path: "test-results/live-arena.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "新的一局" }).click();
  await expect(page.locator(".board-vote")).toHaveCount(0);
  await page.getByRole("button", { name: "返回分析" }).click();
  await expect(page.getByRole("button", { name: "⚙ 分析设置" })).toBeVisible();
});
test("live engine completes an audience and enemy turn", async ({ page }) => {
  await page.goto("/#live");
  await checkFooterPanels(page);
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.locator('[data-piece-square="e4"] .chess-piece.w'),
  ).toHaveCount(1, {
    timeout: 18000,
  });
  // Her piece is lifted and thrown across the board, not teleported.
  await expect(page.locator(".fx-piece[data-fx-piece]")).toHaveCount(1, {
    timeout: 20000,
  });
  await page.screenshot({ path: "test-results/live-throw.png" });
  await expect(page.locator(".live-status")).toContainText("等待观众", {
    timeout: 70000,
  });
  await expect(page.locator(".board-vote")).toHaveCount(0);
  await expect(page.locator(".chess-piece")).toHaveCount(32);
  await expect(page.locator(".fx-piece")).toHaveCount(0);
  await expect(page.locator(".notation-live")).toContainText(/刚才 .+：/);
});

test("built-in finisher plays without videos, rules sheet and danmaku show", async ({
  page,
}) => {
  await page.route("**/api/live/videos", (route) =>
    route.fulfill({ json: { promotion: [], checkmate: [] } }),
  );
  await page.goto("/#live");
  await expect(page.locator(".rule-card")).toHaveCount(6);
  await expect(page.locator(".live-sidebar .vote-howto")).toContainText("马跳f3");
  await expect(page.locator(".round-summary, .vote-legend")).toHaveCount(0);
  // Diagrams are checkered, not striped: neighbours in a column alternate.
  const shades = await page
    .locator(".rule-card")
    .first()
    .locator(".rule-grid span")
    .evaluateAll((cells) => cells.map((c) => c.className.split(" ")[0]));
  expect(shades.slice(0, 6)).toEqual(["l", "d", "l", "d", "l", "d"]);
  const cell = await page
    .locator(".rule-grid span")
    .first()
    .evaluate((c) => [c.clientWidth, c.clientHeight]);
  expect(Math.abs(cell[0] - cell[1])).toBeLessThanOrEqual(1);
  await page.getByLabel("测试弹幕").fill("大肥鱼今天也好可爱");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".danmaku")).toContainText("大肥鱼今天也好可爱");
  await expect(page.locator(".actor-emote")).toBeVisible();
  await page.getByRole("button", { name: "预览将死大招" }).click();
  const cut = page.getByRole("dialog", { name: "大招动画" });
  await expect(cut).toContainText("CHECKMATE");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/ultimate-cut.png" });
  await expect(cut).toHaveCount(0, { timeout: 5000 });
  await page.getByRole("button", { name: "预览升变大招" }).click();
  await page.getByRole("button", { name: "跳过大招" }).click();
  await expect(cut).toHaveCount(0);
  await page.screenshot({ path: "test-results/live-rules.png", fullPage: true });
});

test("AI batches chat and rejects a stale interpretation after reset", async ({
  page,
}) => {
  await page.route("**/api/model-chat", async (route) => {
    const body = route.request().postDataJSON();
    if (body.stream) {
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":"欢迎来到棋盘"}}]}\n\ndata: [DONE]\n\n',
      });
    } else {
      await new Promise((r) => setTimeout(r, 1200));
      const messages = JSON.parse(body.messages[1].content).messages;
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: JSON.stringify(
                  messages.map((m: any) => ({ id: m.id, move: "e2e4" })),
                ),
              },
            },
          ],
        },
      });
    }
  });
  await page.goto("/#live-settings");
  await page
    .getByRole("checkbox", { name: "启用廉价 AI 识别与流式聊天" })
    .check();
  await expect(page.getByRole("status")).toContainText("已同步");
  await page.goto("/#live");
  await checkFooterPanels(page);
  await page.getByLabel("测试弹幕").fill("把王前面的兵走两格");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForRequest((r) => r.url().includes("/api/model-chat"));
  await page.getByRole("button", { name: "新的一局" }).click();
  await page.waitForTimeout(1600);
  await expect(page.locator(".board-vote")).toHaveCount(0);
  await page.getByLabel("测试弹幕").fill("你好大肥鱼");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble").last()).toContainText("欢迎来到棋盘", {
    timeout: 18000,
  });
});

test("live model controls persist and change both requests", async ({
  page,
}) => {
  const sent: any[] = [];
  await page.route("**/api/model-chat", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    await route.fulfill(
      body.stream
        ? {
            contentType: "text/event-stream",
            body: 'data: {"choices":[{"delta":{"content":"参数已应用"}}]}\n\ndata: [DONE]\n\n',
          }
        : { json: { choices: [{ message: { content: "[]" } }] } },
    );
  });
  await page.goto("/#live-settings");
  await page
    .getByLabel("聊天模型", { exact: true })
    .selectOption("deepseek-v4-pro");
  await page.getByLabel("聊天温度", { exact: true }).fill("0.4");
  await page.getByLabel("聊天最大输出", { exact: true }).fill("256");
  await page.getByLabel("请求超时（秒）", { exact: true }).fill("45");
  await expect(page.getByRole("status")).toContainText("已同步");
  await page.reload();
  await expect(page.getByLabel("聊天温度", { exact: true })).toHaveValue("0.4");
  await page
    .getByRole("checkbox", { name: "启用廉价 AI 识别与流式聊天" })
    .check();
  await expect(page.getByRole("status")).toContainText("已同步");
  await page.goto("/#live");
  await checkFooterPanels(page);
  await page.getByLabel("测试弹幕").fill("你好");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble").last()).toContainText("参数已应用", {
    timeout: 18000,
  });
  expect(sent.find((x) => x.stream)).toMatchObject({
    model: "deepseek-v4-pro",
    temperature: 0.4,
    max_tokens: 256,
    timeout: 45,
  });
  expect(sent.find((x) => !x.stream)).toMatchObject({
    model: "deepseek-flash",
    temperature: 0,
  });
  await expect(page.locator(".character-sprite")).toHaveAttribute(
    "width",
    "512",
  );
  await expect(page.locator(".pixel-chess-art")).toHaveCount(32);
  await page.screenshot({
    path: "test-results/live-pixel-v2.png",
    fullPage: true,
  });
});

test("tabletop keeps 64 logical squares and fits desktop and mobile", async ({
  page,
}) => {
  await page.goto("/#live");
  await checkFooterPanels(page);
  for (const size of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const cells = await page.locator(".pixel-square").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          w: (e as HTMLElement).offsetWidth,
          h: (e as HTMLElement).offsetHeight,
          projectedWidth: r.width,
          projectedHeight: r.height,
        };
      }),
    );
    expect(cells).toHaveLength(64);
    expect(cells[56].projectedWidth).toBeGreaterThan(cells[0].projectedWidth);
    expect(cells.every((cell) => cell.projectedHeight > 0)).toBe(true);
    await expect(
      page.locator('.pixel-chess-art[data-loaded="true"]'),
    ).toHaveCount(32);
    const shadowOffsets = await page
      .locator(".standing-piece")
      .evaluateAll((pieces) =>
        pieces.map((piece) => {
          const art = piece.querySelector("canvas")!;
          const bounds = art.getBoundingClientRect();
          const visibleBottom =
            bounds.top +
            (bounds.height * Number(art.dataset.pixelBottom)) / art.height;
          return Math.abs(
            piece.querySelector(".floor-shadow")!.getBoundingClientRect()
              .bottom - visibleBottom,
          );
        }),
      );
    expect(Math.max(...shadowOffsets)).toBeLessThan(0.6);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/tabletop-${size.width}.png`,
      fullPage: true,
    });
    for (const cell of cells) {
      expect(Math.abs(cell.w - cells[0].w)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.h - cells[0].h)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.w - cell.h)).toBeLessThanOrEqual(1);
    }
  }
});
test("upright pixel pieces and walking character share depth ordering", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  await page.clock.install();
  await page.goto("/#live");
  await expect(
    page.locator('.pixel-chess-art[data-loaded="true"]'),
  ).toHaveCount(32);
  const depth = async (selector: string) =>
    page.locator(selector).evaluate((e) => Number(getComputedStyle(e).zIndex));
  const actor = ".deepseek-actor";
  expect(await depth(actor)).toBeLessThan(
    await depth('[data-piece-square="h2"]'),
  );
  expect(await depth(actor)).toBeGreaterThan(
    await depth('[data-piece-square="h8"]'),
  );
  await expect(page.locator(".board-objects")).toHaveCSS("transform", "none");
  await expect(page.locator(".pixel-chess-art").first()).toHaveCSS(
    "image-rendering",
    "pixelated",
  );
  const restingPosition = await page.locator(actor).getAttribute("style");
  // Waiting behaviours start within 4–9 s; Math.random = 0.99 picks a stroll.
  await page.clock.fastForward(3500);
  expect(await page.locator(actor).getAttribute("style")).toBe(restingPosition);
  await page.clock.fastForward(6000);
  await page.clock.runFor(2500);
  await expect(page.locator(actor)).toHaveAttribute("data-moving", "false");
  expect(await page.locator(actor).getAttribute("style")).not.toBe(
    restingPosition,
  );
  await expect(page.getByText(/观众执白 · SF 深度/)).toHaveCount(0);
  await expect(page.locator(".live-page")).toHaveCSS(
    "background-color",
    "rgb(245, 230, 211)",
  );
  await expect(page.getByRole("button", { name: "新的一局" })).toHaveCSS(
    "transition-duration",
    "0.7s, 0.7s, 0.7s, 0.7s",
  );
  expect(await depth(actor)).toBeGreaterThan(
    await depth('[data-piece-square="h7"]'),
  );
  expect(await depth(actor)).toBeLessThan(
    await depth('[data-piece-square="h2"]'),
  );
  await page.screenshot({
    path: "test-results/standing-pixel-depth.png",
    fullPage: true,
  });
});

test("audience and self commentary receive SF evidence and stream naturally", async ({
  page,
}) => {
  const evidence: any[] = [];
  await page.route("**/api/model-chat", async (route) => {
    const body = route.request().postDataJSON();
    if (body.stream) {
      const payload = JSON.parse(body.messages[1].content);
      if (payload.commentOn) evidence.push(payload);
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":"你这手挺凶，那就看看谁先出手。"}}]}\n\ndata: [DONE]\n\n',
      });
    } else
      await route.fulfill({
        json: { choices: [{ message: { content: "[]" } }] },
      });
  });
  await page.goto("/#live-settings");
  await page.getByLabel("走棋点评频率").fill("100");
  await page
    .getByRole("checkbox", { name: "启用廉价 AI 识别与流式聊天" })
    .check();
  await expect(page.getByRole("status")).toContainText("已同步");
  await page.goto("/#live");
  await checkFooterPanels(page);
  for (const move of ["e4", "Nc3"]) {
    await page.getByLabel("测试弹幕").fill(move);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(
      page.locator(
        `[data-piece-square="${move === "e4" ? "e4" : "c3"}"] .chess-piece.w`,
      ),
    ).toHaveCount(1, {
      timeout: 18000,
    });
    await expect(page.locator(".live-status")).toContainText("等待观众", {
      timeout: 70000,
    });
  }
  await expect.poll(() => evidence.length).toBe(2);
  expect(evidence.map((e) => e.commentOn)).toEqual(["opponent", "self"]);
  for (const e of evidence) {
    expect(e.depth).toBeGreaterThan(0);
    expect(e.variation.length).toBeGreaterThan(0);
    expect(e.yourMove).toMatch(
      /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)$/,
    );
    expect(e.score).toBeTruthy();
  }
  await expect(page.locator(".commentary-panel")).toContainText("你这手挺凶");
  await page.screenshot({
    path: "test-results/live-square-commentary.png",
    fullPage: true,
  });
});

// Operator controls are part of the footer, without changing production visibility.
async function checkFooterPanels(page: Page) {
  const panels = page.locator("footer [data-live-operator-panel]");
  await expect(panels).toHaveCount(2);
  for (const panel of await panels.all()) await expect(panel).toBeVisible();
  await expect(
    page.locator(".live-page > header, .vote-panel, .move-record"),
  ).toHaveCount(0);
  await expect(
    page.locator("footer").getByRole("button", { name: "新的一局" }),
  ).toBeVisible();
}

test("reset during audience landing cancels the pending enemy turn", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/#live");
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.clock.runFor(10200);
  await expect(page.locator(".live-status")).toContainText("观众落子中");
  await expect(page.locator(".vote-clock")).toContainText("已锁定");
  await page.getByRole("button", { name: "新的一局" }).click();
  await page.clock.runFor(1000);
  await expect(page.locator(".live-status")).toContainText("等待观众");
  await expect(page.locator('[data-piece-square="e2"]')).toHaveCount(1);
  await expect(page.locator('[data-piece-square="e4"]')).toHaveCount(0);
  await expect(page.locator(".carried-piece, .last-to")).toHaveCount(0);
});
