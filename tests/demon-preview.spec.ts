import { test, expect } from "@playwright/test";
test("preview switches between items and skills without playing a move", async ({ page }) => {
  await page.route("**/api/live/settings", r => r.fulfill({json:{settings:{autoConnect:false,ai:false,demonMode:true}}}));
  await page.goto("/#live");
  const panel = page.getByRole("region", {name:"道具与技能预览"});
  await expect(panel.getByRole("heading", {name:"毁灭菇",exact:true})).toBeVisible();
  await panel.getByRole("button", {name:"召唤欧贝利斯克的巨神兵",exact:true}).click();
  await expect(panel.locator('canvas[data-loaded="true"]')).toHaveCount(1);
  await panel.getByRole("button", {name:"技能预览",exact:true}).click();
  await expect(panel.getByRole("heading", {name:"巨神兵 · 神拳粉碎",exact:true})).toBeVisible();
  await panel.getByRole("button", {name:"听桥",exact:true}).click();
  await expect(panel.getByText(/冷却5回合/)).toBeVisible();
  await panel.getByRole("button", {name:"道具预览",exact:true}).click();
  await expect(panel.getByRole("heading", {name:"毁灭菇",exact:true})).toBeVisible();
});

test("console can use an item for white", async ({page}) => {
 await page.route("**/api/live/settings", r => r.fulfill({json:{settings:{autoConnect:false,ai:false,demonMode:true,demonChance:0}}}));
 await page.goto("/#live");
 const panel = page.locator('[data-live-operator-panel]').getByRole('region',{name:'道具与技能预览'});
 await panel.getByRole('button',{name:'召唤炮',exact:true}).click();
 await panel.getByRole('button',{name:'选择白方使用目标'}).click();
 await panel.getByLabel('道具使用目标').selectOption({label:'e3'});
 await panel.getByRole('button',{name:'白方使用 · 消耗本回合'}).click();
 await expect(page.getByText('道具使用失败：',{exact:false})).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'选择白方使用目标'})).toBeDisabled();
});

test("white doom shows windup before committing and reset cancels it", async ({page}) => {
 await page.route("**/api/live/settings", r => r.fulfill({json:{settings:{autoConnect:false,ai:false,demonMode:true,demonChance:0}}}));
 await page.goto("/#live");
 const panel = page.locator('[data-live-operator-panel]').getByRole('region',{name:'道具与技能预览'});
 await panel.getByRole('button',{name:'选择白方使用目标'}).click();
 await panel.getByLabel('道具使用目标').selectOption({label:'e3'});
 await panel.getByRole('button',{name:'白方使用 · 消耗本回合'}).click();
 await expect(page.locator('.doom-firing .doom-mushroom')).toBeVisible();
 await expect(panel.getByRole('button',{name:'选择白方使用目标'})).toBeDisabled();
 await expect(page.locator('.doom-effect:not(.doom-firing)')).toHaveCount(0);
 await expect(page.locator('.doom-firing')).toHaveCount(0, {timeout:5000});
 await expect(page.locator('.doom-effect:not(.doom-firing)')).toHaveCount(1);
 await page.getByRole('button',{name:'新的一局',exact:true}).click();
 await panel.getByRole('button',{name:'选择白方使用目标'}).click();
 await panel.getByLabel('道具使用目标').selectOption({label:'e3'});
 await panel.getByRole('button',{name:'白方使用 · 消耗本回合'}).click();
 await expect(page.locator('.doom-firing')).toHaveCount(1);
 await page.getByRole('button',{name:'新的一局',exact:true}).click();
 await page.waitForTimeout(2400);
 await expect(page.locator('.doom-effect')).toHaveCount(0);
});
