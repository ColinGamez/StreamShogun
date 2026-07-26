import { describe, expect, it } from "vitest";
import {
  MAX_PLAYBACK_RETRIES,
  classifyPlaybackSource,
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
