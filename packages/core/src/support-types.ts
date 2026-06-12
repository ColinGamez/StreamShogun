// ── Support Codex Types ───────────────────────────────────────────────

/** Frontmatter fields for a support article */
export interface SupportArticleMeta {
  id: string;
  title: string;
  tags: string[];
  lastUpdated: string;
  summary: string;
}

/** A parsed support article */
export interface SupportArticle {
  meta: SupportArticleMeta;
  /** Full markdown body (after frontmatter) */
  body: string;
  /** Extracted headings (level + text) */
  headings: SupportHeading[];
}

export interface SupportHeading {
  level: number;
  text: string;
  /** Character offset within body */
  offset: number;
}

/** A search result from the support codex */
export interface SupportSearchMatch {
  id: string;
  title: string;
  score: number;
  /** Most relevant snippet (up to ~200 chars) */
  snippet: string;
  /** Headings in the matched article */
  headings: string[];
  /** Tags from the article meta */
  tags: string[];
}

/** Chat message in the support UI */
export interface SupportChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Article IDs cited in the response */
  citations?: string[];
  /** Timestamp ISO */
  timestamp: string;
  /** Feedback rating */
  rating?: "up" | "down";
}

/** Non-sensitive diagnostic info for support bundles */
export interface SupportDiagnostics {
  appVersion: string;
  os: string;
  loggedIn: boolean;
  playlistCount: number;
  epgSourceCount: number;
  billingEnabled: boolean;
}

/** Feedback entry stored locally */
export interface SupportFeedback {
  messageId: string;
  rating: "up" | "down";
  comment?: string;
  articleIds: string[];
  appVersion: string;
  timestamp: string;
}

// ── Structured Answer Types ───────────────────────────────────────────

/** Confidence level derived from search match scores */
export type ConfidenceLevel = "high" | "medium" | "low";

/** A single step in the structured answer, with optional citation */
export interface AnswerStep {
  text: string;
  /** Citation in the form [guide:<id>#<heading>] */
  citation?: string;
}

/** A related guide link */
export interface RelatedGuide {
  id: string;
  title: string;
}

/** The structured answer returned by the answer composer */
export interface StructuredAnswer {
  /** 1-2 sentence summary */
  summary: string;
  /** Ordered steps (bullet list) — empty if not applicable */
  steps: AnswerStep[];
  /** 2-4 troubleshooting tips — empty if not applicable */
  troubleshooting: string[];
  /** 1-3 related guide links */
  relatedGuides: RelatedGuide[];
  /** Search-score-based confidence */
  confidence: ConfidenceLevel;
  /** Clarifying question (only when confidence is low) */
  clarifyingQuestion?: string;
  /** Article IDs cited anywhere in the answer */
  citations: string[];
  /** Safety-blocked flag */
  blocked?: boolean;
}

// ── Support Bundle ────────────────────────────────────────────────────

export interface SupportBundle {
  generatedAt: string;
  appVersion: string;
  os: string;
  locale: string;
  auth: { loggedIn: boolean };
  counts: { playlists: number; epgSources: number };
  billing: { enabled: boolean; plan?: string; status?: string };
  recentMessages: { role: string; text: string }[];
  matchedGuideIds: string[];
}
