import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("password-reset transport config", () => {
  const resendTestKey = `re_${"unit_test_key"}`;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers SMTP_URL when it is set", async () => {
    vi.doMock("../config/env.js", () => ({
      env: {
        SMTP_URL: "smtps://custom-user:custom-pass@example.com:465",
        RESEND_API_KEY: resendTestKey,
        APP_PUBLIC_URL: "https://streamshogun.com",
        CORS_ORIGIN: "https://streamshogun.com",
        SUPPORT_EMAIL: "support@streamshogun.com",
        EMAIL_FROM: undefined,
        NODE_ENV: "development",
      },
    }));

    const { resolvedSmtpUrl, isEmailConfigured } = await import("./password-reset.js");
    expect(resolvedSmtpUrl()).toBe("smtps://custom-user:custom-pass@example.com:465");
    expect(isEmailConfigured()).toBe(true);
  });

  it("treats RESEND_API_KEY as a valid email configuration without SMTP", async () => {
    vi.doMock("../config/env.js", () => ({
      env: {
        SMTP_URL: undefined,
        RESEND_API_KEY: resendTestKey,
        APP_PUBLIC_URL: "https://streamshogun.com",
        CORS_ORIGIN: "https://streamshogun.com",
        SUPPORT_EMAIL: "support@streamshogun.com",
        EMAIL_FROM: undefined,
        NODE_ENV: "development",
      },
    }));

    const { resolvedSmtpUrl, isEmailConfigured } = await import("./password-reset.js");
    expect(resolvedSmtpUrl()).toBeNull();
    expect(isEmailConfigured()).toBe(true);
  });

  it("returns null when no email transport config exists", async () => {
    vi.doMock("../config/env.js", () => ({
      env: {
        SMTP_URL: undefined,
        RESEND_API_KEY: undefined,
        APP_PUBLIC_URL: "https://streamshogun.com",
        CORS_ORIGIN: "https://streamshogun.com",
        SUPPORT_EMAIL: "support@streamshogun.com",
        EMAIL_FROM: undefined,
        NODE_ENV: "development",
      },
    }));

    const { resolvedSmtpUrl, isEmailConfigured } = await import("./password-reset.js");
    expect(resolvedSmtpUrl()).toBeNull();
    expect(isEmailConfigured()).toBe(false);
  });

  it("uses the Resend HTTP API when RESEND_API_KEY is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.doMock("../config/env.js", () => ({
      env: {
        SMTP_URL: undefined,
        RESEND_API_KEY: resendTestKey,
        APP_PUBLIC_URL: "https://streamshogun.com",
        CORS_ORIGIN: "https://streamshogun.com",
        SUPPORT_EMAIL: "support@streamshogun.com",
        EMAIL_FROM: "StreamShogun <no-reply@streamshogun.com>",
        NODE_ENV: "production",
      },
    }));

    const { deliverPasswordResetEmail } = await import("./password-reset.js");
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const result = await deliverPasswordResetEmail(
      {
        to: "user@example.com",
        displayName: "Colin",
        resetUrl: "https://streamshogun.com/reset-password?token=abc",
      },
      logger,
    );

    expect(result).toEqual({ delivered: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${resendTestKey}`,
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"reply_to":"support@streamshogun.com"');
  });
});
