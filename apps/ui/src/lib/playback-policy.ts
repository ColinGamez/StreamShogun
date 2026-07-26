export const MAX_PLAYBACK_RETRIES = 4;
export const PLAYBACK_RETRY_BASE_MS = 1_000;

export type PlaybackSourceKind = "hls" | "direct";

export interface RetryDecision {
  retry: boolean;
  attempt: number;
  delayMs: number;
}

export function classifyPlaybackSource(source: string): PlaybackSourceKind {
  const value = source.trim();
  try {
    const pathname = new URL(value, "http://localhost").pathname.toLowerCase();
    return pathname.endsWith(".m3u8") ? "hls" : "direct";
  } catch {
    return /\.m3u8(?:$|[?#])/i.test(value) ? "hls" : "direct";
  }
}

export function nextPlaybackRetry(completedAttempts: number): RetryDecision {
  const safeAttempts = Number.isFinite(completedAttempts)
    ? Math.max(0, Math.floor(completedAttempts))
    : MAX_PLAYBACK_RETRIES;

  if (safeAttempts >= MAX_PLAYBACK_RETRIES) {
    return { retry: false, attempt: safeAttempts, delayMs: 0 };
  }

  const attempt = safeAttempts + 1;
  return {
    retry: true,
    attempt,
    delayMs: PLAYBACK_RETRY_BASE_MS * 2 ** (attempt - 1),
  };
}
