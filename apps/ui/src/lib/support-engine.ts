// ── Support Answer Composer ───────────────────────────────────────────
//
// Deterministic structured-answer generator.  No external LLM calls.
// Input:  userQuestion  + topMatches (articles + snippets + headings).
// Output: StructuredAnswer with summary, steps, troubleshooting,
//         related guides, confidence indicator, and inline citations.
//
// Every fact in the answer MUST trace to a codex article.

import type {
  SupportChatMessage,
  SupportSearchMatch,
  StructuredAnswer,
  ConfidenceLevel,
  AnswerStep,
  RelatedGuide,
  SupportArticle,
} from "@stream-shogun/core";
import { searchSupport, getSupportArticle } from "./support-codex";

// ── Safety policy ─────────────────────────────────────────────────────
const BLOCKED_PATTERNS = [
  /(?:free|illegal|pirate|pirated|crack|cracked)\s*(?:iptv|playlist|m3u|stream)/i,
  /(?:find|get|download|give)\s*(?:me\s+)?(?:iptv|playlist|m3u|stream|channel)/i,
  /bypass\s*(?:paywall|pro|subscription|billing|drm|geo)/i,
  /hack|exploit|reverse.?engineer|keygen|license.?key|crack/i,
  /where\s*(?:can|do|to)\s*(?:i\s+)?(?:get|find|download)\s*(?:free|iptv|stream|playlist)/i,
];

const BLOCKED_RESPONSE =
  "I can only help with StreamShōgun features and troubleshooting. " +
  "I can't assist with finding stream sources or bypassing restrictions. " +
  "StreamShōgun works with your own legally obtained playlists. " +
  "If you need help adding a playlist you already have, I'm happy to guide you!";

// ── Clarifying-question templates (category → question) ───────────────
const CLARIFYING_QUESTIONS: Record<string, string> = {
  playback: "Could you describe the issue in more detail — for example, do you see a black screen, buffering, or an error message?",
  epg: "Can you share more specifics — have you added an EPG source, and are your channels missing programme data entirely or partially?",
  general: "Could you rephrase or add more details so I can find the right guide for you?",
};

// ── Score thresholds ──────────────────────────────────────────────────
const HIGH_CONFIDENCE_THRESHOLD = 15;
const MEDIUM_CONFIDENCE_THRESHOLD = 8;

// ── Section extractor ─────────────────────────────────────────────────

/** Extract the text block under a given heading from a markdown body. */
export function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,4}\\s+${escaped}\\s*$`, "mi");
  const match = re.exec(body);
  if (!match) return "";

  const start = match.index + match[0].length;
  const nextH = body.slice(start).search(/^#{1,4}\s+/m);
  const section = nextH === -1 ? body.slice(start) : body.slice(start, start + nextH);
  return section.trim();
}

/** Parse markdown bullet lines (- or *  or numbered) from a section. */
function parseBullets(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)]\s)/, "").trim())
    .filter((l) => l.length > 0);
}

// ── Category detection ────────────────────────────────────────────────

export function detectCategory(query: string): string {
  const q = query.toLowerCase();
  if (/play|buffer|stream|video|audio|black.?screen|sound|codec/.test(q)) return "playback";
  if (/epg|guide|programme|program|schedule|xmltv|tv.?guide/.test(q)) return "epg";
  if (/bill|subscri|pro|upgrade|pay|stripe|plan|pricing/.test(q)) return "billing";
  if (/install|setup|first.?run|getting.?started|download/.test(q)) return "setup";
  if (/pip|mini.?player|picture.?in/.test(q)) return "pip";
  if (/discord|rich.?presence|rpc/.test(q)) return "discord";
  if (/login|account|password|sign.?in|sign.?up|auth/.test(q)) return "account";
  if (/privacy|security|data|telemetry|gdpr/.test(q)) return "privacy";
  return "general";
}

// ── Heading relevance scoring ─────────────────────────────────────────

function findBestHeading(query: string, headings: string[]): string | null {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  let best: string | null = null;
  let bestScore = 0;

  for (const h of headings) {
    const hLower = h.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hLower.includes(t)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** Format a citation string: [guide:<articleId>#<Heading>] */
export function formatCitation(articleId: string, heading?: string): string {
  if (heading) return `[guide:${articleId}#${heading}]`;
  return `[guide:${articleId}]`;
}

// ── Confidence derivation ─────────────────────────────────────────────

export function deriveConfidence(topScore: number): ConfidenceLevel {
  if (topScore >= HIGH_CONFIDENCE_THRESHOLD) return "high";
  if (topScore >= MEDIUM_CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}

// ── Build steps from the best article section ─────────────────────────

function buildSteps(
  article: SupportArticle,
  query: string,
  matches: SupportSearchMatch[],
): AnswerStep[] {
  const steps: AnswerStep[] = [];
  const topMatch = matches[0];

  // 1. Try the heading most relevant to the query
  const bestHeading = findBestHeading(query, topMatch.headings);
  if (bestHeading) {
    const section = extractSection(article.body, bestHeading);
    if (section) {
      const bullets = parseBullets(section);
      if (bullets.length > 0) {
        for (const b of bullets.slice(0, 6)) {
          steps.push({
            text: b,
            citation: formatCitation(article.meta.id, bestHeading),
          });
        }
        return steps;
      }
      // Section exists but isn't bullets — use the whole block as one step
      if (section.length > 0) {
        steps.push({
          text: section.slice(0, 300),
          citation: formatCitation(article.meta.id, bestHeading),
        });
        return steps;
      }
    }
  }

  // 2. Fallback: collect bullets from the first few headings
  for (const h of topMatch.headings.slice(0, 3)) {
    const section = extractSection(article.body, h);
    const bullets = parseBullets(section);
    for (const b of bullets.slice(0, 2)) {
      steps.push({
        text: b,
        citation: formatCitation(article.meta.id, h),
      });
    }
    if (steps.length >= 5) break;
  }

  // 3. If still empty, use the article summary as a single step
  if (steps.length === 0) {
    steps.push({
      text: article.meta.summary,
      citation: formatCitation(article.meta.id),
    });
  }

  return steps;
}

// ── Build troubleshooting tips ────────────────────────────────────────

function buildTroubleshooting(
  article: SupportArticle,
  matches: SupportSearchMatch[],
): string[] {
  const tips: string[] = [];

  // Look for troubleshooting/common-errors headings in the primary article
  const troubleHeadings = article.headings
    .map((h) => h.text)
    .filter((t) => /troubleshoot|error|issue|problem|common|fix|resolve|still|when/i.test(t));

  for (const h of troubleHeadings.slice(0, 2)) {
    const section = extractSection(article.body, h);
    const bullets = parseBullets(section);
    for (const b of bullets.slice(0, 2)) {
      tips.push(b);
    }
  }

  // Supplement from secondary matches if we have <2 tips
  if (tips.length < 2 && matches.length > 1) {
    for (const m of matches.slice(1, 3)) {
      const secondary = getSupportArticle(m.id);
      if (!secondary) continue;
      const sHeadings = secondary.headings
        .map((h) => h.text)
        .filter((t) => /troubleshoot|error|issue|common|fix/i.test(t));
      for (const h of sHeadings.slice(0, 1)) {
        const section = extractSection(secondary.body, h);
        const bullets = parseBullets(section);
        for (const b of bullets.slice(0, 1)) {
          tips.push(b);
        }
      }
      if (tips.length >= 4) break;
    }
  }

  // If still empty, add generic tips from the primary article
  if (tips.length === 0) {
    if (article.meta.tags.some((t) => /playback|video|stream/.test(t))) {
      tips.push("Ensure your internet connection is stable and the playlist URL is reachable.");
      tips.push("Try restarting the app and switching to a different channel first.");
    } else if (article.meta.tags.some((t) => /epg|xmltv|guide/.test(t))) {
      tips.push("Verify that your EPG source URL returns valid XMLTV data.");
      tips.push("Ensure your channels have matching tvg-id attributes.");
    } else {
      tips.push("Try restarting StreamShōgun if the issue persists.");
      tips.push("Check the FAQ for additional help.");
    }
  }

  return tips.slice(0, 4);
}

// ── Build related guides ──────────────────────────────────────────────

function buildRelatedGuides(
  matches: SupportSearchMatch[],
  primaryId: string,
): RelatedGuide[] {
  return matches
    .filter((m) => m.id !== primaryId && m.score > 0)
    .slice(0, 3)
    .map((m) => ({ id: m.id, title: m.title }));
}

// ── Core composition ──────────────────────────────────────────────────

/**
 * Compose a structured answer from a user question.
 * Fully deterministic — no external LLM calls.
 * Every fact traces to a Support Codex article.
 */
export function composeAnswer(query: string): StructuredAnswer {
  // 1. Safety check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(query)) {
      return {
        summary: BLOCKED_RESPONSE,
        steps: [],
        troubleshooting: [],
        relatedGuides: [],
        confidence: "high",
        citations: [],
        blocked: true,
      };
    }
  }

  // 2. Search codex
  const matches = searchSupport(query, 5);

  // 3. No matches at all
  if (matches.length === 0) {
    const category = detectCategory(query);
    return {
      summary: "I couldn't find a matching article in the Support Codex for that question.",
      steps: [],
      troubleshooting: [],
      relatedGuides: [],
      confidence: "low",
      clarifyingQuestion: CLARIFYING_QUESTIONS[category] ?? CLARIFYING_QUESTIONS.general,
      citations: [],
    };
  }

  const topMatch = matches[0];
  const confidence = deriveConfidence(topMatch.score);
  const allCitations: string[] = [topMatch.id];

  // 4. Low confidence → show best guesses + clarifying question
  if (confidence === "low") {
    const category = detectCategory(query);
    const guides: RelatedGuide[] = matches.slice(0, 3).map((m) => ({
      id: m.id,
      title: m.title,
    }));

    return {
      summary:
        `I found some guides that might be related, but I'm not fully confident in the match.`,
      steps: [],
      troubleshooting: [],
      relatedGuides: guides,
      confidence: "low",
      clarifyingQuestion: CLARIFYING_QUESTIONS[category] ?? CLARIFYING_QUESTIONS.general,
      citations: guides.map((g) => g.id),
    };
  }

  // 5. Medium/High confidence → full structured answer
  const article = getSupportArticle(topMatch.id);
  if (!article) {
    // Edge case: article in index but not retrievable
    return {
      summary: topMatch.snippet,
      steps: [],
      troubleshooting: [],
      relatedGuides: buildRelatedGuides(matches, topMatch.id),
      confidence,
      citations: [topMatch.id],
    };
  }

  // Summary: article's own summary text
  const summary = article.meta.summary || `Here's what I found in **${article.meta.title}**.`;

  // Steps with citations
  const steps = buildSteps(article, query, matches);
  for (const s of steps) {
    if (s.citation) {
      const citedId = s.citation.match(/guide:([^#\]]+)/)?.[1];
      if (citedId && !allCitations.includes(citedId)) allCitations.push(citedId);
    }
  }

  // Troubleshooting tips
  const troubleshooting = buildTroubleshooting(article, matches);

  // Related guides (exclude primary)
  const relatedGuides = buildRelatedGuides(matches, topMatch.id);
  for (const g of relatedGuides) {
    if (!allCitations.includes(g.id)) allCitations.push(g.id);
  }

  // Medium-confidence gets a clarifying question appended
  const clarifyingQuestion =
    confidence === "medium"
      ? CLARIFYING_QUESTIONS[detectCategory(query)] ?? CLARIFYING_QUESTIONS.general
      : undefined;

  return {
    summary,
    steps,
    troubleshooting,
    relatedGuides,
    confidence,
    clarifyingQuestion,
    citations: allCitations,
  };
}

// ── Render helpers (for flat text fallback & SupportChat) ─────────────

/** Render a StructuredAnswer to a flat markdown string for display. */
export function renderAnswerText(answer: StructuredAnswer): string {
  const parts: string[] = [];

  // Confidence badge
  const badge = answer.confidence === "high" ? "🟢" : answer.confidence === "medium" ? "🟡" : "🔴";
  parts.push(`${badge} **Confidence: ${answer.confidence}**\n`);

  // Summary
  parts.push(answer.summary);

  // Steps
  if (answer.steps.length > 0) {
    parts.push("\n\n**Steps:**");
    for (const step of answer.steps) {
      const cite = step.citation ? ` ${step.citation}` : "";
      parts.push(`• ${step.text}${cite}`);
    }
  }

  // Troubleshooting
  if (answer.troubleshooting.length > 0) {
    parts.push("\n\n**Troubleshooting:**");
    for (const tip of answer.troubleshooting) {
      parts.push(`• ${tip}`);
    }
  }

  // Related guides
  if (answer.relatedGuides.length > 0) {
    parts.push("\n\n**Related Guides:**");
    for (const g of answer.relatedGuides) {
      parts.push(`• ${g.title} [guide:${g.id}]`);
    }
  }

  // Clarifying question
  if (answer.clarifyingQuestion) {
    parts.push(`\n\n💬 ${answer.clarifyingQuestion}`);
  }

  return parts.join("\n");
}

// ── Message helpers ───────────────────────────────────────────────────

let msgCounter = 0;
export function createMessageId(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

export function createChatMessage(
  role: "user" | "assistant",
  text: string,
  citations?: string[],
): SupportChatMessage {
  return {
    id: createMessageId(),
    role,
    text,
    citations,
    timestamp: new Date().toISOString(),
  };
}
