import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("English draft revises and final replaces it without changing older fixed content", async ({ page }) => {
  await installDriver(page, "english");
  await page.goto("/");
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="draft"]')).toHaveText("你好");
  const draftAt = await page.evaluate(() => performance.now());
  await expect(page.locator('[data-caption-state="draft"]')).toHaveText("你好世界草稿");
  await expect(page.locator('[data-caption-state="fixed"]')).toHaveText(["你好世界"]);
  const fixedAt = await page.evaluate(() => performance.now());
  expect(draftAt - startedAt).toBeLessThan(6_000);
  expect(fixedAt - draftAt).toBeLessThan(5_000);
  expect(fixedAt - draftAt).toBeLessThan(3_000);
});

test("an interleaved next segment waits for the previous final and appends with a new id", async ({ page }) => {
  await installDriver(page, "interleaved");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();

  const fixed = page.locator('[data-caption-state="fixed"]');
  await expect(fixed).toHaveText(["第一段", "第二段"]);
  await expect(fixed.nth(0)).toHaveAttribute("data-segment-id", "1");
  await expect(fixed.nth(1)).toHaveAttribute("data-segment-id", "2");
});

test("dependency failure stops the old session and recovery requires another user start", async ({ page }) => {
  const evidence = await installDriver(page, "recovery");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.getByRole("button", { name: "开始字幕" })).toBeVisible();
  await page.waitForTimeout(150);
  expect(evidence.translationRequests).toHaveLength(1);
  expect(evidence.stops).toBe(1);

  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="fixed"]')).toHaveText(["新会话"]);
  expect(evidence.translationRequests).toHaveLength(2);
});
