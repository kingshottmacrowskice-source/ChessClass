import { test, expect, type Page } from "@playwright/test";

/** Sample the stage's camera scale and the overlay phase every frame for `ms`. */
const film = (page: Page, button: string, ms: number) =>
  page.evaluate(
    async ({ button, ms }) => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes(button),
      ) as HTMLButtonElement;
      const stage = document.querySelector<HTMLElement>(".board-perspective")!;
      const out: { scale: number; rot: number; phase: string | null }[] = [];
      const until = performance.now() + ms;
      const tick = () => {
        const cs = getComputedStyle(stage);
        out.push({
          scale: cs.scale === "none" ? 1 : Number(cs.scale),
          rot: cs.rotate === "none" ? 0 : parseFloat(cs.rotate),
          phase: document.querySelector("[data-cinema]")?.getAttribute("data-phase") ?? null,
        });
        if (performance.now() < until) requestAnimationFrame(tick);
      };
      btn.click();
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, ms + 50));
      return out;
    },
    { button, ms },
  );

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/#live");
  await expect(page.locator(".pixel-square")).toHaveCount(64);
  await expect(page.locator("[data-piece-square]").first()).toBeVisible();
});

test("promotion close-up zooms in on the piece, swaps it, and hands the board back", async ({
  page,
}) => {
  const shotPromise = film(page, "预览升变运镜", 2200);
  // Mid-shot: the pawn has been lifted into the close-up cast and the real one hidden.
  await expect(page.locator(".cinema-pieces [data-role=hero]")).toBeVisible();
  const samples = await shotPromise;
  await page.screenshot({ path: "test-results/cinema-promotion-mid.png" });
  expect(Math.max(...samples.map((s) => s.scale))).toBeGreaterThan(1.8);
  expect(samples.some((s) => Math.abs(s.rot) > 3)).toBe(true);
  expect(samples.map((s) => s.phase)).toEqual(expect.arrayContaining(["focus", "ascend"]));
  await expect(page.locator(".cinema-pieces")).toHaveAttribute("data-swapped", "true");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/cinema-promotion-reveal.png" });
  // When it ends, the camera is gone and every piece is back on the board.
  await expect(page.locator("[data-cinema]")).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator(".board-perspective")).not.toHaveClass(/camera-on/);
  const scale = await page
    .locator(".board-perspective")
    .evaluate((el) => getComputedStyle(el).scale);
  expect(["none", "1"]).toContain(scale);
  await expect(page.locator("[data-piece-square]")).toHaveCount(32);
});

test("checkmate face-off strobes black and white, then cuts the king in two", async ({
  page,
}) => {
  const samples = await film(page, "预览将死运镜", 3900);
  expect(samples.map((s) => s.phase)).toEqual(
    expect.arrayContaining(["confront", "strobe", "kill"]),
  );
  expect(Math.max(...samples.map((s) => s.scale))).toBeGreaterThan(1.3);
  await expect(page.locator(".cinema-pieces")).toHaveAttribute("data-slain", "true");
  await page.screenshot({ path: "test-results/cinema-checkmate-kill.png" });
  await expect(page.locator("[data-cinema]")).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator("[data-piece-square]")).toHaveCount(32);
});

test("skipping mid-shot restores the camera at once", async ({ page }) => {
  await page.getByRole("button", { name: "预览将死运镜" }).click();
  await expect(page.locator(".board-perspective")).toHaveClass(/camera-on/);
  await page.getByRole("button", { name: "跳过大招" }).click();
  await expect(page.locator("[data-cinema]")).toHaveCount(0);
  await expect(page.locator(".board-perspective")).not.toHaveClass(/camera-on/);
  await expect(page.locator("[data-piece-square]")).toHaveCount(32);
});
