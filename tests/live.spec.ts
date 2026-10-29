import { test, expect, type Page } from "@playwright/test";
test("scheduled chat compresses old room history before replying", async ({
  page,
}) => {
  const sent: any[] = [];
  await page.route("**/api/live/settings", (route) =>
    route.fulfill({
      json: { settings: { ai: true, autoConnect: true, room: "123" } },
    }),
  );
  await page.route("**/api/live/bilibili?*", (route) =>
    route.fulfill({
      json: {
        roomEvents: Array.from({ length: 25 }, (_, i) => ({
          id: `old-${i}`,
          kind: "entry",
          user: String(i),
          name: `历史观众${i}`,
        })),
        status: "已连接",
      },
    }),
  );
  await page.route("**/api/model-chat", (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return route.fulfill(
      body.stream
        ? {
            contentType: "text/event-stream",
            body: 'data: {"choices":[{"delta":{"content":"新一轮开始了。"}}]}\n\ndata: [DONE]\n\n',
          }
        : {
            json: {
              choices: [
                {
                  message: {
                    content: "此前有多位观众入场，属于历史，无需再次欢迎。",
                  },
                },
              ],
            },
          },
    );
  });
  const start = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  await page.goto("/#live");
  await expect(page.locator(".connection").last()).toContainText("已连接");
  await page.clock.fastForward(10000);
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[0].stream).toBe(false);
  expect(sent[0].max_tokens).toBe(600);
  expect(JSON.parse(sent[0].messages[1].content).events).toHaveLength(17);
  const payload = JSON.parse(sent[1].messages[1].content);
  expect(payload.historySummary.text).toContain("此前有多位观众入场");
  expect(payload.history).toHaveLength(8);
  expect(payload.newEvents).toMatchObject([{ kind: "session" }]);
  await expect(page.locator(".sprite-bubble")).toHaveText("新一轮开始了。");
});
test("room events distinguish initial history, new notifications and local speech", async ({
  page,
}) => {
  const sent: any[] = [];
  let polls = 0;
  const roomEvents: any[] = [
    {
      id: "old-gift",
      kind: "gift",
      user: "1",
      name: "旧观众",
      gift: "旧礼物",
      count: 1,
    },
  ];
  await page.route("**/api/live/settings", (route) =>
    route.fulfill({
      json: { settings: { ai: true, autoConnect: true, room: "123" } },
    }),
  );
  await page.route("**/api/live/bilibili?*", (route) => {
    polls++;
    return route.fulfill({
      json: { roomEvents, messages: [], status: "已连接" },
    });
  });
  await page.route("**/api/model-chat", (route) => {
    const body = route.request().postDataJSON();
    if (body.stream) sent.push(JSON.parse(body.messages[1].content));
    return route.fulfill(
      body.stream
        ? {
            contentType: "text/event-stream",
            body: 'data: {"choices":[{"delta":{"content":"看见新朋友了。"}}]}\n\ndata: [DONE]\n\n',
          }
        : { json: { choices: [{ message: { content: "[]" } }] } },
    );
  });
  const start = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  await page.goto("/#live");
  await expect(page.locator(".connection").last()).toContainText("已连接");
  roomEvents.push(
    { id: "join", kind: "entry", user: "2", name: "新人" },
    {
      id: "new-gift",
      kind: "gift",
      user: "2",
      name: "新人",
      gift: "小花",
      count: 2,
    },
  );
  await page.clock.fastForward(1000);
  await expect.poll(() => polls).toBeGreaterThan(1);
  await page.clock.fastForward(9000);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "gift",
        historical: true,
        data: expect.objectContaining({ gift: "旧礼物" }),
      }),
    ]),
  );
  expect(
    sent[0].newEvents
      .filter((e: any) => ["entry", "gift"].includes(e.kind))
      .map((e: any) => e.kind),
  ).toEqual(["entry", "gift"]);
  await expect(page.locator(".board-vote")).toHaveCount(0);
  await page.getByRole("button", { name: "新的一局" }).click();
  await expect(page.locator(".sprite-bubble")).toHaveText(
    "新的一局！观众先手。",
  );
  await page.clock.fastForward(10000);
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].newEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "speech",
        data: {
          text: "新的一局！观众先手。",
          source: "local",
          reason: "reset",
        },
      }),
    ]),
  );
  expect(
    sent[1].newEvents.some((e: any) => e.kind === "gift" || e.kind === "entry"),
  ).toBe(false);
});
test("surrender shares the round and resolves after a minute without leader extensions", async ({
  page,
}) => {
  await page.route("**/api/live/settings", (route) =>
    route.fulfill({
      json: { settings: { ai: true, autoConnect: false } },
    }),
  );
  await page.route("**/api/model-chat", (route) => {
    const body = route.request().postDataJSON();
    const payload = JSON.parse(body.messages[1].content);
    const choices = (payload.messages ?? [])
      .filter((m: { text: string }) => m.text === "投降")
      .map((m: { id: string }) => ({ id: m.id, move: "surrender" }));
    return route.fulfill({
      json: { choices: [{ message: { content: JSON.stringify(choices) } }] },
    });
  });
  const start = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time: start });
  await page.goto("/#live");
  await expect(page.getByRole("main", { name: "大肥鱼的棋盘" })).toBeVisible();
  await page.clock.pauseAt(new Date(start.getTime() + 60000));
  const vote = async (user: string, text: string) => {
    await page.getByLabel("测试观众").fill(user);
    await page.getByLabel("测试弹幕").fill(text);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    if (text.includes("投降")) {
      await page.clock.fastForward(1500);
      await expect(page.locator(".chat-feedback").last()).not.toContainText(
        "正在识别",
      );
    }
  };
  await vote("否定观众", "不要投降");
  await expect(page.locator(".vote-clock")).toHaveText("等待第一票");
  await vote("观众甲", "投降");
  await expect(page.locator(".vote-clock")).toContainText("60 秒后投降重开");
  await vote("观众甲", "e4");
  await expect(page.locator(".chat-feedback").last()).toContainText(
    "本轮已投 投降，不能重复投票",
  );
  await page.clock.fastForward(48500);
  await vote("观众乙", "投降");
  await expect(page.locator(".vote-clock")).toContainText("10 秒后投降重开");
  await expect(page.locator(".board-vote")).toHaveCount(0);
  await page.clock.fastForward(9800);
  await expect(page.locator(".vote-clock")).toContainText("投降重开");
  await page.clock.fastForward(400);
  await expect(page.locator(".vote-clock")).toHaveText("等待第一票");
  await expect(page.locator(".chat-feedback")).toHaveCount(0);
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-piece-count",
    "32",
  );
  await vote("观众甲", "e4");
  await expect(page.locator('[data-vote="e2e4"]')).toHaveAttribute(
    "data-leading",
    "true",
  );
  await vote("观众甲", "投降");
  await expect(page.locator(".chat-feedback").last()).toContainText(
    "本轮已投 e2e4，不能重复投票",
  );
  await vote("观众乙", "投降");
  await vote("观众丙", "投降");
  await expect(page.locator('[data-vote="e2e4"]')).toHaveAttribute(
    "data-leading",
    "false",
  );
  await expect(page.locator(".vote-clock")).toContainText("60 秒后投降重开");
});
test("live arena accepts votes, ignores repeat users and resets safely", async ({
  page,
}) => {
  await page.goto("/#live");
  await checkFooterPanels(page);
  await expect(page.getByRole("main", { name: "大肥鱼的棋盘" })).toBeVisible();
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-piece-count",
    "32",
  );
  await expect(page.locator(".character-sprite")).toBeVisible();
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator('[data-vote="e2e4"]')).toHaveAttribute(
    "data-leading",
    "true",
  );
  await expect(page.locator(".chat-feedback").last()).toContainText(
    "已计票 · e2e4",
  );
  await page.getByLabel("测试弹幕").fill("d4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".board-vote")).toHaveCount(1);
  await expect(page.locator(".chat-feedback").last()).toContainText(
    "不能重复投票",
  );
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
          const end = line.getPointAtLength(line.getTotalLength());
          return Number.isFinite(end.x) &&
            Number.isFinite(end.y) &&
            end.x > 0 &&
            end.x < root.width
            ? 0
            : Infinity;
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
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-pieces",
    /e4:wp/,
    {
      timeout: 18000,
    },
  );
  // Her piece is lifted and thrown across the board, not teleported.
  await expect(page.locator(".fx-piece[data-fx-piece]")).toHaveCount(1, {
    timeout: 20000,
  });
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-airborne",
    /(?:flight-\d+|carried):b[pnbrqk]/,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/live-throw.png" });
  await expect(page.locator(".live-status")).toContainText("等待观众", {
    timeout: 70000,
  });
  await expect(page.locator(".board-vote")).toHaveCount(0);
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-piece-count",
    "32",
  );
  await expect(page.locator(".fx-piece")).toHaveCount(0);
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-airborne",
    "",
  );
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
  await expect(page.locator(".live-sidebar .vote-howto")).toContainText(
    "马跳f3",
  );
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
  await page.screenshot({
    path: "test-results/live-rules.png",
    fullPage: true,
  });
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
    .getByRole("checkbox", { name: "启用 AI 走法识别与定时聊天" })
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
  await expect(page.locator(".sprite-bubble").last()).toContainText(
    "欢迎来到棋盘",
    {
      timeout: 18000,
    },
  );
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
    .getByRole("checkbox", { name: "启用 AI 走法识别与定时聊天" })
    .check();
  await expect(page.getByRole("status")).toContainText("已同步");
  await page.goto("/#live");
  await checkFooterPanels(page);
  await page.getByLabel("测试弹幕").fill("你好");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble").last()).toContainText(
    "参数已应用",
    {
      timeout: 18000,
    },
  );
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
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-piece-count",
    "32",
  );
  await page.screenshot({
    path: "test-results/live-pixel-v2.png",
    fullPage: true,
  });
});

test("3D board fits desktop and mobile and retains its pieces", async ({
  page,
}) => {
  await page.goto("/#live");
  for (const size of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.locator(".three-board")).toHaveAttribute(
      "data-piece-count",
      "32",
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const box = await page.locator(".three-board").boundingBox();
    expect(box!.width).toBeGreaterThan(250);
    expect(box!.height).toBeGreaterThan(200);
    await page.screenshot({
      path: `test-results/tabletop-${size.width}.png`,
      fullPage: true,
    });
  }
});

test("scheduled AI pulls board and chat events without event-triggered replies", async ({
  page,
}) => {
  const sent: any[] = [];
  await page.route("**/api/live/settings", (route) =>
    route.fulfill({
      json: {
        settings: { ai: true, autoConnect: false, persona: "定时测试人设" },
      },
    }),
  );
  await page.route("**/api/model-chat", async (route) => {
    const body = route.request().postDataJSON();
    if (body.stream) sent.push(body);
    await route.fulfill(
      body.stream
        ? {
            contentType: "text/event-stream",
            body: 'data: {"choices":[{"delta":{"content":"定时收到事件"}}]}\n\ndata: [DONE]\n\n',
          }
        : { json: { choices: [{ message: { content: "[]" } }] } },
    );
  });
  const start = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  await page.goto("/#live");
  await expect(
    page.getByRole("status", { name: "配置同步状态" }),
  ).toContainText("已同步");
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble")).toHaveCount(0);
  await page.clock.fastForward(9999);
  expect(sent).toHaveLength(0);
  await page.clock.fastForward(1);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].messages[0].content).toContain("定时测试人设");
  const first = JSON.parse(sent[0].messages[1].content);
  expect(
    first.newEvents.some((e: any) => e.kind === "chat" && e.data.text === "e4"),
  ).toBe(true);
  expect(first.situation.fen).toBeTruthy();
  await expect(page.locator(".sprite-bubble")).toHaveText("定时收到事件");
  await page.clock.fastForward(9999);
  expect(sent).toHaveLength(1);
  await page.clock.fastForward(4000);
  await expect.poll(() => sent.length).toBe(2);
  const second = JSON.parse(sent[1].messages[1].content);
  expect(
    second.newEvents.some((e: any) => e.kind === "move" && e.data.san === "e4"),
  ).toBe(true);
  expect(
    second.newEvents.every((e: any) => e.id > first.newEvents.at(-1).id),
  ).toBe(true);
  await page.getByRole("button", { name: "返回分析" }).click();
  await page.clock.fastForward(600000);
  expect(sent).toHaveLength(2);
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
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-pieces",
    /e2:wp/,
  );
  await expect(page.locator(".three-board")).not.toHaveAttribute(
    "data-pieces",
    /e4:wp/,
  );
  await expect(page.locator(".carried-piece, .last-to")).toHaveCount(0);
});
