import { describe, it, expect } from "vitest";
import { redactSensitiveInfo, redactMessages } from "../support-redaction";

// ── redactSensitiveInfo ──────────────────────────────────────────────

describe("redactSensitiveInfo", () => {
  it("redacts JWT tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactSensitiveInfo(`Token: ${jwt}`)).toBe("Token: [REDACTED_TOKEN]");
  });

  it("redacts Bearer tokens", () => {
    expect(redactSensitiveInfo("Authorization: Bearer abc123def456xyz789"))
      .toBe("Authorization: Bearer [REDACTED_TOKEN]");
  });

  it("redacts Stripe secret keys", () => {
    expect(redactSensitiveInfo("key: sk_test_abc123def456xyz789012"))
      .toBe("key: [REDACTED_KEY]");
  });

  it("redacts Stripe publishable keys", () => {
    expect(redactSensitiveInfo("key: pk_live_abc123def456xyz789012"))
      .toBe("key: [REDACTED_KEY]");
  });

  it("redacts Stripe restricted keys", () => {
    expect(redactSensitiveInfo("key: rk_test_abc123def456xyz789012"))
      .toBe("key: [REDACTED_KEY]");
  });

  it("redacts generic API keys", () => {
    expect(redactSensitiveInfo("The key_abcdefgh12345 is used here"))
      .toBe("The [REDACTED_KEY] is used here");
  });

  it("redacts PostgreSQL connection strings", () => {
    expect(redactSensitiveInfo("DATABASE_URL=postgresql://user:pass@host:5432/db"))
      .toBe("[REDACTED_ENV]");
  });

  it("redacts MySQL connection strings", () => {
    expect(redactSensitiveInfo("mysql://admin:secret@db.example.com:3306/mydb"))
      .toBe("[REDACTED_DB_URL]");
  });

  it("redacts MongoDB connection strings", () => {
    expect(redactSensitiveInfo("mongodb://user:pass@cluster.mongodb.net/dbname"))
      .toBe("[REDACTED_DB_URL]");
  });

  it("redacts Redis connection strings", () => {
    expect(redactSensitiveInfo("redis://default:secret@redis.example.com:6379"))
      .toBe("[REDACTED_DB_URL]");
  });

  it("redacts email addresses", () => {
    expect(redactSensitiveInfo("Contact john.doe@example.com for help"))
      .toBe("Contact [REDACTED_EMAIL] for help");
  });

  it("redacts URLs with auth query params", () => {
    const url = "https://api.example.com/data?token=abc123secretvalue&other=safe";
    const result = redactSensitiveInfo(url);
    // The auth-URL pattern captures up to the sensitive param value; the trailing
    // &other=safe is left behind. The general long-URL pattern may or may not
    // consume the whole thing depending on length, but the sensitive part is gone.
    expect(result).not.toContain("abc123secretvalue");
    expect(result).toContain("[REDACTED_URL]");
  });

  it("redacts URLs with password params", () => {
    const url = "https://example.com?password=super_secret_123";
    expect(redactSensitiveInfo(url)).toBe("[REDACTED_URL]");
  });

  it("redacts long general URLs", () => {
    const url = "https://cdn.example.com/path/to/some/very/long/resource/file.ts";
    expect(redactSensitiveInfo(url)).toBe("[REDACTED_URL]");
  });

  it("preserves short URLs", () => {
    const url = "https://x.co/ab";
    expect(redactSensitiveInfo(url)).toBe(url);
  });

  it("redacts Windows user paths", () => {
    expect(redactSensitiveInfo("Path: C:\\Users\\JohnDoe\\Documents"))
      .toBe("Path: [REDACTED_PATH]\\Documents");
  });

  it("redacts Unix home paths", () => {
    expect(redactSensitiveInfo("Path: /home/johndoe/.config"))
      .toBe("Path: [REDACTED_PATH]/.config");
  });

  it("redacts macOS user paths", () => {
    expect(redactSensitiveInfo("Path: /Users/johndoe/.config"))
      .toBe("Path: [REDACTED_PATH]/.config");
  });

  it("redacts environment variable assignments", () => {
    expect(redactSensitiveInfo("Set API_KEY=sk_12345 in .env"))
      .toBe("Set [REDACTED_ENV] in .env");
  });

  it("handles text with no sensitive data", () => {
    const safe = "I'm having trouble with playback buffering.";
    expect(redactSensitiveInfo(safe)).toBe(safe);
  });

  it("handles multiple patterns in the same text", () => {
    const text = "Token: eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoiMSJ9.signature and email: test@example.com";
    const result = redactSensitiveInfo(text);
    expect(result).toContain("[REDACTED_TOKEN]");
    expect(result).toContain("[REDACTED_EMAIL]");
    expect(result).not.toContain("eyJ");
    expect(result).not.toContain("test@example.com");
  });

  it("handles empty string", () => {
    expect(redactSensitiveInfo("")).toBe("");
  });
});

// ── redactMessages ───────────────────────────────────────────────────

describe("redactMessages", () => {
  it("redacts all messages in the array", () => {
    const messages = [
      { role: "user", text: "My email is user@example.com" },
      { role: "assistant", text: "No sensitive data here." },
    ];
    const redacted = redactMessages(messages);
    expect(redacted[0].text).toBe("My email is [REDACTED_EMAIL]");
    expect(redacted[1].text).toBe("No sensitive data here.");
  });

  it("preserves message roles", () => {
    const messages = [
      { role: "user", text: "sk_test_abc1234567890" },
    ];
    const redacted = redactMessages(messages);
    expect(redacted[0].role).toBe("user");
  });

  it("returns new array without mutating original", () => {
    const messages = [{ role: "user", text: "user@test.com" }];
    const redacted = redactMessages(messages);
    expect(messages[0].text).toBe("user@test.com");
    expect(redacted[0].text).toBe("[REDACTED_EMAIL]");
  });

  it("handles empty array", () => {
    expect(redactMessages([])).toEqual([]);
  });
});
