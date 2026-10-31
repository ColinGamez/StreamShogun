import { describe, expect, it, vi } from "vitest";
import { EpgCache } from "./epg-cache";

const URL_A = "https://example.com/a.xml";
const URL_B = "https://example.com/b.xml";
const URL_C = "https://example.com/c.xml";

describe("EpgCache.hashUrl", () => {
  it("hashes URLs to sha256 hex and never stores raw URLs", () => {
    const key = EpgCache.hashUrl(URL_A);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("example.com");
  });

  it("is deterministic and URL-sensitive", () => {
    expect(EpgCache.hashUrl(URL_A)).toBe(EpgCache.hashUrl(URL_A));
    expect(EpgCache.hashUrl(URL_A)).not.toBe(EpgCache.hashUrl(URL_B));
  });
});

describe("EpgCache.etag", () => {
  it("produces a quoted md5 etag of the content", () => {
    const etag = EpgCache.etag("<tv/>");
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(EpgCache.etag("<tv/>")).toBe(etag);
    expect(EpgCache.etag("<tv></tv>")).not.toBe(etag);
  });
});

describe("EpgCache get/set", () => {
  it("returns null for unknown URLs and the entry after set", () => {
    const cache = new EpgCache();
    expect(cache.get(URL_A)).toBeNull();
    const entry = cache.set(URL_A, "<tv>a</tv>");
    expect(entry.xml).toBe("<tv>a</tv>");
    expect(entry.etag).toBe(EpgCache.etag("<tv>a</tv>"));
    expect(cache.get(URL_A)).toEqual(entry);
  });

  it("has() mirrors get() including expiry", () => {
    const cache = new EpgCache(1000);
    expect(cache.has(URL_A)).toBe(false);
    cache.set(URL_A, "<tv/>");
    expect(cache.has(URL_A)).toBe(true);
  });

  it("expires entries past the TTL and removes them", () => {
    vi.useFakeTimers();
    try {
      const cache = new EpgCache(1000);
      cache.set(URL_A, "<tv/>");
      vi.advanceTimersByTime(1001);
      expect(cache.get(URL_A)).toBeNull();
      expect(cache.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps entries within the TTL", () => {
    vi.useFakeTimers();
    try {
      const cache = new EpgCache(1000);
      cache.set(URL_A, "<tv/>");
      vi.advanceTimersByTime(999);
      expect(cache.get(URL_A)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the least-recently-used entry at capacity", () => {
    const cache = new EpgCache(60_000, 2);
    cache.set(URL_A, "a");
    cache.set(URL_B, "b");
    // Touch A so B becomes the LRU entry
    cache.get(URL_A);
    cache.set(URL_C, "c");

    expect(cache.get(URL_B)).toBeNull();
    expect(cache.get(URL_A)?.xml).toBe("a");
    expect(cache.get(URL_C)?.xml).toBe("c");
  });

  it("does not grow past capacity when overwriting an existing key", () => {
    const cache = new EpgCache(60_000, 2);
    cache.set(URL_A, "a1");
    cache.set(URL_B, "b");
    cache.set(URL_A, "a2");
    expect(cache.size).toBeLessThanOrEqual(2);
    expect(cache.get(URL_A)?.xml).toBe("a2");
  });

  it("clear() empties the cache", () => {
    const cache = new EpgCache();
    cache.set(URL_A, "a");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(URL_A)).toBeNull();
  });
});
