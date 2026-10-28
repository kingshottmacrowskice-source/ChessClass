import { HOME } from "../src/live/camera";
import { test, expect, type Page } from "@playwright/test";
const film = (page: Page, button: string, ms: number) =>
  page.evaluate(
    async ({ button, ms }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".three-board")!;
      const out: {
        elevation: number;
        azimuth: number;
        distance: number;
        phase: string | null;
        scale: string;
      }[] = [];
      const until = performance.now() + ms;
      const tick = () => {
        out.push({
          elevation: Number(canvas.dataset.elevation),
          azimuth: Number(canvas.dataset.azimuth),
          distance: Number(canvas.dataset.distance),
          phase:
            document
              .querySelector("[data-cinema]")
              ?.getAttribute("data-phase") ?? null,
          scale: getComputedStyle(canvas.parentElement!).scale,
        });
        if (performance.now() < until) requestAnimationFrame(tick);
      };
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes(button))!
        .click();
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, ms + 50));
      return out;
    },
    { button, ms },
  );
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/#live");
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-piece-count",
    "32",
  );
});
test("promotion lowers and orbits a real camera, then restores the overview", async ({
  page,
}) => {
  const samples = await film(page, "预览升变运镜", 2600);
  await page.screenshot({ path: "test-results/3d-promotion.png" });
  expect(Math.min(...samples.map((s) => s.elevation))).toBeLessThan(0.2);
  expect(Math.max(...samples.map((s) => Math.abs(s.azimuth)))).toBeGreaterThan(
    1.2,
  );
  expect(Math.min(...samples.map((s) => s.distance))).toBeLessThan(3.5);
  expect(samples.every((s) => ["none", "1"].includes(s.scale))).toBe(true);
  await expect(page.locator("[data-cinema]")).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-elevation",
    String(HOME.elevation),
  );
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-piece-count",
    "32",
  );
});
test("checkmate uses a low side view and restores its cast", async ({
  page,
}) => {
  const samples = await film(page, "预览将死运镜", 3800);
  await page.screenshot({ path: "test-results/3d-checkmate.png" });
  expect(samples.map((s) => s.phase)).toEqual(
    expect.arrayContaining(["confront", "strobe", "kill"]),
  );
  expect(Math.min(...samples.map((s) => s.elevation))).toBeLessThan(0.2);
  await expect(page.locator("[data-cinema]")).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-distance",
    "14.3",
  );
});
test("skip restores the 3D camera immediately and can replay", async ({
  page,
}) => {
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "预览将死运镜" }).click();
    await expect(page.locator(".board-perspective")).toHaveClass(/camera-on/);
    await page.getByRole("button", { name: "跳过大招" }).click();
    await expect(page.locator("[data-cinema]")).toHaveCount(0);
    await expect(page.locator(".board-perspective")).not.toHaveClass(
      /camera-on/,
    );
    await expect(page.locator(".three-board")).toHaveAttribute(
      "data-distance",
      "14.3",
    );
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/3d-overview.png" });
});
test("reduced motion keeps the overview", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "预览升变运镜" }).click();
  await expect(page.locator("[data-cinema]")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".three-board")).toHaveAttribute(
    "data-distance",
    "14.3",
  );
});
