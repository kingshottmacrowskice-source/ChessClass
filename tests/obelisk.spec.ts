import { test, expect } from "@playwright/test";
test("summons one four-cell giant and displays two shields",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 const moves:any[]=[];
 await page.route("**/api/live/settings",route=>route.fulfill({json:{settings:{
  autoConnect:false,ai:false,demonMode:true,demonChance:100,
  demonBehaviorWeights:{destroy:0,movement:0,item:1,skill:0},
  demonItemWeights:{"doom-shroom":0,"monster-reborn":0,"summon-cannon":0,"tingqiao-stone":0,"londinium-artillery":0,"summon-obelisk":1}
 }}}));
 await page.route("**/api/live/log",route=>{moves.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});});
 await page.goto("/#live");
 await page.getByLabel("测试弹幕").fill("e4");
 await page.getByRole("button",{name:"发送",exact:true}).click();
 await expect(page.getByLabel("欧贝利斯克 护盾2点")).toBeVisible({timeout:60000});
 const board=page.locator("canvas.three-board");
 await expect(board).toHaveAttribute("data-pieces",/:bo/);
 const summoned=moves.find(m=>m.item==="summon-obelisk");
 expect(summoned.sacrifices).toHaveLength(3);
 const giantCount=(await board.getAttribute("data-pieces"))!.split(" ").filter(s=>s.endsWith(":bo")).length;
 expect(giantCount).toBe(1);expect(errors).toEqual([]);
 await page.screenshot({path:"test-results/obelisk.png",fullPage:true});
});
