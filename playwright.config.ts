import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && NODE_ENV=test APP_ADAPTER_MODE=deterministic PORT=3000 AIDELIVERY_DELIVERY_ID=local AIDELIVERY_CANDIDATE_SHA=local AZURE_CLIENT_ID=local AZURE_SPEECH_ENDPOINT=https://speech.example.com AZURE_SPEECH_RESOURCE_ID=/subscriptions/local/resourceGroups/local/providers/Microsoft.CognitiveServices/accounts/local AZURE_AI_PROJECT_ENDPOINT=https://project.example.com AZURE_AI_MODEL_DEPLOYMENT_NAME=gpt-sol-6.1 npm start",
    url: "http://127.0.0.1:3000/healthz",
    reuseExistingServer: false
  }
});
