import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("user starts a session and receives an updating draft before final", async ({ page }) => {
  await installDriver(page, "english");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="draft"]')).toContainText("你好");
});
