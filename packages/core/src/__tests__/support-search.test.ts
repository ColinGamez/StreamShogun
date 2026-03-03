import { describe, it, expect, beforeEach } from "vitest";
import { SupportCodexIndex } from "../support-search.js";
import { parseSupportArticles } from "../support-parser.js";


// ── Test fixtures ────────────────────────────────────────────────────

const RAW_ARTICLES = [
  `---
id: playback-troubleshooting
title: Playback Troubleshooting
tags: [playback, video, buffering, black-screen, audio]
lastUpdated: "2026-03-03"
summary: Fix common playback issues including black screens, buffering, and no audio.
---

# Playback Troubleshooting

## Black Screen

If you see a black screen, try these steps:

1. Check your internet connection
2. Verify the playlist URL is valid
3. Try a different channel

## Buffering

Buffering usually means slow network. Lower the quality setting.

## No Audio

Check that your system volume is not muted.
`,

  `---
id: adding-playlists
title: Adding Playlists
tags: [playlist, m3u, setup, getting-started]
lastUpdated: "2026-03-03"
summary: Learn how to add M3U and XSPF playlists to StreamShogun.
---

# Adding Playlists

## By URL

Paste the playlist URL in the library panel.

## By File

Drag and drop an M3U file into the library.

## Supported Formats

StreamShogun supports M3U, M3U8, and XSPF formats.
`,

  `---
id: epg-troubleshooting
title: EPG Troubleshooting
tags: [epg, xmltv, guide, schedule, troubleshooting]
lastUpdated: "2026-03-03"
summary: Resolve missing or incorrect EPG data issues.
---

# EPG Troubleshooting

## Missing EPG Data

Ensure you have added at least one EPG source.

## Unmatched Channels

Check that your channels have tvg-id attributes that match the EPG source.

## Wrong Times

EPG times may be offset. Check the timezone settings.
`,

  `---
id: subscriptions-billing
title: Subscriptions & Billing
tags: [billing, subscription, pro, stripe, payment]
lastUpdated: "2026-03-03"
summary: Manage your StreamShogun Pro subscription and billing details.
---

# Subscriptions & Billing

## Upgrade to Pro

Go to Settings → Account → Upgrade to unlock Pro features.

## Cancel Subscription

Visit the Stripe customer portal to cancel.

## Payment Methods

We accept all major credit cards via Stripe.
`,

  `---
id: getting-started
title: Getting Started
tags: [setup, install, first-run, basics]
lastUpdated: "2026-03-03"
summary: Get up and running with StreamShogun in minutes.
---

# Getting Started

## Installation

Download from the official website and run the installer.

## First Launch

On first launch, you'll see the empty library. Add a playlist to get started.

## Navigation

Use keyboard shortcuts Alt+1 through Alt+7 to navigate.
`,
];

function buildTestIndex(): SupportCodexIndex {
  const articles = parseSupportArticles(RAW_ARTICLES);
  const index = new SupportCodexIndex();
  index.build(articles);
  return index;
}

// ── SupportCodexIndex ─────────────────────────────────────────────────

describe("SupportCodexIndex", () => {
  let index: SupportCodexIndex;

  beforeEach(() => {
    index = buildTestIndex();
  });

  // ── build ──────────────────────────────────────────────────────────

  describe("build", () => {
    it("indexes the correct number of articles", () => {
      expect(index.size).toBe(5);
    });

    it("can rebuild with different articles", () => {
      const small = parseSupportArticles([RAW_ARTICLES[0]]);
      index.build(small);
      expect(index.size).toBe(1);
    });
  });

  // ── search ─────────────────────────────────────────────────────────

  describe("search", () => {
    it("returns empty for empty query", () => {
      expect(index.search("")).toEqual([]);
    });

    it("returns empty for stop-word-only query", () => {
      expect(index.search("the a an is")).toEqual([]);
    });

    it("returns empty when no matches", () => {
      expect(index.search("xyzzynonsenseword123")).toEqual([]);
    });

    it("finds articles matching query terms", () => {
      const results = index.search("buffering");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("playback-troubleshooting");
    });

    it("ranks title matches higher than body matches", () => {
      // "playlist" is in the title of adding-playlists, and in the body of playback-troubleshooting
      const results = index.search("playlist");
      expect(results.length).toBeGreaterThan(0);
      // adding-playlists should rank highest because "playlist" is in its title (10pts) + tags
      expect(results[0].id).toBe("adding-playlists");
    });

    it("ranks tag matches highly", () => {
      // "billing" is a tag on subscriptions-billing
      const results = index.search("billing");
      expect(results[0].id).toBe("subscriptions-billing");
    });

    it("ranks heading matches above body-only", () => {
      // "black screen" — heading in playback troubleshooting
      const results = index.search("black screen");
      expect(results[0].id).toBe("playback-troubleshooting");
    });

    it("returns results sorted by score descending", () => {
      const results = index.search("troubleshooting");
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });

    it("respects maxResults", () => {
      const results = index.search("troubleshooting", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("returns default max 5 results", () => {
      const results = index.search("streaming");
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("includes snippet in results", () => {
      const results = index.search("buffering");
      expect(results[0].snippet).toBeTruthy();
      expect(typeof results[0].snippet).toBe("string");
    });

    it("includes headings in results", () => {
      const results = index.search("playlist");
      const match = results.find((r) => r.id === "adding-playlists");
      expect(match).toBeDefined();
      expect(match!.headings).toContain("By URL");
      expect(match!.headings).toContain("By File");
    });

    it("includes tags in results", () => {
      const results = index.search("billing");
      const match = results.find((r) => r.id === "subscriptions-billing");
      expect(match!.tags).toContain("billing");
      expect(match!.tags).toContain("stripe");
    });

    it("gives multi-term bonus for multiple matched terms", () => {
      // "epg troubleshooting" should rank epg-troubleshooting very high
      // since both terms match its title
      const results = index.search("epg troubleshooting");
      expect(results[0].id).toBe("epg-troubleshooting");
      expect(results[0].score).toBeGreaterThan(15);
    });

    it("handles partial matches in title", () => {
      // "play" should partially match "playback" in title
      const results = index.search("play");
      const hasPlayback = results.some((r) => r.id === "playback-troubleshooting");
      expect(hasPlayback).toBe(true);
    });
  });

  // ── getArticle ─────────────────────────────────────────────────────

  describe("getArticle", () => {
    it("retrieves an article by ID", () => {
      const article = index.getArticle("adding-playlists");
      expect(article).toBeDefined();
      expect(article!.meta.title).toBe("Adding Playlists");
    });

    it("returns undefined for non-existent ID", () => {
      expect(index.getArticle("nonexistent")).toBeUndefined();
    });
  });

  // ── getAllMeta ─────────────────────────────────────────────────────

  describe("getAllMeta", () => {
    it("returns metadata for all articles", () => {
      const meta = index.getAllMeta();
      expect(meta).toHaveLength(5);
    });

    it("each meta has required fields", () => {
      const meta = index.getAllMeta();
      for (const m of meta) {
        expect(m.id).toBeTruthy();
        expect(m.title).toBeTruthy();
        expect(Array.isArray(m.tags)).toBe(true);
        expect(typeof m.lastUpdated).toBe("string");
        expect(typeof m.summary).toBe("string");
      }
    });

    it("includes all known article IDs", () => {
      const ids = index.getAllMeta().map((m) => m.id);
      expect(ids).toContain("playback-troubleshooting");
      expect(ids).toContain("adding-playlists");
      expect(ids).toContain("epg-troubleshooting");
      expect(ids).toContain("subscriptions-billing");
      expect(ids).toContain("getting-started");
    });
  });
});
