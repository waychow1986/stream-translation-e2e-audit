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

test("continuous English records independent 6/5/3 second timing boundaries", async ({ page }) => {
  test.setTimeout(25_000);
  await installDriver(page, "continuousEnglish");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();

  const draftUpdates: Array<{ text: string; at: number }> = [];
  for (const text of ["持续草稿一", "持续草稿二", "持续草稿三", "持续草稿四", "持续草稿五"]) {
    await expect(page.locator('[data-caption-state="draft"]')).toHaveText(text);
    draftUpdates.push({ text, at: await page.evaluate(() => performance.now()) });
  }
  await expect(page.locator('[data-caption-state="fixed"]')).toHaveText("持续英文完整译文");
  const fixedAt = await page.evaluate(() => performance.now());
  const timeline = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __CAPTION_PROTOCOL_TIMELINE__: Array<{ type: "speech-start" | "interim" | "final"; at: number }>;
        }
      ).__CAPTION_PROTOCOL_TIMELINE__
  );
  const speechStartedAt = timeline.find(({ type }) => type === "speech-start")?.at;
  const finalAt = timeline.find(({ type }) => type === "final")?.at;

  expect(speechStartedAt).toBeDefined();
  expect(finalAt).toBeDefined();
  const firstDraftAt = draftUpdates[0]!.at;
  expect(finalAt! - speechStartedAt!).toBeGreaterThanOrEqual(15_000);
  expect(firstDraftAt - speechStartedAt!).toBeLessThan(6_000);
  for (let index = 1; index < draftUpdates.length; index += 1) {
    expect(draftUpdates[index]!.at - draftUpdates[index - 1]!.at).toBeLessThanOrEqual(5_000);
  }
  expect(draftUpdates.at(-1)!.at).toBeLessThan(finalAt!);
  expect(fixedAt - finalAt!).toBeLessThan(3_000);
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
