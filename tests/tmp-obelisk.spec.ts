import { test, expect } from "@playwright/test";
test("obelisk art", async ({ page }) => {
  await page.route("**/api/live/settings", (r) => r.fulfill({ json: { settings: {
    autoConnect: false, ai: false, demonMode: true, demonChance: 100,
    demonBehaviorWeights: { destroy: 0, movement: 0, item: 1, skill: 0 },
    demonItemWeights: { "doom-shroom": 0, "monster-reborn": 0, "summon-cannon": 0,
      "tingqiao-stone": 0, "londinium-artillery": 0, "summon-obelisk": 1 } } } }));
  await page.route("**/api/live/log", (r) => r.fulfill({ json: { ok: true } }));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/#live");
  await page.getByLabel("测试弹幕").fill("e4");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const board = page.locator("canvas.three-board");
  await expect(board).toHaveAttribute("data-pieces", /:bo/, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator(".live-stage").screenshot({ path: "test-results/obelisk-stage.png" });
  // 直接放大画布纹理本身，排除透视与光照干扰
  const art = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-art="bo"] canvas')!;
    return c.toDataURL();
  });
  const fs = await import("node:fs");
  fs.writeFileSync(
    "test-results/obelisk-art.txt",
    art,
  );
});
