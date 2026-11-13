import { expect, test } from "@playwright/test";

test("页面加载和 test-double evidence 不会被应用标记为完整验收", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("acceptance")).toHaveAttribute("data-complete", "false");
  await page.getByRole("button", { name: "开始翻译" }).click();
  await expect(page.getByTestId("acceptance")).toHaveAttribute("data-complete", "false");
  await page.getByRole("button", { name: "停止翻译" }).click();
});

for (const scenario of [
  { name: "仅原文", first: "Welcome to the meeting.", second: "We will discuss the project.", expected: /Welcome/ },
  { name: "非中文", first: "Hello.", second: "Project.", expected: /Hello/ },
  { name: "语义不对应", first: "今天天气晴朗。", second: "明天可能下雨。", expected: /天气/ }
]) {
  test(`应用实际显示${scenario.name}时反向场景可观察为失败`, async ({ page }) => {
    await rewriteSubtitleStream(page, ({ type, segmentId, revision }) => ({
      type,
      segmentId,
      revision,
      ...(type === "subtitle.delta"
        ? { textDelta: segmentId === 1 ? scenario.first : scenario.second }
        : { text: segmentId === 1 ? scenario.first : scenario.second }),
      targetLanguage: "zh-CN"
    }));
    await page.goto("/");
    await page.getByRole("button", { name: "开始翻译" }).click();
    await expect(page.getByRole("region", { name: "中文字幕" })).toContainText(scenario.expected);
    await expect(page.getByTestId("acceptance")).toHaveAttribute("data-complete", "false");
    await page.getByRole("button", { name: "停止翻译" }).click();
  });
}

test("应用实际显示乱序字幕时反向场景可观察为失败", async ({ page }) => {
  await rewriteSubtitleStream(page, (event) => ({
    ...event,
    segmentId: event.segmentId === 1 ? 2 : 1
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "开始翻译" }).click();
  const subtitles = page.getByTestId("subtitle");
  await expect(subtitles).toHaveCount(2);
  await expect(subtitles.nth(0)).toContainText("讨论");
  await expect(subtitles.nth(1)).toContainText("欢迎");
  await page.getByRole("button", { name: "停止翻译" }).click();
});

test("应用仅在输入停止后批量显示字幕时反向场景可观察为失败", async ({ page }) => {
  await rewriteSubtitleStream(page, (event) => event, true);
  await page.goto("/");
  await page.getByRole("button", { name: "开始翻译" }).click();
  await page.waitForTimeout(2_500);
  await expect(page.getByTestId("subtitle")).toHaveCount(0);
  await page.getByRole("button", { name: "停止翻译" }).click();
  await expect(page.getByTestId("subtitle")).toHaveCount(2);
});

type SubtitleEvent = {
  type: "subtitle.delta" | "subtitle.final";
  segmentId: number;
  revision: number;
  textDelta?: string;
  text?: string;
  targetLanguage: "zh-CN";
};

async function rewriteSubtitleStream(
  page: import("@playwright/test").Page,
  rewrite: (event: SubtitleEvent) => SubtitleEvent,
  batch = false
): Promise<void> {
  await page.routeWebSocket(/\/ws\/translation$/, (webSocket) => {
    const server = webSocket.connectToServer();
    const buffered: string[] = [];
    webSocket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (typeof message !== "string") {
        webSocket.send(message);
        return;
      }
      const event = JSON.parse(message) as { type: string };
      if (event.type === "subtitle.delta" || event.type === "subtitle.final") {
        const transformed = JSON.stringify(rewrite(event as SubtitleEvent));
        if (batch) buffered.push(transformed);
        else webSocket.send(transformed);
        return;
      }
      if (event.type === "session.stopped" && batch) {
        for (const item of buffered) webSocket.send(item);
      }
      webSocket.send(message);
    });
  });
}
