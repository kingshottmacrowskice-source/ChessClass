import { test, expect } from "@playwright/test";

/** 破坏棋子的瞬间，棋盘要明显震动。 */
test("destroying a piece rattles the board", async ({ page }) => {
  await page.goto("/#live");
  await expect(page.locator(".pixel-square")).toHaveCount(64);
  await expect(
    page.getByRole("button", { name: "预览吃子震动" }),
  ).toBeEnabled();
  await page.screenshot({ path: "test-results/board-shake-before.png" });
  // Click and watch the board's computed transform in one page-side run, no races.
  const samples = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("预览吃子震动"),
    ) as HTMLButtonElement;
    const el = document.querySelector(".board-perspective")!;
    const out: string[] = [];
    const until = performance.now() + 900;
    const tick = () => {
      out.push(getComputedStyle(el).transform);
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    btn.click();
    await new Promise((r) => setTimeout(r, 950));
    return out;
  });
  const shaken = samples
    .map((t) => /matrix\(([^)]+)\)/.exec(t)?.[1])
    .filter((m): m is string => !!m)
    .map((m) => m.split(",").map(Number))
    .filter((v) => Math.abs(v[4]) > 2 || Math.abs(v[5]) > 2);
  expect(shaken.length).toBeGreaterThan(3);
  // It rocks the board (rotation), not just a plain nudge.
  expect(
    shaken.some((v) => Math.abs(v[1]) > 0.002 || Math.abs(v[2]) > 0.002),
  ).toBe(true);
  // Best-effort snapshot mid-quake for eyeballing.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("预览吃子震动"),
    ) as HTMLButtonElement;
    btn.click();
  });
  await page.screenshot({ path: "test-results/board-shake-mid.png" });
});
