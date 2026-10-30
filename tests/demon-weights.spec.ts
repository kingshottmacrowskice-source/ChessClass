import { test, expect } from "@playwright/test";
test("weight controls persist, reload, and reject invalid service input", async ({page,request}) => {
 const previous=(await (await request.get("/api/live/settings")).json()).settings;
 try {
  await request.patch("/api/live/settings",{data:{autoConnect:false,demonBehaviorWeights:{destroy:1,movement:1,item:1,skill:1},demonItemWeights:{"doom-shroom":1,"monster-reborn":1,"summon-cannon":1}}});
  await page.goto("/#live-settings");
  await expect(page.getByLabel("毁灭菇权重")).toHaveValue("1");
  await page.getByLabel("毁灭菇权重").fill("0");
  await page.getByLabel("使用道具权重").fill("9");
  await expect(page.getByLabel("主动技能权重")).toBeEnabled();
  await page.getByLabel("召唤欧贝利斯克的巨神兵权重").fill("7");
  await expect.poll(async()=> (await (await request.get("/api/live/settings")).json()).settings.demonItemWeights["summon-obelisk"]).toBe(7);
  await expect.poll(async()=> (await (await request.get("/api/live/settings")).json()).settings.demonBehaviorWeights.item).toBe(9);
  await expect.poll(async()=> (await (await request.get("/api/live/settings")).json()).settings.demonItemWeights["doom-shroom"]).toBe(0);
  await page.reload();
  await expect(page.getByLabel("毁灭菇权重")).toHaveValue("0");
  await expect(page.getByLabel("使用道具权重")).toHaveValue("9");
  const invalid=await request.patch("/api/live/settings",{data:{demonItemWeights:{"doom-shroom":"bad"}}});
  expect(invalid.status()).toBe(400);
  await page.getByRole("button",{name:"恢复默认权重"}).click();
  await expect.poll(async()=> (await (await request.get("/api/live/settings")).json()).settings.demonBehaviorWeights.item).toBe(1);
 } finally {
  await page.close();
  if(previous) await request.patch("/api/live/settings",{data:previous});
 }
});
