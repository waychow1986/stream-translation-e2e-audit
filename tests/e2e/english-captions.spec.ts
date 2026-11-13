import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("English draft revises and final replaces it without changing older fixed content", async ({ page }) => {
  await installDriver(page, "english");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="fixed"]')).toHaveText(["你好世界"]);
});
