import { test, expect } from "@playwright/test";
for (const chance of [0, 100])
  test(`demon mode at ${chance}% works with Stockfish blocked`, async ({
    page,
  }) => {
    const moves: any[] = [];
    const engineRequests: string[] = [];
    await page.route("**/engine/**", (route) => {
      engineRequests.push(route.request().url());
      return route.abort();
    });
    await page.route("**/api/live/settings", (route) =>
      route.fulfill({
        json: {
          settings: {
            ai: false,
            autoConnect: false,
            demonMode: true,
            demonChance: chance,
            demonBehaviorWeights: {
              destroy: 1,
              movement: 1,
              item: 0,
              skill: 0,
            },
            depth: 1,
          },
        },
      }),
    );
    await page.route("**/api/live/log", (route) => {
      const entry = route.request().postDataJSON();
      if (entry.type === "move") moves.push(entry);
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/#live");
    await page.getByLabel("测试弹幕").fill("e4");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(
        () =>
          moves.find(
            (m) =>
              m.side === "黑(大肥鱼)" ||
              ["destroy", "movement", "item", "skill"].includes(m.special),
          ),
        { timeout: 60000 },
      )
      .toBeTruthy();
    // Combat, bombardment and passive events are logged as move entries too.
    const special = moves.find((m) =>
      ["destroy", "movement", "item", "skill"].includes(m.special),
    );
    if (chance === 100) {
      expect(special).toBeTruthy();
      expect(["destroy", "movement"]).toContain(special.special);
      expect(special.after.split(" ")[1]).toBe("w");
    } else expect(special).toBeUndefined();
    expect(engineRequests).toEqual([]);
    await expect(
      page.getByText("等待观众", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/引擎或动画失败/)).toHaveCount(0);
  });
