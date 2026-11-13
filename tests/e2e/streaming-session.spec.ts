import { expect, test } from "@playwright/test";
import { installDriver } from "./support/fake-driver.ts";

test("user starts a session and receives an updating draft before final", async ({ page }) => {
  await installDriver(page, "english");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect(page.locator('[data-caption-state="draft"]')).toContainText("你好");
});

test("the protocol adapter receives token refresh and is stopped on user stop and unload", async ({ page }) => {
  const evidence = await installDriver(page, "lifecycle");
  await page.goto("/");
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect.poll(() => evidence.tokenUpdates).toEqual(["token-2"]);

  await page.getByRole("button", { name: "停止字幕" }).click();
  await expect.poll(() => evidence.stops).toBe(1);
  await page.getByRole("button", { name: "开始字幕" }).click();
  await expect.poll(() => evidence.starts).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => evidence.stops).toBe(2);
});
