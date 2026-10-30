import { test, expect } from "@playwright/test";
test("artillery shows projected red warning cells and a three-step countdown",async({page})=>{
 await page.route("**/api/live/settings",route=>route.fulfill({json:{settings:{
 autoConnect:false,ai:false,demonMode:true,demonChance:100,
 demonBehaviorWeights:{destroy:0,movement:0,item:1,skill:0},
 demonItemWeights:{"doom-shroom":0,"monster-reborn":0,"summon-cannon":0,"tingqiao-stone":0,"londinium-artillery":1,"summon-obelisk":0}
 }}}));
 await page.route("**/api/live/log",route=>route.fulfill({json:{ok:true}}));
 await page.goto("/#live");
 await page.getByLabel("测试弹幕").fill("e4");
 await page.getByRole("button",{name:"发送",exact:true}).click();
 const label=page.locator(".bombardment-label");
 await expect(label).toContainText("3步后轰炸",{timeout:60000});
 expect(await page.locator(".bombardment-zones polygon").count()).toBeGreaterThanOrEqual(6);
 expect(await page.locator(".bombardment-border").count()).toBeGreaterThan(0);
 const fill=await page.locator(".bombardment-center").evaluate(el=>getComputedStyle(el).fill);
 expect(fill).toContain("255");
 await page.screenshot({path:"test-results/artillery-warning.png",fullPage:true});
});
