import { expect, test } from "@playwright/test";

test("后续片段播放期间较早中文字幕已可见并保持语义顺序", async ({ page }) => {
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send;
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__ = 0;
    WebSocket.prototype.send = function (data) {
      if (data instanceof ArrayBuffer) {
        (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__++;
      }
      return send.call(this, data);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始翻译" }).click();
  const subtitles = page.locator('[data-testid="subtitle"]');
  await expect(subtitles).toHaveCount(1);
  await expect(subtitles.nth(0)).toContainText("欢迎");
  const framesWithFirstSubtitle = await page.evaluate(() =>
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__);
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__)).toBeGreaterThan(framesWithFirstSubtitle);
  await expect(subtitles).toHaveCount(2);
  await expect(subtitles.nth(1)).toContainText("讨论");
  await expect(page.getByTestId("evidence")).toContainText("test-double:speech-1");
  await page.getByRole("button", { name: "停止翻译" }).click();
});
