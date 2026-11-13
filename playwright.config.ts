import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    channel: "chromium",
    permissions: ["microphone"],
  },
  projects: [
    {
      name: "integration",
      testMatch: "integration/**/*.spec.ts",
    },
    {
      name: "functional",
      testMatch: "functional/**/*.spec.ts",
    },
    {
      name: "e2e",
      testMatch: "journeys/**/*.spec.ts",
    },
  ],
});
