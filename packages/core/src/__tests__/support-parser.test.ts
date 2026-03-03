import { describe, it, expect } from "vitest";
import { parseSupportArticle, parseSupportArticles } from "../support-parser.js";

// ── parseSupportArticle ──────────────────────────────────────────────

describe("parseSupportArticle", () => {
  const VALID_ARTICLE = `---
id: test-article
title: Test Article Title
tags: [setup, getting-started, basics]
lastUpdated: "2026-03-03"
summary: A short summary of the test article.
---

# Getting Started

Welcome to the test article.

## Step 1

Do the first thing.

## Step 2

Do the second thing.
`;

  it("parses valid frontmatter and body", () => {
    const result = parseSupportArticle(VALID_ARTICLE);
    expect(result).not.toBeNull();
    expect(result!.meta.id).toBe("test-article");
    expect(result!.meta.title).toBe("Test Article Title");
    expect(result!.meta.tags).toEqual(["setup", "getting-started", "basics"]);
    expect(result!.meta.lastUpdated).toBe("2026-03-03");
    expect(result!.meta.summary).toBe("A short summary of the test article.");
  });

  it("extracts markdown body after frontmatter", () => {
    const result = parseSupportArticle(VALID_ARTICLE)!;
    expect(result.body).toContain("# Getting Started");
    expect(result.body).toContain("## Step 1");
    expect(result.body).not.toContain("---");
  });

  it("extracts headings with correct levels", () => {
    const result = parseSupportArticle(VALID_ARTICLE)!;
    expect(result.headings).toHaveLength(3);
    expect(result.headings[0]).toMatchObject({ level: 1, text: "Getting Started" });
    expect(result.headings[1]).toMatchObject({ level: 2, text: "Step 1" });
    expect(result.headings[2]).toMatchObject({ level: 2, text: "Step 2" });
  });

  it("headings have valid offsets", () => {
    const result = parseSupportArticle(VALID_ARTICLE)!;
    for (const h of result.headings) {
      expect(h.offset).toBeGreaterThanOrEqual(0);
      expect(h.offset).toBeLessThan(result.body.length);
    }
  });

  it("returns null when id is missing", () => {
    const noId = `---
title: No Id Article
tags: [test]
---

Some body.
`;
    expect(parseSupportArticle(noId)).toBeNull();
  });

  it("returns null for empty id", () => {
    const emptyId = `---
id: ""
title: Empty Id
---

Body.
`;
    // id is "" after quote stripping → falsy → null
    expect(parseSupportArticle(emptyId)).toBeNull();
  });

  it("handles article with no frontmatter", () => {
    const noFrontmatter = "# Just a heading\n\nSome text.";
    // No frontmatter → meta is {}, id is "" → null
    expect(parseSupportArticle(noFrontmatter)).toBeNull();
  });

  it("defaults title to id when title is missing", () => {
    const noTitle = `---
id: my-article
tags: [test]
---

Body text.
`;
    const result = parseSupportArticle(noTitle)!;
    expect(result.meta.title).toBe("my-article");
  });

  it("defaults tags to empty array when missing", () => {
    const noTags = `---
id: my-article
title: Title
---

Body text.
`;
    const result = parseSupportArticle(noTags)!;
    expect(result.meta.tags).toEqual([]);
  });

  it("handles single-quoted values", () => {
    const singleQuotes = `---
id: 'quoted-id'
title: 'Quoted Title'
summary: 'A summary'
---

Body.
`;
    const result = parseSupportArticle(singleQuotes)!;
    expect(result.meta.id).toBe("quoted-id");
    expect(result.meta.title).toBe("Quoted Title");
    expect(result.meta.summary).toBe("A summary");
  });

  it("handles tags as comma-separated array", () => {
    const article = `---
id: tag-test
title: Tag Test
tags: [alpha, beta, gamma]
---

Body.
`;
    const result = parseSupportArticle(article)!;
    expect(result.meta.tags).toEqual(["alpha", "beta", "gamma"]);
  });
});

// ── parseSupportArticles (batch) ─────────────────────────────────────

describe("parseSupportArticles", () => {
  it("parses multiple articles", () => {
    const raws = [
      `---\nid: a1\ntitle: First\ntags: [x]\n---\n\nBody one.`,
      `---\nid: a2\ntitle: Second\ntags: [y]\n---\n\nBody two.`,
    ];
    const results = parseSupportArticles(raws);
    expect(results).toHaveLength(2);
    expect(results[0].meta.id).toBe("a1");
    expect(results[1].meta.id).toBe("a2");
  });

  it("filters out invalid articles", () => {
    const raws = [
      `---\nid: valid\ntitle: Valid\n---\n\nBody.`,
      `No frontmatter at all`,
      `---\ntitle: Missing id\n---\n\nBody.`,
    ];
    const results = parseSupportArticles(raws);
    expect(results).toHaveLength(1);
    expect(results[0].meta.id).toBe("valid");
  });

  it("returns empty array for all-invalid input", () => {
    const results = parseSupportArticles(["bad", "also bad"]);
    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseSupportArticles([])).toEqual([]);
  });
});
