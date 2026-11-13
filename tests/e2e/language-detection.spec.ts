import { expect, test } from "@playwright/test";

test("页面无语言选择且自动检测英语并固定输出中文", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByTestId("detected-language")).toHaveText("en-US");
  await expect(page.getByRole("region", { name: "中文字幕" })).toContainText("欢迎");
});

test("非英语语音不进入翻译", async ({ page }) => {
  await page.routeWebSocket(/\/ws\/translation$/, (webSocket) => {
    webSocket.onMessage((message) => {
      if (typeof message === "string" && JSON.parse(message).type === "start") {
        webSocket.send(JSON.stringify({ type: "session.started", protocolVersion: 1, sessionId: "non-english" }));
        webSocket.send(JSON.stringify({ type: "speech.final", segmentId: 1, detectedLanguage: "zh-CN" }));
      }
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByTestId("detected-language")).toHaveText("zh-CN");
  await expect(page.getByTestId("subtitle")).toHaveCount(0);
});
