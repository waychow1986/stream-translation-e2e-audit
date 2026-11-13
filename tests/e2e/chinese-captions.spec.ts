import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("Chinese recognition displays original text and fixes it without translation", async ({ page }) => {
  const evidence = await installDriver(page, "chinese");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="draft"]')).toHaveText("你好");
  await expect(page.locator('[data-caption-state="draft"]')).toHaveText("你好世界");
  await expect(page.locator('[data-caption-state="fixed"]')).toHaveText(["你好世界"]);
  expect(evidence.translationRequests).toHaveLength(0);
});
