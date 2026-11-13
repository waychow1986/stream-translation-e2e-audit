import { expect, test } from "@playwright/test";

test("用户手动开始后逐帧上传，发言结束前进入字幕流程并停止采集", async ({ page }) => {
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
  await expect(page.getByTestId("status")).toHaveText("尚未开始");
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByText("欢迎参加本次会议。")).toBeVisible();
  const framesBefore = await page.evaluate(() =>
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__);
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__)).toBeGreaterThan(framesBefore);
  await expect(page.getByTestId("status")).toHaveText("正在聆听");
  await page.getByRole("button", { name: "停止翻译" }).click();
  await expect(page.getByTestId("status")).toHaveText("已停止");
  const framesAfterStop = await page.evaluate(() =>
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() =>
    (window as unknown as { __TEST_AUDIO_FRAME_COUNT__: number }).__TEST_AUDIO_FRAME_COUNT__)).toBe(framesAfterStop);
});
