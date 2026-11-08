import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  CLOUD_HISTORY_LIMIT,
  cloudSettingsSchema,
  cloudSyncPutSchema,
  registerSchema,
} from "@stream-shogun/shared";
import { validateBody } from "./validate.js";

describe("request validation contracts", () => {
  it("returns a readable HTTP 400 for invalid authentication input", async () => {
    const app = Fastify();
    app.post("/register", { preValidation: [validateBody(registerSchema)] }, async () => ({
      ok: true,
    }));
    const response = await app.inject({
      method: "POST",
      url: "/register",
      payload: { email: "invalid", password: "short" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Validation Error",
      message: "email: Invalid email; password: Password must be at least 8 characters",
    });
    await app.close();
  });

  it("preserves arbitrary cloud setting values and string-only sync settings", () => {
    const settings = { theme: "dark", enabled: true, nested: { volume: 50 }, empty: null };
    expect(cloudSettingsSchema.parse({ settings })).toEqual({ settings });
    const localUpdatedAt = "2026-11-08T00:00:00.000Z";
    expect(cloudSyncPutSchema.parse({ settings: { theme: "dark" }, localUpdatedAt })).toEqual({
      settings: { theme: "dark" },
      localUpdatedAt,
    });
    expect(
      cloudSyncPutSchema.safeParse({ settings: { enabled: true }, localUpdatedAt }).success,
    ).toBe(false);
  });

  it("keeps history defaults and enforces the collection limit", () => {
    const item = { channelUrl: "https://example.com/live", channelName: "Example", watchedAt: 1 };
    const localUpdatedAt = "2026-11-08T00:00:00.000Z";
    const history = Array.from({ length: CLOUD_HISTORY_LIMIT }, () => item);
    const parsed = cloudSyncPutSchema.parse({ history, localUpdatedAt });
    expect(parsed.history?.[0]).toEqual({ ...item, channelLogo: "", groupTitle: "" });
    expect(
      cloudSyncPutSchema.safeParse({ history: [...history, item], localUpdatedAt }).success,
    ).toBe(false);
    expect(cloudSyncPutSchema.safeParse({ localUpdatedAt: "yesterday" }).success).toBe(false);
    expect(cloudSyncPutSchema.parse({ localUpdatedAt })).toEqual({ localUpdatedAt });
  });
});
