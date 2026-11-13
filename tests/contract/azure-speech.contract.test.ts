import { describe, expect, it } from "vitest";
import {
  buildSpeechAuthorizationToken,
  isSupportedEnglish,
  nextRefreshDelay
} from "../../src/server/adapters/azure-speech.js";

describe("Azure Speech contract", () => {
  it("constructs complete Entra authorization and accepts English only", () => {
    expect(buildSpeechAuthorizationToken("/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a", "token"))
      .toBe("aad#/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a#token");
    expect(isSupportedEnglish("en-US")).toBe(true);
    expect(isSupportedEnglish("zh-CN")).toBe(false);
  });

  it("refreshes before expiry and rejects malformed resource IDs", () => {
    expect(nextRefreshDelay(1_000_000, 100_000)).toBe(600_000);
    expect(() => buildSpeechAuthorizationToken("bad", "token")).toThrow();
  });
});
