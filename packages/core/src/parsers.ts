// ── Shared parsers / validators ──

import type { StreamEvent, AppConfig } from "./types.js";

/** Validate and narrow an unknown value to a StreamEvent. */
export function parseStreamEvent(raw: unknown): StreamEvent | null {
  if (typeof raw !== "object" || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.id !== "string" ||
    typeof obj.platform !== "string" ||
    typeof obj.type !== "string" ||
    typeof obj.timestamp !== "number" ||
    typeof obj.payload !== "object"
  ) {
    return null;
  }

  return obj as unknown as StreamEvent;
}

const DEFAULT_CONFIG: AppConfig = {
  version: "0.1.0",
  theme: "system",
  locale: "en",
  connections: [],
};

/** Return a valid AppConfig, filling in defaults for missing fields. */
export function parseAppConfig(raw: unknown): AppConfig {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CONFIG };

  const obj = raw as Partial<AppConfig>;

  return {
    version: obj.version ?? DEFAULT_CONFIG.version,
    theme: obj.theme ?? DEFAULT_CONFIG.theme,
    locale: obj.locale ?? DEFAULT_CONFIG.locale,
    connections: Array.isArray(obj.connections) ? obj.connections : [],
  };
}

/** Create a unique ID (simple, no external deps). */
export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
