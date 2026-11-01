import { test, expect } from "@playwright/test";

test("限时免费道具设置保存、重载并拒绝非法输入", async ({ page, request }) => {
  const previous = (await (await request.get("/api/live/settings")).json())
    .settings;
  try {
    await request.patch("/api/live/settings", {
      data: {
        autoConnect: false,
        freeItem: true,
        freeItemWeights: {
          "doom-shroom": 3,
          "monster-reborn": 0,
          "summon-cannon": 1,
          "tingqiao-stone": 1,
          "londinium-artillery": 1,
          "summon-obelisk": 0,
        },
      },
    });
    await page.goto("/#live-settings");
    await expect(page.getByLabel("启用限时免费道具")).toBeChecked();
    await expect(page.getByLabel("毁灭菇出现概率")).toHaveValue("3");
    await expect(page.getByLabel("召唤欧贝利斯克的巨神兵出现概率")).toHaveValue(
      "0",
    );

    await page.getByLabel("毁灭菇出现概率").fill("0");
    await page.getByLabel("魔法卡·死者苏生出现概率").fill("5");
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/live/settings")).json()).settings
            .freeItemWeights["monster-reborn"],
      )
      .toBe(5);
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/live/settings")).json()).settings
            .freeItem,
      )
      .toBe(true);

    await page.reload();
    await expect(page.getByLabel("启用限时免费道具")).toBeChecked();
    await expect(page.getByLabel("毁灭菇出现概率")).toHaveValue("0");
    await expect(page.getByLabel("魔法卡·死者苏生出现概率")).toHaveValue("5");

    const invalid = await request.patch("/api/live/settings", {
      data: { freeItemWeights: { "doom-shroom": "bad" } },
    });
    expect(invalid.status()).toBe(400);
    await page.getByRole("button", { name: "恢复默认概率" }).click();
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/live/settings")).json()).settings
            .freeItemWeights["doom-shroom"],
      )
      .toBe(1);
  } finally {
    await page.close();
    if (previous) await request.patch("/api/live/settings", { data: previous });
  }
});
