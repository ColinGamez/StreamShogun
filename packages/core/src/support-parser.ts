// ── Support Codex Parser ──────────────────────────────────────────────
//
// Parses markdown articles with YAML-style frontmatter into structured
// SupportArticle objects.  No external YAML lib — the frontmatter is
// simple enough to parse manually (only string, string[], and date fields).

import type { SupportArticle, SupportArticleMeta, SupportHeading } from "./support-types.js";

// ── Frontmatter parser ────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return { meta: {}, body: raw };

  const yamlBlock = m[1];
  const body = raw.slice(m[0].length);

  const meta: Record<string, unknown> = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Array (e.g., [tag1, tag2, tag3])
    if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      meta[key] = value;
    }
  }

  return { meta, body };
}

// ── Heading extractor ─────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

function extractHeadings(body: string): SupportHeading[] {
  const headings: SupportHeading[] = [];
  let match: RegExpExecArray | null;
  while ((match = HEADING_RE.exec(body)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      offset: match.index,
    });
  }
  return headings;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Parse a raw markdown string (with frontmatter) into a SupportArticle.
 * Returns `null` if the article has no valid `id` in frontmatter.
 */
export function parseSupportArticle(raw: string): SupportArticle | null {
  const { meta, body } = parseFrontmatter(raw);

  const id = typeof meta.id === "string" ? meta.id : "";
  if (!id) return null;

  const articleMeta: SupportArticleMeta = {
    id,
    title: typeof meta.title === "string" ? meta.title : id,
    tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
    lastUpdated: typeof meta.lastUpdated === "string" ? meta.lastUpdated : "",
    summary: typeof meta.summary === "string" ? meta.summary : "",
  };

  return {
    meta: articleMeta,
    body,
    headings: extractHeadings(body),
  };
}

/**
 * Parse multiple raw markdown strings into an array of SupportArticles.
 * Filters out any that fail to parse.
 */
export function parseSupportArticles(raws: string[]): SupportArticle[] {
  return raws.map(parseSupportArticle).filter((a): a is SupportArticle => a !== null);
}
