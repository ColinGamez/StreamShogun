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

/**
 * Whether a stream URL can be handed to <video>/hls.js at all.
 * Only http(s) and blob: schemes play in the browser — anything else
 * (rtmp://, rtsp://, udp://, javascript:, data:, …) must surface a clear
 * error instead of a silent black screen.
 */
export function isPlayableMediaUrl(source: string): boolean {
  const value = source.trim();
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:" || protocol === "blob:";
  } catch {
    return false;
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

export interface PlaybackFailure {
  kind: "network" | "media" | "native" | "timeout";
  status?: number;
  mediaCode?: number;
}

/** Only structured status/codes enter user messages; stream URLs may contain secrets. */
export function describePlaybackFailure(failure: PlaybackFailure): string {
  if (failure.kind === "network") {
    if (failure.status === 401 || failure.status === 403) {
      return "Access to this stream was denied. Check your source subscription or refresh its playlist link.";
    }
    if (failure.status === 404 || failure.status === 410) {
      return "This stream is missing or its link has expired. Refresh your playlist or try another channel.";
    }
    return "Could not connect to the stream. Check your connection or source, then try again.";
  }
  if (failure.kind === "timeout") {
    return "The stream stopped responding. Check your connection or try another channel, then retry.";
  }
  if (failure.kind === "media" || failure.mediaCode === 3 || failure.mediaCode === 4) {
    return "The stream could not be decoded or its format is unsupported. Try another channel or a different source format.";
  }
  return "Playback could not continue. Check your connection or source, then try again.";
}

export function shouldRetryPlaybackFailure(failure: PlaybackFailure): boolean {
  if (failure.kind === "network" && [401, 403, 404, 410].includes(failure.status ?? 0)) {
    return false;
  }
  return !(failure.kind === "native" && [1, 3, 4].includes(failure.mediaCode ?? 0));
}

export function normalizePlaybackVolume(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0.8;
  const volume = Number(raw);
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.8;
}
