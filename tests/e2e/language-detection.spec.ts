import { expect, test } from "@playwright/test";

test("页面无语言选择且自动检测英语并固定输出中文", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEST_PCM_FRAMES__: number[][] }).__TEST_PCM_FRAMES__ = [Array(640).fill(1)];
  });
  await page.goto("/");
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByTestId("detected-language")).toHaveText("en-US");
  await expect(page.locator('[lang="zh-CN"]')).toContainText("欢迎");
});
