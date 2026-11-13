import type { Page } from "@playwright/test";

export async function installDriver(page: Page, scenario: "english" | "chinese" | "many") {
  await page.addInitScript((selected) => {
    Object.defineProperty(window, "__CAPTION_TEST_SCENARIO__", { value: selected });
  }, scenario);
}
