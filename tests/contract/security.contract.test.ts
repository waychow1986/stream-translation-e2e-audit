import { describe, expect, it } from "vitest";
import { redactLogValue } from "../../src/server/logger.js";
import { isAllowedOrigin, securityHeaders } from "../../src/server/security.js";

describe("security boundary", () => {
  it("allows only the current origin and installs restrictive headers", () => {
    expect(isAllowedOrigin("https://meeting.example", "meeting.example")).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "meeting.example")).toBe(false);
    expect(securityHeaders["content-security-policy"]).toContain("default-src 'self'");
    expect(securityHeaders["x-frame-options"]).toBe("DENY");
  });

  it("redacts meeting content and credential-shaped fields", () => {
    expect(redactLogValue({
      text: "meeting words",
      token: "secret",
      status: "failed"
    })).toEqual({ text: "[REDACTED]", token: "[REDACTED]", status: "failed" });
  });
});
