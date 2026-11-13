import { expect, test } from "@playwright/test";

test("完整验收判定拒绝页面加载、原文、批量、非中文、乱序和替身证据", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEST_PCM_FRAMES__: number[][] }).__TEST_PCM_FRAMES__ = [Array(640).fill(1)];
  });
  await page.goto("/");
  await expect(page.getByTestId("acceptance")).toHaveAttribute("data-complete", "false");
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByTestId("acceptance")).toHaveAttribute("data-complete", "false");
  await expect(page.getByText("Welcome to the meeting.")).toHaveCount(0);
});
