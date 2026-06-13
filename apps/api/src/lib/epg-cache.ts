// ── In-memory LRU cache for EPG proxy ─────────────────────────────
// Keyed by SHA-256 hash of the URL (never stores raw URLs).

import { createHash } from "node:crypto";

export interface CacheEntry {
  xml: string;
  etag: string;
  fetchedAt: number; // epoch ms
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_MAX_ENTRIES = 200;

export class EpgCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  /** Hash a URL to a cache key (never store raw URLs). */
  static hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }

  /** Generate an ETag from XML content. */
  static etag(xml: string): string {
    return `"${createHash("md5").update(xml).digest("hex")}"`;
  }

  /** Get a cached entry if it exists and is not expired. */
  get(url: string): CacheEntry | null {
    const key = EpgCache.hashUrl(url);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    // LRU: move to end (Map insertion order)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  /** Store a cache entry. Evicts oldest if at capacity. */
  set(url: string, xml: string): CacheEntry {
    const key = EpgCache.hashUrl(url);
    const entry: CacheEntry = {
      xml,
      etag: EpgCache.etag(xml),
      fetchedAt: Date.now(),
    };

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, entry);
    return entry;
  }

  /** Check if a URL is cached (non-expired). */
  has(url: string): boolean {
    return this.get(url) !== null;
  }

  /** Clear all entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of entries (including possibly stale). */
  get size(): number {
    return this.cache.size;
  }
}

/** Singleton cache instance for the EPG proxy. */
export const epgCache = new EpgCache();
