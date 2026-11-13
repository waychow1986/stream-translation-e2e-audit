import { expect, test } from "@playwright/test";

test("后续片段播放期间较早中文字幕已可见并保持语义顺序", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEST_PCM_FRAMES__: number[][] }).__TEST_PCM_FRAMES__ = [
      Array(640).fill(1),
      Array(640).fill(2)
    ];
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始翻译" }).click();
  const subtitles = page.locator('[data-testid="subtitle"]');
  await expect(subtitles).toHaveCount(2);
  await expect(subtitles.nth(0)).toContainText("欢迎");
  await expect(subtitles.nth(1)).toContainText("讨论");
  await expect(page.getByTestId("evidence")).toContainText("test-double:speech-1");
});
