// ── Support Codex Search Engine ───────────────────────────────────────
//
// Local-first inverted index for keyword search across support articles.
// No embeddings — uses keyword frequency, tag matching, title matching,
// and heading matching with a simple TF scoring model.

import type { SupportArticle, SupportSearchMatch } from "./support-types.js";

// ── Tokenisation ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "to", "of", "in", "and", "or", "for",
  "on", "with", "this", "that", "are", "was", "be", "by", "at", "from",
  "as", "not", "but", "do", "does", "has", "have", "had", "can", "will",
  "my", "i", "me", "you", "your", "we", "our", "they", "their", "he",
  "she", "his", "her", "if", "how", "what", "when", "where", "why",
  "which", "who", "so", "no", "yes", "all", "any", "each", "more", "some",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

// ── Index entry ───────────────────────────────────────────────────────

interface IndexEntry {
  article: SupportArticle;
  titleTokens: Set<string>;
  tagTokens: Set<string>;
  headingTokens: Set<string>;
  bodyTokens: Map<string, number>; // token → frequency
  allText: string; // lowercased full text for snippet extraction
}

// ── Support Codex Index ───────────────────────────────────────────────

export class SupportCodexIndex {
  private entries: IndexEntry[] = [];

  /** Build (or rebuild) the index from a set of articles. */
  build(articles: SupportArticle[]): void {
    this.entries = articles.map((article) => {
      const titleTokens = new Set(tokenize(article.meta.title));
      const tagTokens = new Set(
        article.meta.tags.flatMap((t) => tokenize(t)),
      );
      const headingTokens = new Set(
        article.headings.flatMap((h) => tokenize(h.text)),
      );

      const bodyTokens = new Map<string, number>();
      for (const token of tokenize(article.body)) {
        bodyTokens.set(token, (bodyTokens.get(token) ?? 0) + 1);
      }

      const allText = [
        article.meta.title,
        article.meta.summary,
        ...article.headings.map((h) => h.text),
        article.body,
      ]
        .join(" ")
        .toLowerCase();

      return { article, titleTokens, tagTokens, headingTokens, bodyTokens, allText };
    });
  }

  /** Return the total number of indexed articles. */
  get size(): number {
    return this.entries.length;
  }

  /** Search the index. Returns top N matches sorted by relevance. */
  search(query: string, maxResults = 5): SupportSearchMatch[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scored: { entry: IndexEntry; score: number }[] = [];

    for (const entry of this.entries) {
      let score = 0;

      for (const qt of queryTokens) {
        // Title match (highest weight)
        if (entry.titleTokens.has(qt)) score += 10;

        // Tag match (high weight)
        if (entry.tagTokens.has(qt)) score += 8;

        // Heading match
        if (entry.headingTokens.has(qt)) score += 5;

        // Body frequency (lower weight, capped)
        const freq = entry.bodyTokens.get(qt) ?? 0;
        if (freq > 0) score += Math.min(freq, 5) * 1;

        // Partial match in title (for substrings)
        for (const tt of entry.titleTokens) {
          if (tt.includes(qt) && tt !== qt) score += 3;
        }
        for (const tg of entry.tagTokens) {
          if (tg.includes(qt) && tg !== qt) score += 2;
        }
      }

      // Bonus for matching multiple query terms
      const distinctMatches = queryTokens.filter(
        (qt) =>
          entry.titleTokens.has(qt) ||
          entry.tagTokens.has(qt) ||
          entry.headingTokens.has(qt) ||
          (entry.bodyTokens.get(qt) ?? 0) > 0,
      ).length;
      if (distinctMatches > 1) score += distinctMatches * 3;

      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    // Sort by score descending, then by title alphabetically
    scored.sort((a, b) => b.score - a.score || a.entry.article.meta.title.localeCompare(b.entry.article.meta.title));

    return scored.slice(0, maxResults).map(({ entry, score }) => ({
      id: entry.article.meta.id,
      title: entry.article.meta.title,
      score,
      snippet: extractSnippet(entry, queryTokens),
      headings: entry.article.headings.map((h) => h.text),
      tags: entry.article.meta.tags,
    }));
  }

  /** Get a specific article by ID. */
  getArticle(id: string): SupportArticle | undefined {
    return this.entries.find((e) => e.article.meta.id === id)?.article;
  }

  /** Get all indexed article metadata. */
  getAllMeta(): { id: string; title: string; tags: string[]; lastUpdated: string; summary: string }[] {
    return this.entries.map((e) => e.article.meta);
  }
}

// ── Snippet extraction ────────────────────────────────────────────────

function extractSnippet(entry: IndexEntry, queryTokens: string[]): string {
  const text = entry.allText;


  // Find the first occurrence of a query token in the full text
  let bestPos = -1;
  for (const qt of queryTokens) {
    const pos = text.indexOf(qt);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  if (bestPos === -1) {
    // Fallback to summary
    return entry.article.meta.summary.slice(0, 200);
  }

  // Extract a window around the match
  const start = Math.max(0, bestPos - 60);
  const end = Math.min(text.length, bestPos + 140);
  let snippet = text.slice(start, end).trim();

  // Clean up — don't start/end mid-word
  if (start > 0) snippet = "…" + snippet.replace(/^\S*\s/, "");
  if (end < text.length) snippet = snippet.replace(/\s\S*$/, "") + "…";

  return snippet;
}
