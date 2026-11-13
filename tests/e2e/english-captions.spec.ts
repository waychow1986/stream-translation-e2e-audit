import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("English draft revises and final replaces it without changing older fixed content", async ({ page }) => {
  await installDriver(page, "english");
  await page.goto("/");
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="draft"]')).toContainText("你好");
  const draftAt = await page.evaluate(() => performance.now());
  await expect(page.locator('[data-caption-state="fixed"]')).toHaveText(["你好世界"]);
  const fixedAt = await page.evaluate(() => performance.now());
  expect(draftAt - startedAt).toBeLessThan(6_000);
  expect(fixedAt - draftAt).toBeLessThan(5_000);
  expect(fixedAt - draftAt).toBeLessThan(3_000);
});
