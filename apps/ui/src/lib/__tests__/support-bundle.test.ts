// ── Support Bundle Tests ──────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { buildSupportBundle, bundleFilename } from "../support-bundle";
import type { BundleContext } from "../support-bundle";
import type { SupportChatMessage } from "@stream-shogun/core";

// ── Mock the codex search (same pattern used in support-engine tests) ─
vi.mock("../support-codex", () => ({
  searchSupport: vi.fn((query: string) => {
    if (query.includes("playlist")) {
      return [
        { id: "adding-playlist", title: "Adding a playlist", score: 20, snippet: "", headings: [], tags: [] },
        { id: "m3u-format", title: "M3U format", score: 10, snippet: "", headings: [], tags: [] },
      ];
    }
    return [];
  }),
  getSupportArticle: vi.fn(() => null),
  getSupportArticleCount: vi.fn(() => 11),
}));

function makeMsg(role: "user" | "assistant", text: string, id?: string): SupportChatMessage {
  return {
    id: id ?? `msg_${Date.now()}_${Math.random()}`,
    role,
    text,
    citations: role === "assistant" ? ["adding-playlist"] : undefined,
    timestamp: new Date().toISOString(),
  };
}

function baseCtx(overrides?: Partial<BundleContext>): BundleContext {
  return {
    appVersion: "0.1.0",
    os: "Windows",
    locale: "en",
    loggedIn: false,
    playlistCount: 3,
    epgSourceCount: 1,
    billingEnabled: false,
    messages: [],
    ...overrides,
  };
}

describe("buildSupportBundle", () => {
  // ── Shape ─────────────────────────────────────────────────────────

  it("returns all required top-level keys", () => {
    const bundle = buildSupportBundle(baseCtx());
    expect(bundle).toHaveProperty("generatedAt");
    expect(bundle).toHaveProperty("appVersion");
    expect(bundle).toHaveProperty("os");
    expect(bundle).toHaveProperty("locale");
    expect(bundle).toHaveProperty("auth");
    expect(bundle).toHaveProperty("counts");
    expect(bundle).toHaveProperty("billing");
    expect(bundle).toHaveProperty("recentMessages");
    expect(bundle).toHaveProperty("matchedGuideIds");
  });

  it("auth contains loggedIn boolean", () => {
    const bundle = buildSupportBundle(baseCtx({ loggedIn: true }));
    expect(bundle.auth).toEqual({ loggedIn: true });
  });

  it("counts contains playlists and epgSources", () => {
    const bundle = buildSupportBundle(baseCtx({ playlistCount: 5, epgSourceCount: 2 }));
    expect(bundle.counts).toEqual({ playlists: 5, epgSources: 2 });
  });

  it("billing disabled shows enabled=false without plan/status", () => {
    const bundle = buildSupportBundle(baseCtx());
    expect(bundle.billing.enabled).toBe(false);
    expect(bundle.billing.plan).toBeUndefined();
    expect(bundle.billing.status).toBeUndefined();
  });

  it("billing enabled shows plan and status", () => {
    const bundle = buildSupportBundle(
      baseCtx({ billingEnabled: true, billingPlan: "PRO", billingStatus: "ACTIVE" }),
    );
    expect(bundle.billing.enabled).toBe(true);
    expect(bundle.billing.plan).toBe("PRO");
    expect(bundle.billing.status).toBe("ACTIVE");
  });

  it("generatedAt is a valid ISO-8601 string", () => {
    const bundle = buildSupportBundle(baseCtx());
    expect(() => new Date(bundle.generatedAt)).not.toThrow();
    expect(new Date(bundle.generatedAt).toISOString()).toBe(bundle.generatedAt);
  });

  // ── Message slicing ───────────────────────────────────────────────

  it("includes at most 10 messages", () => {
    const msgs: SupportChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      msgs.push(makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`));
    }
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    expect(bundle.recentMessages.length).toBe(10);
  });

  it("takes the last 10 messages (not the first 10)", () => {
    const msgs: SupportChatMessage[] = [];
    for (let i = 0; i < 15; i++) {
      msgs.push(makeMsg("user", `msg-${i}`));
    }
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    // The first included should be msg-5 (index 5)
    expect(bundle.recentMessages[0].text).toContain("msg-5");
  });

  // ── Redaction ─────────────────────────────────────────────────────

  it("redacts email addresses in messages", () => {
    const msgs = [makeMsg("user", "My email is test@example.com")];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    expect(bundle.recentMessages[0].text).not.toContain("test@example.com");
    expect(bundle.recentMessages[0].text).toContain("[REDACTED_EMAIL]");
  });

  it("redacts JWT tokens in messages", () => {
    const msgs = [makeMsg("user", "token is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    expect(bundle.recentMessages[0].text).not.toContain("eyJ");
    expect(bundle.recentMessages[0].text).toContain("[REDACTED_TOKEN]");
  });

  it("redacts Stripe keys in messages", () => {
    const msgs = [makeMsg("user", "key is sk_test_abc1234567890xyz")];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    expect(bundle.recentMessages[0].text).not.toContain("sk_test_");
    expect(bundle.recentMessages[0].text).toContain("[REDACTED_KEY]");
  });

  it("redacts Windows user paths in messages", () => {
    const msgs = [makeMsg("user", "My path is C:\\Users\\John\\Documents\\file.m3u")];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    expect(bundle.recentMessages[0].text).not.toContain("John");
    expect(bundle.recentMessages[0].text).toContain("[REDACTED_PATH]");
  });

  // ── Matched guide IDs ────────────────────────────────────────────

  it("populates matchedGuideIds from the last user question", () => {
    const msgs = [
      makeMsg("user", "How do I add a playlist?"),
      makeMsg("assistant", "Here is how…"),
    ];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    expect(bundle.matchedGuideIds).toContain("adding-playlist");
    expect(bundle.matchedGuideIds).toContain("m3u-format");
  });

  it("returns empty matchedGuideIds when no user messages", () => {
    const bundle = buildSupportBundle(baseCtx({ messages: [] }));
    expect(bundle.matchedGuideIds).toEqual([]);
  });

  it("uses the LAST user message for guide matching", () => {
    const msgs = [
      makeMsg("user", "something without playlist"),
      makeMsg("assistant", "reply"),
      makeMsg("user", "How about my playlist?"),
      makeMsg("assistant", "another reply"),
    ];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    // "playlist" triggers the mock, so we should get guide IDs
    expect(bundle.matchedGuideIds.length).toBeGreaterThan(0);
  });

  // ── No tokens leak ───────────────────────────────────────────────

  it("bundle is JSON-serialisable", () => {
    const msgs = [makeMsg("user", "hello"), makeMsg("assistant", "hi")];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    const json = JSON.stringify(bundle);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("does not contain auth tokens anywhere in the serialised bundle", () => {
    const msgs = [makeMsg("user", "token Bearer eyJfakeToken.abc.xyz")];
    const bundle = buildSupportBundle(baseCtx({ messages: msgs }));
    const json = JSON.stringify(bundle);
    expect(json).not.toContain("eyJfake");
    expect(json).not.toContain("Bearer eyJ");
  });
});

describe("bundleFilename", () => {
  it("matches pattern support-bundle-YYYYMMDD-HHMM.json", () => {
    const d = new Date(2026, 2, 3, 14, 30, 0); // local: March 3, 14:30
    const name = bundleFilename(d);
    expect(name).toBe("support-bundle-20260303-1430.json");
  });

  it("pads single-digit months and hours", () => {
    const d = new Date(2026, 0, 5, 9, 5, 0); // local: Jan 5, 09:05
    const name = bundleFilename(d);
    expect(name).toBe("support-bundle-20260105-0905.json");
  });

  it("uses current time when no arg is given", () => {
    const name = bundleFilename();
    expect(name).toMatch(/^support-bundle-\d{8}-\d{4}\.json$/);
  });
});
