// ── Support Redaction Utilities ───────────────────────────────────────
//
// Strips sensitive information from text before it's included in a
// support bundle or sent to the API.

const REDACTION_PATTERNS: [RegExp, string][] = [
  // JWT tokens (eyJ...)
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[REDACTED_TOKEN]"],

  // Bearer tokens
  [/Bearer\s+[A-Za-z0-9_.-]{10,}/gi, "Bearer [REDACTED_TOKEN]"],

  // Stripe keys
  [/\b(sk|pk|rk)_(test|live)_[A-Za-z0-9]{10,}/g, "[REDACTED_KEY]"],

  // Generic API keys
  [/\bkey_[A-Za-z0-9]{8,}/g, "[REDACTED_KEY]"],

  // Database URLs (postgres, mysql, etc.)
  [/\b(postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"']+/gi, "[REDACTED_DB_URL]"],

  // Email addresses
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],

  // URLs with tokens/auth in query strings
  [/https?:\/\/[^\s"']*[?&](token|key|auth|secret|password|pwd)=[^\s"'&]*/gi, "[REDACTED_URL]"],

  // General URLs (keep protocol, redact rest)
  [/https?:\/\/[^\s"']{15,}/g, "[REDACTED_URL]"],

  // Windows user paths
  [/[A-Z]:\\Users\\[^\s\\]+/gi, "[REDACTED_PATH]"],

  // Unix home paths
  [/\/home\/[^\s/]+/g, "[REDACTED_PATH]"],
  [/\/Users\/[^\s/]+/g, "[REDACTED_PATH]"],

  // Environment variable assignments
  [/\b[A-Z_]{3,}=["']?[^\s"']+["']?/g, "[REDACTED_ENV]"],
];

/**
 * Redact sensitive information from a string.
 * Applied pattern-by-pattern to catch overlapping matches.
 */
export function redactSensitiveInfo(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redact an array of chat messages, returning safe copies.
 */
export function redactMessages(
  messages: { role: string; text: string }[],
): { role: string; text: string }[] {
  return messages.map((m) => ({
    role: m.role,
    text: redactSensitiveInfo(m.text),
  }));
}
