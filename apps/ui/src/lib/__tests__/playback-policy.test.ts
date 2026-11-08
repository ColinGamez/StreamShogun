import { describe, expect, it } from "vitest";
import {
  MAX_PLAYBACK_RETRIES,
  normalizePlaybackVolume,
  describePlaybackFailure,
  shouldRetryPlaybackFailure,
  classifyPlaybackSource,
  isPlayableMediaUrl,
  nextPlaybackRetry,
} from "../playback-policy";

describe("playback source classification", () => {
  it.each([
    "https://example.com/live/channel.m3u8",
    "https://example.com/live/channel.M3U8?token=abc",
    "//cdn.example.com/master.m3u8#quality",
    "relative/path/stream.m3u8?session=1",
  ])("recognises HLS manifests: %s", (source) => {
    expect(classifyPlaybackSource(source)).toBe("hls");
  });

  it.each([
    "https://example.com/live/channel.ts",
    "https://example.com/video.mp4",
    "udp://239.0.0.1:1234",
    "rtsp://example.com/live",
    "https://example.com/api?format=m3u8",
  ])("leaves non-manifest streams on the direct playback path: %s", (source) => {
    expect(classifyPlaybackSource(source)).toBe("direct");
  });

  it("classifies a 20k-channel source list without pathological slowdown", () => {
    const sources = Array.from({ length: 20_000 }, (_, index) =>
      index % 2 === 0
        ? `https://cdn.example.com/${index}/master.m3u8?token=${index}`
        : `https://cdn.example.com/${index}/stream.ts`,
    );
    const started = performance.now();
    const hlsCount = sources.filter((source) => classifyPlaybackSource(source) === "hls").length;
    const elapsed = performance.now() - started;

    expect(hlsCount).toBe(10_000);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("playable media URL gate", () => {
  it.each([
    "https://example.com/live/channel.m3u8",
    "http://192.168.1.10:8080/stream.ts",
    "blob:https://example.com/uuid-here",
  ])("accepts browser-playable schemes: %s", (source) => {
    expect(isPlayableMediaUrl(source)).toBe(true);
  });

  it.each([
    "",
    "rtmp://example.com/live",
    "rtsp://example.com/live",
    "udp://239.0.0.1:1234",
    "javascript:alert(1)",
    "data:text/html,<p>x</p>",
    "not a url",
  ])("rejects non-playable schemes: %s", (source) => {
    expect(isPlayableMediaUrl(source)).toBe(false);
  });
});
describe("playback retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(Array.from({ length: 5 }, (_, attempt) => nextPlaybackRetry(attempt))).toEqual([
      { retry: true, attempt: 1, delayMs: 1_000 },
      { retry: true, attempt: 2, delayMs: 2_000 },
      { retry: true, attempt: 3, delayMs: 4_000 },
      { retry: true, attempt: 4, delayMs: 8_000 },
      { retry: false, attempt: MAX_PLAYBACK_RETRIES, delayMs: 0 },
    ]);
  });

  it("fails closed for invalid counters and never schedules unbounded waits", () => {
    expect(nextPlaybackRetry(Number.POSITIVE_INFINITY).retry).toBe(false);
    expect(nextPlaybackRetry(-50)).toEqual({ retry: true, attempt: 1, delayMs: 1_000 });

    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      expect(nextPlaybackRetry(attempt).delayMs).toBeLessThanOrEqual(8_000);
    }
  });
});

describe("playback failure guidance", () => {
  it.each([401, 403])("does not retry denied access (%s)", (status) => {
    const failure = { kind: "network" as const, status };
    expect(shouldRetryPlaybackFailure(failure)).toBe(false);
    expect(describePlaybackFailure(failure)).toContain("Access to this stream was denied");
  });
  it.each([404, 410])("explains unavailable playlist links (%s)", (status) => {
    const failure = { kind: "network" as const, status };
    expect(shouldRetryPlaybackFailure(failure)).toBe(false);
    expect(describePlaybackFailure(failure)).toContain("Refresh your playlist");
  });
  it.each([0, 408, 429, 500, 502, 503, 504])(
    "allows bounded retries for transient network errors (%s)",
    (status) => {
      expect(shouldRetryPlaybackFailure({ kind: "network", status })).toBe(true);
    },
  );
  it.each([3, 4])("explains native decode/format failures (%s)", (mediaCode) => {
    const failure = { kind: "native" as const, mediaCode };
    expect(shouldRetryPlaybackFailure(failure)).toBe(false);
    expect(describePlaybackFailure(failure)).toContain("format is unsupported");
  });
  it("does not treat an aborted native request as a network retry", () => {
    expect(shouldRetryPlaybackFailure({ kind: "native", mediaCode: 1 })).toBe(false);
    expect(shouldRetryPlaybackFailure({ kind: "native", mediaCode: 2 })).toBe(true);
  });
  it("provides safe timeout and media guidance", () => {
    expect(describePlaybackFailure({ kind: "timeout" })).toContain("stopped responding");
    expect(describePlaybackFailure({ kind: "media" })).toContain("could not be decoded");
    expect(describePlaybackFailure({ kind: "network", status: 500 })).toContain(
      "Check your connection",
    );
  });
});

describe("persisted playback volume", () => {
  it.each([null, "", " ", "NaN", "Infinity", "broken", "0.5invalid"])(
    "falls back safely for %s",
    (value) => {
      expect(normalizePlaybackVolume(value)).toBe(0.8);
    },
  );
  it.each([
    ["0", 0],
    ["0.35", 0.35],
    ["1", 1],
    ["-5", 0],
    ["50", 1],
  ])("clamps valid values (%s)", (value, expected) => {
    expect(normalizePlaybackVolume(String(value))).toBe(expected);
  });
});
