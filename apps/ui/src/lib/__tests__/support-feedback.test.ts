import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportFeedback } from "@stream-shogun/core";
import { loadFeedback, saveFeedback, sendFeedbackToApi } from "../support-feedback";

// localStorage does not exist in the node test env; stub an in-memory one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

function entry(id: string): SupportFeedback {
  return {
    messageId: id,
    rating: "up",
    comment: `comment-${id}`,
    articleIds: ["a1"],
    appVersion: "0.2.1",
    timestamp: "2026-10-19T00:00:00.000Z",
  };
}

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  // Re-stub localStorage (unstubAllGlobals clears it).
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("local feedback persistence", () => {
  it("returns [] for empty or corrupt storage", () => {
    expect(loadFeedback()).toEqual([]);
    store.set("support_feedback", "{corrupt");
    expect(loadFeedback()).toEqual([]);
  });

  it("appends entries and keeps only the latest 100", () => {
    for (let i = 0; i < 100; i++) saveFeedback(entry(`m${i}`));
    expect(loadFeedback()).toHaveLength(100);

    saveFeedback(entry("m-new"));
    const all = loadFeedback();
    expect(all).toHaveLength(100);
    expect(all.at(-1)?.messageId).toBe("m-new");
    expect(all[0]?.messageId).toBe("m1"); // m0 evicted
  });
});

describe("sendFeedbackToApi", () => {
  it("posts only the whitelisted fields to the feedback endpoint", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendFeedbackToApi(entry("m1"), "https://api.test");

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/v1/support/feedback");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "appVersion",
      "articleIds",
      "comment",
      "messageId",
      "rating",
    ]);
    expect(body.timestamp).toBeUndefined(); // local-only field never leaves
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("attaches the Bearer token when one is provided", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendFeedbackToApi(entry("m1"), "https://api.test", "token-123");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("reports failure for non-OK responses and network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 })),
    );
    expect(await sendFeedbackToApi(entry("m1"), "https://api.test")).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await sendFeedbackToApi(entry("m1"), "https://api.test")).toBe(false);
  });
});
