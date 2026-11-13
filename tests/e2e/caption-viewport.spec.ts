import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("caption viewport remains fixed and follows appended captions", async ({ page }) => {
  await installDriver(page, "many");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  const viewport = page.locator('[data-testid="caption-viewport"]');
  await expect(viewport.locator('[data-caption-state="fixed"]')).toHaveCount(12);
  const dimensions = await viewport.evaluate((element) => ({
    height: element.clientHeight,
    atBottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  }));
  expect(dimensions.height).toBeLessThanOrEqual(321);
  expect(dimensions.atBottom).toBe(true);
});
