import { expect, test } from "@playwright/test";

test("用户手动开始后逐帧上传，发言结束前进入字幕流程并停止采集", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEST_PCM_FRAMES__: number[][] }).__TEST_PCM_FRAMES__ = [
      Array(640).fill(1),
      Array(640).fill(2)
    ];
  });
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("尚未开始");
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByText("欢迎参加本次会议。")).toBeVisible();
  await expect(page.getByTestId("status")).toHaveText("正在聆听");
  await page.getByRole("button", { name: "停止翻译" }).click();
  await expect(page.getByTestId("status")).toHaveText("已停止");
});
