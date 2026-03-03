// ── Support Codex loader — loads bundled markdown articles ────────────
//
// In Vite, we use import.meta.glob to eagerly load all .md files from
// the codex directory at build time.  This avoids runtime FS access,
// which isn't available in the renderer process.

import {
  parseSupportArticle,
  SupportCodexIndex,
  type SupportArticle,
  type SupportSearchMatch,
} from "@stream-shogun/core";

// ── Eagerly load all markdown files at build-time ─────────────────────
const codexModules = import.meta.glob(
  "../../../../docs/support-codex/*.md",
  { query: "?raw", eager: true, import: "default" },
) as Record<string, string>;

// ── Build the index on module load ────────────────────────────────────
const articles: SupportArticle[] = [];
const index = new SupportCodexIndex();

for (const [_path, raw] of Object.entries(codexModules)) {
  const article = parseSupportArticle(raw);
  if (article && !article.meta.id.startsWith("_")) {
    articles.push(article);
  }
}
index.build(articles);

// ── Public API ────────────────────────────────────────────────────────

/** Search the support codex by natural language query. */
export function searchSupport(query: string, maxResults = 5): SupportSearchMatch[] {
  return index.search(query, maxResults);
}

/** Get a specific article by its slug ID. */
export function getSupportArticle(id: string): SupportArticle | undefined {
  return index.getArticle(id);
}

/** Get metadata for all articles (for listing / online sync). */
export function getAllSupportMeta() {
  return index.getAllMeta();
}

/** Total number of indexed articles. */
export function getSupportArticleCount(): number {
  return index.size;
}
