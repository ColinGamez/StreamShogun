// ── Support Feedback — local persistence + optional API sync ─────────

import type { SupportFeedback } from "@stream-shogun/core";

const FEEDBACK_STORAGE_KEY = "support_feedback";

/** Load all locally stored feedback entries. */
export function loadFeedback(): SupportFeedback[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SupportFeedback[]) : [];
  } catch {
    return [];
  }
}

/** Save a new feedback entry locally. */
export function saveFeedback(entry: SupportFeedback): void {
  try {
    const existing = loadFeedback();
    existing.push(entry);
    // Keep a max of 100 entries locally
    const trimmed = existing.slice(-100);
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage full / blocked — ignore */
  }
}

/**
 * Opt-in: send feedback to the API.
 * Only call this when the user explicitly clicks "Send feedback".
 */
export async function sendFeedbackToApi(
  entry: SupportFeedback,
  apiBase: string,
  authToken?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${apiBase}/v1/support-feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messageId: entry.messageId,
        rating: entry.rating,
        comment: entry.comment,
        articleIds: entry.articleIds,
        appVersion: entry.appVersion,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}
