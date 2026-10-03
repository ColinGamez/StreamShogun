import { describe, expect, it } from "vitest";
import { parseM3U } from "../m3u-parser.js";

function makePlaylist(channelCount: number): string {
  const lines = ['#EXTM3U x-tvg-url="https://example.test/guide.xml"'];
  for (let i = 0; i < channelCount; i += 1) {
    const logo = i % 3 === 0 ? "" : `https://img.example.test/${i}.png`;
    lines.push(
      `#EXTINF:-1 tvg-id="channel-${i}" tvg-name="Channel ${i}" tvg-logo="${logo}" group-title="Group ${i % 40}",Channel ${i}`,
      `https://stream.example.test/live/${i}/index.m3u8`,
    );
  }
  return lines.join("\n");
}

describe("parseM3U", () => {
  it("parses metadata, missing logos, groups, and header EPG sources", () => {
    const result = parseM3U(makePlaylist(3));

    expect(result.channels).toHaveLength(3);
    expect(result.epgSources).toEqual([
      { url: "https://example.test/guide.xml", label: "x-tvg-url" },
    ]);
    expect(result.channels[0]).toMatchObject({
      tvgId: "channel-0",
      name: "Channel 0",
      tvgLogo: "",
      groupTitle: "Group 0",
    });
    expect(result.channels[1].tvgLogo).toBe("https://img.example.test/1.png");
  });

  it("accepts bare HLS, MPEG-TS, RTSP, UDP, and CRLF playlists", () => {
    const result = parseM3U(
      [
        "#EXTM3U",
        "https://example.test/live.m3u8",
        "https://example.test/live.ts",
        "rtsp://example.test/live",
        "udp://239.0.0.1:1234",
      ].join("\r\n"),
    );

    expect(result.channels.map((channel) => channel.url)).toEqual([
      "https://example.test/live.m3u8",
      "https://example.test/live.ts",
      "rtsp://example.test/live",
      "udp://239.0.0.1:1234",
    ]);
  });

  it("reports malformed input without attaching stale metadata to a later URL", () => {
    const result = parseM3U(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="stale",Stale Channel',
        "this is not a stream",
        "https://example.test/good.m3u8",
      ].join("\n"),
    );

    expect(result.malformedLines).toEqual(["L3: this is not a stream"]);
    expect(result.channels[0]).toMatchObject({
      tvgId: "",
      name: "Unnamed Channel",
      url: "https://example.test/good.m3u8",
    });
  });

  it("parses 20,000 channels within the release performance budget", () => {
    const input = makePlaylist(20_000);
    const startedAt = performance.now();
    const result = parseM3U(input);
    const elapsedMs = performance.now() - startedAt;

    expect(result.channels).toHaveLength(20_000);
    expect(result.channels[19_999].name).toBe("Channel 19999");
    expect(elapsedMs).toBeLessThan(2_500);
  });

  it("deduplicates repeated stream URLs before persistence", () => {
    const result = parseM3U(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="news-a",News A',
        "https://example.test/news.m3u8",
        '#EXTINF:-1 tvg-id="news-b",News B duplicate',
        "https://example.test/news.m3u8",
        "https://example.test/news.m3u8",
      ].join("\n"),
    );

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toMatchObject({ tvgId: "news-a", name: "News A" });
  });
});
