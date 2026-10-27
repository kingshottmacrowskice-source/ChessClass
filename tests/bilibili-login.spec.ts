import { test, expect } from "@playwright/test";

test("settings renders local QR, confirms login and clears it without exposing cookies", async ({
  page,
}) => {
  let configured = false,
    polls = 0,
    starts = 0;
  await page.route("**/api/live/bilibili?*", (route) =>
    route.fulfill({ json: { status: "等待弹幕", messages: [] } }),
  );
  await page.route("**/api/live/login**", (route) => {
    const url = new URL(route.request().url());
    const session = {
      id: "local-session",
      qrUrl: "https://passport.bilibili.com/qr/test",
      expiresAt: Date.now() + 180000,
    };
    if (url.pathname.endsWith("/qr")) {
      starts++;
      return route.fulfill({
        json: {
          ...session,
          status: "waiting_scan",
          message: "请用哔哩哔哩 App 扫码",
        },
      });
    }
    if (url.pathname.endsWith("/poll")) {
      polls++;
      configured = polls >= 2;
      return route.fulfill({
        json: configured
          ? {
              ...session,
              qrUrl: "",
              status: "confirmed",
              message: "登录成功，弹幕连接将自动更新",
            }
          : {
              ...session,
              status: "scanned",
              message: "已扫码，请在手机上确认登录",
            },
      });
    }
    if (url.pathname.endsWith("/logout")) configured = false;
    return route.fulfill({ json: { configured } });
  });
  await page.goto("/live-settings");
  const panel = page.getByRole("region", { name: "B站扫码登录" });
  await panel
    .getByRole("button", { name: "扫码登录 B站", exact: true })
    .click();
  await expect(panel.locator("svg")).toBeVisible();
  await expect(panel).toContainText("请在手机上确认登录");
  await expect(panel).toContainText("登录成功");
  await expect(panel.locator("svg")).toHaveCount(0);
  await expect(panel).toContainText("已保存 B站登录");
  await panel.getByRole("button", { name: "清除本机登录" }).click();
  await expect(panel).toContainText("尚未登录 B站");
  expect(starts).toBe(1);
  await page.screenshot({
    path: "test-results/bilibili-login.png",
    fullPage: true,
  });
});

test("cancelled QR disappears and polling stops", async ({ page }) => {
  let polls = 0,
    cancelled = false;
  await page.route("**/api/live/bilibili?*", (route) =>
    route.fulfill({ json: { messages: [] } }),
  );
  await page.route("**/api/live/login**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/qr"))
      return route.fulfill({
        json: {
          id: "cancel-me",
          status: "waiting_scan",
          message: "等待扫码",
          qrUrl: "https://passport.bilibili.com/qr/test",
          expiresAt: Date.now() + 180000,
        },
      });
    if (path.endsWith("/poll")) polls++;
    if (path.endsWith("/cancel")) cancelled = true;
    return route.fulfill({ json: { configured: false } });
  });
  await page.goto("/live-settings");
  await page.getByRole("button", { name: "扫码登录 B站", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "B站扫码登录" }).locator("svg"),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消扫码" }).click();
  await expect.poll(() => cancelled).toBe(true);
  await page.waitForTimeout(2500);
  expect(polls).toBe(0);
});
