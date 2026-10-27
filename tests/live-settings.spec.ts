import { test, expect } from "@playwright/test";

test("settings reach an isolated live source without clicks or reloads", async ({
  browser,
  request,
}) => {
  const previous = (await (await request.get("/api/live/settings")).json())
    .settings;
  const defaults = {
    room: "",
    autoConnect: true,
    broadcastMode: false,
    liveTextScale: 150,
    depth: 2,
    difficulty: 100,
    commentaryRate: 35,
    ai: false,
    persona: "测试人设",
    modelConfig: {
      parseModel: "deepseek-flash",
      chatModel: "deepseek-flash",
      temperature: 0.7,
      chatTokens: 160,
      parseTokens: 500,
      timeout: 30,
    },
    voiceConfig: {
      enabled: false,
      rate: 1.05,
      pitch: 1,
      provider: "browser",
      voice: "longxiaochun",
    },
  };
  await request.patch("/api/live/settings", { data: defaults });
  const editorContext = await browser.newContext();
  const sourceContext = await browser.newContext();
  // Embedded browser sources may not provide these newer static APIs.
  await sourceContext.addInitScript(() => {
    Object.defineProperty(AbortSignal, "any", { value: undefined });
    Object.defineProperty(AbortSignal, "timeout", { value: undefined });
  });
  try {
    const editor = await editorContext.newPage();
    await editor.route("**/api/live/bilibili?*", (route) =>
      route.fulfill({
        json: {
          messages: [],
          connected: true,
          received: 0,
          status: "弹幕通道已连接 · 等待第一条弹幕",
        },
      }),
    );
    const source = await sourceContext.newPage();
    const rooms: string[] = [];
    let deliverMessage = false;
    await source.route("**/api/live/bilibili?*", (route) => {
      rooms.push(new URL(route.request().url()).searchParams.get("room")!);
      return route.fulfill({
        json: {
          status: "已连接 · 实时弹幕",
          messages: deliverMessage
            ? [
                {
                  id: "real-time-event-1",
                  user: "123",
                  name: "测试观众",
                  text: "e4",
                },
              ]
            : [],
        },
      });
    });
    await source.goto("http://127.0.0.1:5174/live");
    await expect(
      source.getByRole("main", { name: "大肥鱼的棋盘" }),
    ).toBeVisible();
    await editor.goto("http://127.0.0.1:5174/live-settings");
    await expect(editor.getByRole("status")).toContainText("已同步");
    const boardWidth = await source
      .locator(".pixel-board")
      .evaluate((el) => el.getBoundingClientRect().width);
    await editor.getByLabel("直播模式（放大 LIVE 页字号）").check();
    await expect(source.locator(".rule-text p").first()).toHaveCSS(
      "font-size",
      "18px",
    );
    await editor.getByLabel("直播字号大小").focus();
    await editor.getByLabel("直播字号大小").press("End");
    await expect(source.locator(".rule-text p").first()).toHaveCSS(
      "font-size",
      "24px",
    );
    expect(
      await source
        .locator(".pixel-board")
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(boardWidth);
    await source.screenshot({
      path: "test-results/live-broadcast.png",
      fullPage: true,
    });
    await editor.getByLabel("直播模式（放大 LIVE 页字号）").uncheck();
    await expect(source.locator(".rule-text p").first()).toHaveCSS(
      "font-size",
      "12px",
    );
    await editor.getByLabel("直播间号", { exact: true }).fill("12345");
    await expect.poll(() => rooms.includes("12345")).toBe(true);
    await expect(source.locator(".connection").last()).toContainText("已连接");
    deliverMessage = true;
    await expect(source.locator(".chat-feedback")).toContainText(
      "已计票 · e2e4",
    );
    await expect(source.locator('[data-vote="e2e4"]')).toHaveCount(1);
    await expect(source.locator(".chat-log p")).toHaveCount(1);
    await editor.getByLabel("直播间号", { exact: true }).fill("67890");
    await editor.getByLabel("启用廉价 AI 识别与流式聊天").check();
    await editor.getByLabel("声音来源").selectOption("cosyvoice");
    await expect.poll(() => rooms.includes("67890")).toBe(true);
    await expect
      .poll(() =>
        source.evaluate(
          () => JSON.parse(localStorage.getItem("live-control-config")!).ai,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        source.evaluate(
          () => JSON.parse(localStorage.getItem("live-voice-config")!).provider,
        ),
      )
      .toBe("cosyvoice");
    await editor.getByLabel("自动连接直播间弹幕").uncheck();
    await expect(source.locator(".connection").last()).toContainText(
      "尚未连接",
    );
    const count = rooms.length;
    await source.waitForTimeout(3000);
    expect(rooms.length).toBe(count);
    await editor.getByLabel("自动连接直播间弹幕").check();
    await expect(source.locator(".connection").last()).toContainText("已连接");
    await source.reload();
    await expect(source.locator(".connection").last()).toContainText("已连接");
  } finally {
    await editorContext.close();
    await sourceContext.close();
    await request.patch("/api/live/settings", { data: previous ?? defaults });
  }
});
