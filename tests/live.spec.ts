import { test, expect } from "@playwright/test";
test("live arena accepts votes, ignores repeat users and resets safely", async ({
  page,
}) => {
  await page.goto("/#live");
  await expect(page.getByRole("heading", { name: "深深的棋盘" })).toBeVisible();
  await expect(page.locator(".pixel-square")).toHaveCount(64);
  await expect(page.locator(".character-sprite")).toBeVisible();
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".vote-row")).toContainText("e2e4");
  await page.getByLabel("测试弹幕").fill("d4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".vote-row")).toHaveCount(1);
  await page.getByLabel("测试观众").fill("第二个观众");
  await page.getByLabel("测试弹幕").fill("d4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".vote-row")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/live-arena.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "新的一局" }).click();
  await expect(page.locator(".vote-row")).toHaveCount(0);
  await page.getByRole("button", { name: "返回分析" }).click();
  await expect(page.getByRole("button", { name: "⚙ 分析设置" })).toBeVisible();
});
test("live engine completes an audience and enemy turn", async ({ page }) => {
  await page.goto("/#live");
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".move-record")).toContainText("e4", {
    timeout: 18000,
  });
  await expect(page.locator(".live-status")).toContainText("等待观众", {
    timeout: 70000,
  });
  await expect(page.locator(".move-record span")).toHaveCount(2);
  await expect(page.locator(".chess-piece")).toHaveCount(32);
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
  await page.goto("/#live");
  await page.getByRole("checkbox").check();
  await page.getByLabel("测试弹幕").fill("把王前面的兵走两格");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForRequest((r) => r.url().includes("/api/model-chat"));
  await page.getByRole("button", { name: "新的一局" }).click();
  await page.waitForTimeout(1600);
  await expect(page.locator(".vote-row")).toHaveCount(0);
  await page.getByLabel("测试弹幕").fill("你好深深");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble")).toContainText("欢迎来到棋盘", {
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
  await page.goto("/#live");
  await page.getByText("模型参数", { exact: true }).click();
  await page
    .getByLabel("聊天模型", { exact: true })
    .selectOption("deepseek-v4-pro");
  await page.getByLabel("聊天温度", { exact: true }).fill("0.4");
  await page.getByLabel("聊天最大输出", { exact: true }).fill("256");
  await page.getByLabel("请求超时（秒）", { exact: true }).fill("45");
  await page.reload();
  await page.getByText("模型参数", { exact: true }).click();
  await expect(page.getByLabel("聊天温度", { exact: true })).toHaveValue("0.4");
  await page.getByRole("checkbox").check();
  await page.getByLabel("测试弹幕").fill("你好");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble")).toContainText("参数已应用", {
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
    "32",
  );
  await expect(page.locator(".pixel-piece-art")).toHaveCount(32);
  await page.screenshot({
    path: "test-results/live-pixel-v2.png",
    fullPage: true,
  });
});

test("all 64 board cells stay equal and square at desktop and mobile sizes", async ({
  page,
}) => {
  await page.goto("/#live");
  for (const size of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const cells = await page.locator(".pixel-square").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    expect(cells).toHaveLength(64);
    for (const cell of cells) {
      expect(Math.abs(cell.w - cells[0].w)).toBeLessThan(0.1);
      expect(Math.abs(cell.h - cells[0].h)).toBeLessThan(0.1);
      expect(Math.abs(cell.w - cell.h)).toBeLessThan(0.1);
    }
  }
});
test("audience and self commentary receive SF evidence and stream naturally", async ({
  page,
}) => {
  const evidence: any[] = [];
  await page.route("**/api/model-chat", async (route) => {
    const body = route.request().postDataJSON();
    if (body.stream) {
      const payload = JSON.parse(body.messages[1].content);
      if (payload.kind) evidence.push(payload);
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":"你这手挺凶，那就看看谁先出手。"}}]}\n\ndata: [DONE]\n\n',
      });
    } else
      await route.fulfill({
        json: { choices: [{ message: { content: "[]" } }] },
      });
  });
  await page.goto("/#live");
  await page.getByLabel("走棋点评频率").fill("100");
  await page.getByRole("checkbox").check();
  for (const move of ["e4", "Nc3"]) {
    await page.getByLabel("测试弹幕").fill(move);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(page.locator(".move-record")).toContainText(move, {
      timeout: 18000,
    });
    await expect(page.locator(".live-status")).toContainText("等待观众", {
      timeout: 70000,
    });
  }
  await expect.poll(() => evidence.length).toBe(2);
  expect(evidence.map((e) => e.kind)).toEqual(["audience", "self"]);
  for (const e of evidence) {
    expect(e.depth).toBeGreaterThan(0);
    expect(e.variation.length).toBeGreaterThan(0);
    expect(e.chosenMove).toMatch(/^[a-h][1-8][a-h][1-8]/);
    expect(e.score).toBeTruthy();
  }
  await expect(page.locator(".commentary-panel")).toContainText("你这手挺凶");
  await page.screenshot({
    path: "test-results/live-square-commentary.png",
    fullPage: true,
  });
});
