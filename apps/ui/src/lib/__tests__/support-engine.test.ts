import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StructuredAnswer, SupportArticle, SupportSearchMatch } from "@stream-shogun/core";

// ── Mock support-codex before importing engine ────────────────────────

const mockSearchSupport = vi.fn<(query: string, max?: number) => SupportSearchMatch[]>();
const mockGetSupportArticle = vi.fn<(id: string) => SupportArticle | undefined>();

vi.mock("../support-codex", () => ({
  searchSupport: (...args: [string, number?]) => mockSearchSupport(...args),
  getSupportArticle: (...args: [string]) => mockGetSupportArticle(...args),
}));

import {
  composeAnswer,
  renderAnswerText,
  extractSection,
  formatCitation,
  deriveConfidence,
  detectCategory,
} from "../support-engine";

// ── Test fixtures ─────────────────────────────────────────────────────

const ARTICLE_PLAYBACK: SupportArticle = {
  meta: {
    id: "playback-troubleshooting",
    title: "Playback Troubleshooting",
    tags: ["playback", "video", "buffering"],
    lastUpdated: "2026-03-03",
    summary: "Fix common playback issues including black screens, buffering, and no audio.",
  },
  body: `# Playback Troubleshooting

## Black Screen

If you see a black screen, try these steps:

- Check your internet connection
- Verify the playlist URL is valid
- Try a different channel
- Restart the application

## Buffering

Buffering usually means slow network.

- Lower the quality setting
- Check bandwidth usage

## No Audio

Check that your system volume is not muted.

## Common Errors

- Error 403: The playlist URL has expired or is restricted
- Error 404: The stream endpoint no longer exists
- Timeout: The server is not responding

## When to Contact Support

If none of the above steps help, contact support@streamshogun.com.
`,
  headings: [
    { level: 1, text: "Playback Troubleshooting", offset: 0 },
    { level: 2, text: "Black Screen", offset: 30 },
    { level: 2, text: "Buffering", offset: 200 },
    { level: 2, text: "No Audio", offset: 300 },
    { level: 2, text: "Common Errors", offset: 380 },
    { level: 2, text: "When to Contact Support", offset: 550 },
  ],
};

const ARTICLE_PLAYLIST: SupportArticle = {
  meta: {
    id: "adding-playlists",
    title: "Adding Playlists",
    tags: ["playlist", "m3u", "setup"],
    lastUpdated: "2026-03-03",
    summary: "Learn how to add M3U and XSPF playlists to StreamShogun.",
  },
  body: `# Adding Playlists

## By URL

Paste the playlist URL in the library panel.

## By File

Drag and drop an M3U file into the library.
`,
  headings: [
    { level: 1, text: "Adding Playlists", offset: 0 },
    { level: 2, text: "By URL", offset: 22 },
    { level: 2, text: "By File", offset: 80 },
  ],
};

const ARTICLE_EPG: SupportArticle = {
  meta: {
    id: "epg-troubleshooting",
    title: "EPG Troubleshooting",
    tags: ["epg", "xmltv", "guide"],
    lastUpdated: "2026-03-03",
    summary: "Resolve missing or incorrect EPG data issues.",
  },
  body: `# EPG Troubleshooting

## Missing EPG Data

Ensure you have added at least one EPG source.

## Unmatched Channels

Check that your channels have tvg-id attributes.
`,
  headings: [
    { level: 1, text: "EPG Troubleshooting", offset: 0 },
    { level: 2, text: "Missing EPG Data", offset: 25 },
    { level: 2, text: "Unmatched Channels", offset: 100 },
  ],
};

function makeMatch(article: SupportArticle, score: number): SupportSearchMatch {
  return {
    id: article.meta.id,
    title: article.meta.title,
    score,
    snippet: article.meta.summary,
    headings: article.headings.map((h) => h.text),
    tags: article.meta.tags,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("extractSection", () => {
  it("extracts content under a given heading", () => {
    const section = extractSection(ARTICLE_PLAYBACK.body, "Black Screen");
    expect(section).toContain("Check your internet connection");
    expect(section).toContain("Verify the playlist URL is valid");
  });

  it("returns empty string for non-existent heading", () => {
    expect(extractSection(ARTICLE_PLAYBACK.body, "Nonexistent Heading")).toBe("");
  });

  it("extracts the last section correctly", () => {
    const section = extractSection(ARTICLE_PLAYBACK.body, "When to Contact Support");
    expect(section).toContain("contact support@streamshogun.com");
  });
});

describe("formatCitation", () => {
  it("formats citation with heading", () => {
    expect(formatCitation("playback-troubleshooting", "Black Screen"))
      .toBe("[guide:playback-troubleshooting#Black Screen]");
  });

  it("formats citation without heading", () => {
    expect(formatCitation("adding-playlists"))
      .toBe("[guide:adding-playlists]");
  });
});

describe("deriveConfidence", () => {
  it("returns high for scores >= 15", () => {
    expect(deriveConfidence(15)).toBe("high");
    expect(deriveConfidence(30)).toBe("high");
  });

  it("returns medium for scores >= 8 and < 15", () => {
    expect(deriveConfidence(8)).toBe("medium");
    expect(deriveConfidence(14)).toBe("medium");
  });

  it("returns low for scores < 8", () => {
    expect(deriveConfidence(0)).toBe("low");
    expect(deriveConfidence(7)).toBe("low");
  });
});

describe("detectCategory", () => {
  it("detects playback queries", () => {
    expect(detectCategory("video is buffering")).toBe("playback");
    expect(detectCategory("black screen on my stream")).toBe("playback");
  });

  it("detects epg queries", () => {
    expect(detectCategory("my EPG guide is missing")).toBe("epg");
    expect(detectCategory("XMLTV not loading")).toBe("epg");
  });

  it("detects billing queries", () => {
    expect(detectCategory("how do I upgrade to pro")).toBe("billing");
    expect(detectCategory("subscription payment")).toBe("billing");
  });

  it("detects setup queries", () => {
    expect(detectCategory("getting started with install")).toBe("setup");
  });

  it("returns general for unknown", () => {
    expect(detectCategory("something random")).toBe("general");
  });
});

describe("composeAnswer", () => {
  beforeEach(() => {
    mockSearchSupport.mockReset();
    mockGetSupportArticle.mockReset();
  });

  // ── Safety blocked ───────────────────────────────────────────────

  it("blocks piracy requests", () => {
    const answer = composeAnswer("give me free iptv playlists");
    expect(answer.blocked).toBe(true);
    expect(answer.confidence).toBe("high");
    expect(answer.summary).toContain("can only help");
    expect(answer.steps).toHaveLength(0);
    expect(answer.citations).toHaveLength(0);
  });

  it("blocks bypass requests", () => {
    const answer = composeAnswer("how to bypass pro subscription");
    expect(answer.blocked).toBe(true);
  });

  // ── No matches ──────────────────────────────────────────────────

  it("returns low confidence with clarifying question when no matches", () => {
    mockSearchSupport.mockReturnValue([]);

    const answer = composeAnswer("something totally unrelated");
    expect(answer.confidence).toBe("low");
    expect(answer.clarifyingQuestion).toBeTruthy();
    expect(answer.steps).toHaveLength(0);
    expect(answer.relatedGuides).toHaveLength(0);
  });

  // ── Low confidence ─────────────────────────────────────────────

  it("returns low confidence with related guides when score < 8", () => {
    mockSearchSupport.mockReturnValue([
      makeMatch(ARTICLE_PLAYBACK, 5),
      makeMatch(ARTICLE_EPG, 3),
    ]);

    const answer = composeAnswer("vague question");
    expect(answer.confidence).toBe("low");
    expect(answer.clarifyingQuestion).toBeTruthy();
    expect(answer.relatedGuides.length).toBeGreaterThan(0);
    expect(answer.relatedGuides[0].id).toBe("playback-troubleshooting");
    expect(answer.citations.length).toBeGreaterThan(0);
  });

  // ── Medium confidence ──────────────────────────────────────────

  it("returns medium confidence with structured answer for score 8-14", () => {
    mockSearchSupport.mockReturnValue([
      makeMatch(ARTICLE_PLAYBACK, 12),
      makeMatch(ARTICLE_EPG, 5),
    ]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("video playback issue");
    expect(answer.confidence).toBe("medium");
    expect(answer.summary).toBeTruthy();
    expect(answer.steps.length).toBeGreaterThan(0);
    // Medium confidence should include a clarifying question
    expect(answer.clarifyingQuestion).toBeTruthy();
    expect(answer.citations).toContain("playback-troubleshooting");
  });

  // ── High confidence ────────────────────────────────────────────

  it("returns high confidence structured answer for score >= 15", () => {
    mockSearchSupport.mockReturnValue([
      makeMatch(ARTICLE_PLAYBACK, 25),
      makeMatch(ARTICLE_PLAYLIST, 8),
      makeMatch(ARTICLE_EPG, 5),
    ]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("black screen troubleshooting");
    expect(answer.confidence).toBe("high");
    // No clarifying question for high confidence
    expect(answer.clarifyingQuestion).toBeUndefined();
  });

  // ── Structured format ──────────────────────────────────────────

  it("includes summary from article metadata", () => {
    mockSearchSupport.mockReturnValue([makeMatch(ARTICLE_PLAYBACK, 20)]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("buffering issues");
    expect(answer.summary).toBe(ARTICLE_PLAYBACK.meta.summary);
  });

  it("includes steps with citations", () => {
    mockSearchSupport.mockReturnValue([makeMatch(ARTICLE_PLAYBACK, 20)]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("black screen");
    expect(answer.steps.length).toBeGreaterThan(0);

    // At least one step should have a citation
    const citedSteps = answer.steps.filter((s) => s.citation);
    expect(citedSteps.length).toBeGreaterThan(0);

    // Citations should follow [guide:<id>#<heading>] format
    for (const step of citedSteps) {
      expect(step.citation).toMatch(/^\[guide:[a-z0-9-]+(?:#[^\]]+)?\]$/);
    }
  });

  it("includes troubleshooting tips", () => {
    mockSearchSupport.mockReturnValue([makeMatch(ARTICLE_PLAYBACK, 20)]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("playback problems");
    // Should find tips from "Common Errors" heading
    expect(answer.troubleshooting.length).toBeGreaterThanOrEqual(1);
    expect(answer.troubleshooting.length).toBeLessThanOrEqual(4);
  });

  it("includes related guides from secondary matches", () => {
    mockSearchSupport.mockReturnValue([
      makeMatch(ARTICLE_PLAYBACK, 20),
      makeMatch(ARTICLE_PLAYLIST, 10),
      makeMatch(ARTICLE_EPG, 6),
    ]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("playback troubleshooting");
    expect(answer.relatedGuides.length).toBeGreaterThan(0);
    expect(answer.relatedGuides.length).toBeLessThanOrEqual(3);
    // Related guides should not include the primary article
    expect(answer.relatedGuides.every((g) => g.id !== "playback-troubleshooting")).toBe(true);
  });

  it("collects all cited article IDs in citations array", () => {
    mockSearchSupport.mockReturnValue([
      makeMatch(ARTICLE_PLAYBACK, 20),
      makeMatch(ARTICLE_PLAYLIST, 10),
    ]);
    mockGetSupportArticle.mockReturnValue(ARTICLE_PLAYBACK);

    const answer = composeAnswer("playback");
    expect(answer.citations).toContain("playback-troubleshooting");
    // Related guides' IDs should also appear
    for (const g of answer.relatedGuides) {
      expect(answer.citations).toContain(g.id);
    }
  });
});

// ── renderAnswerText ──────────────────────────────────────────────────

describe("renderAnswerText", () => {
  const baseAnswer: StructuredAnswer = {
    summary: "This is a summary of the answer.",
    steps: [
      { text: "Step one", citation: "[guide:test-article#First]" },
      { text: "Step two" },
    ],
    troubleshooting: ["Check your connection", "Restart the app"],
    relatedGuides: [{ id: "other-guide", title: "Other Guide" }],
    confidence: "high",
    citations: ["test-article", "other-guide"],
  };

  it("includes confidence badge", () => {
    const text = renderAnswerText(baseAnswer);
    expect(text).toContain("🟢");
    expect(text).toContain("high");
  });

  it("shows yellow badge for medium confidence", () => {
    const text = renderAnswerText({ ...baseAnswer, confidence: "medium" });
    expect(text).toContain("🟡");
  });

  it("shows red badge for low confidence", () => {
    const text = renderAnswerText({ ...baseAnswer, confidence: "low" });
    expect(text).toContain("🔴");
  });

  it("includes summary text", () => {
    const text = renderAnswerText(baseAnswer);
    expect(text).toContain("This is a summary of the answer.");
  });

  it("includes steps section with citations", () => {
    const text = renderAnswerText(baseAnswer);
    expect(text).toContain("**Steps:**");
    expect(text).toContain("Step one");
    expect(text).toContain("[guide:test-article#First]");
    expect(text).toContain("Step two");
  });

  it("includes troubleshooting section", () => {
    const text = renderAnswerText(baseAnswer);
    expect(text).toContain("**Troubleshooting:**");
    expect(text).toContain("Check your connection");
    expect(text).toContain("Restart the app");
  });

  it("includes related guides section", () => {
    const text = renderAnswerText(baseAnswer);
    expect(text).toContain("**Related Guides:**");
    expect(text).toContain("Other Guide");
    expect(text).toContain("[guide:other-guide]");
  });

  it("includes clarifying question when present", () => {
    const text = renderAnswerText({
      ...baseAnswer,
      clarifyingQuestion: "Can you describe the issue?",
    });
    expect(text).toContain("💬");
    expect(text).toContain("Can you describe the issue?");
  });

  it("omits steps section when empty", () => {
    const text = renderAnswerText({ ...baseAnswer, steps: [] });
    expect(text).not.toContain("**Steps:**");
  });

  it("omits troubleshooting section when empty", () => {
    const text = renderAnswerText({ ...baseAnswer, troubleshooting: [] });
    expect(text).not.toContain("**Troubleshooting:**");
  });

  it("omits related guides section when empty", () => {
    const text = renderAnswerText({ ...baseAnswer, relatedGuides: [] });
    expect(text).not.toContain("**Related Guides:**");
  });

  it("omits clarifying question when absent", () => {
    const text = renderAnswerText(baseAnswer);
    expect(text).not.toContain("💬");
  });
});
