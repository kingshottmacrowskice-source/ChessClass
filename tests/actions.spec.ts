import { test, expect } from "@playwright/test";
test("action studio loads every clip, supports stepping and timed speech", async ({
  page,
}) => {
  await page.goto("/#actions");
  await expect(
    page.getByRole("heading", { name: "深深 · 动作放映室" }),
  ).toBeVisible();
  await expect(page.locator(".action-card")).toHaveCount(9);
  await expect(
    page.locator('.action-card canvas[data-loaded="true"]'),
  ).toHaveCount(9);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  for (let i = 0; i < 9; i++) {
    await page.locator(".action-card").nth(i).click();
    await expect(page.locator(".preview-character canvas")).toHaveAttribute(
      "data-loaded",
      "true",
    );
    await page.getByRole("button", { name: "查看第1帧", exact: true }).click();
    const first = await page
      .locator(".preview-character canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await page.getByRole("button", { name: "查看第4帧", exact: true }).click();
    await expect(page.locator(".preview-character canvas")).toHaveAttribute(
      "data-frame",
      "3",
    );
    const fourth = await page
      .locator(".preview-character canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
    expect(fourth).not.toBe(first);
  }
  await page.getByLabel("气泡测试文字").fill("好");
  await page.getByRole("button", { name: "显示测试气泡" }).click();
  await expect(page.locator(".sprite-bubble")).toHaveText("好");
  await expect(page.locator(".sprite-bubble")).toHaveCount(0, {
    timeout: 5000,
  });
  await page
    .getByLabel("气泡测试文字")
    .fill("这枚棋子我就不客气了，让我看看你下一步想走到哪里。");
  await page.getByRole("button", { name: "显示测试气泡" }).click();
  await page.waitForTimeout(2400);
  await expect(page.locator(".sprite-bubble")).toBeVisible();
  await page.screenshot({
    path: "test-results/action-studio.png",
    fullPage: true,
  });
});
test("live initial speech expires and preview opens separately", async ({
  page,
}) => {
  await page.goto("/#live");
  await expect(page.locator(".sprite-bubble")).toBeVisible();
  await expect(page.locator(".sprite-bubble")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.getByRole("link", { name: "动作预览 ↗" })).toHaveAttribute(
    "target",
    "_blank",
  );
});

test("streaming speech remains until completion then expires", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input) !== "/api/model-chat") return original(input, init);
      const body = JSON.parse(String(init?.body));
      if (!body.stream)
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "[]" } }] }),
          { headers: { "Content-Type": "application/json" } },
        );
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"嗯"}}]}\n\n',
              ),
            );
            setTimeout(() => {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"，好。"}}]}\n\ndata: [DONE]\n\n',
                ),
              );
              controller.close();
            }, 5000);
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
  });
  await page.goto("/#live");
  await page.getByRole("checkbox").check();
  await page.getByLabel("测试弹幕").fill("你好");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".sprite-bubble")).toHaveText("嗯", {
    timeout: 16000,
  });
  await page.waitForTimeout(2800);
  await expect(page.locator(".sprite-bubble")).toHaveText("嗯");
  await expect(page.locator(".sprite-bubble")).toHaveText("嗯，好。");
  await expect(page.locator(".sprite-bubble")).toHaveCount(0, {
    timeout: 5000,
  });
});
