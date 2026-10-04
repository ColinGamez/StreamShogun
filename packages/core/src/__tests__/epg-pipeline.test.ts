import { describe, expect, it } from "vitest";
import {
  createEpgIndex,
  getNowNext,
  getRange,
  matchChannelsToEpg,
  mergeEpgSources,
  parseXmltv,
  parseXmltvTimestamp,
  type Programme,
} from "../index.js";

function programme(channelId: string, start: number, stop: number, title: string): Programme {
  return {
    channelId,
    start,
    stop,
    titles: [title],
    subtitle: "",
    description: "",
    categories: [],
    episodeNum: "",
    icon: "",
    rating: "",
  };
}

describe("EPG pipeline", () => {
  it("rejects structurally corrupt XMLTV instead of importing partial garbage", () => {
    expect(() => parseXmltv('<tv><channel id="news"><display-name>News</tv>')).toThrow();
  });

  it("parses XMLTV channels with missing icons and sparse programme metadata", () => {
    const result = parseXmltv(`<?xml version="1.0" encoding="UTF-8"?>
      <tv>
        <channel id="news"><display-name>News</display-name></channel>
        <programme channel="news" start="20260726100000 +0000" stop="20260726103000 +0000">
          <title>Morning Update</title>
        </programme>
      </tv>`);

    expect(result.channels).toEqual([{ id: "news", displayNames: ["News"], icon: "", url: "" }]);
    expect(result.programmes[0]).toMatchObject({
      channelId: "news",
      titles: ["Morning Update"],
      icon: "",
      description: "",
    });
  });

  it("sorts programmes and returns correct now, next, and overlapping ranges", () => {
    const base = Date.UTC(2026, 6, 26, 10, 0, 0);
    const items = [
      programme("news", base + 60_000, base + 120_000, "Second"),
      programme("news", base, base + 60_000, "First"),
      programme("news", base + 120_000, base + 180_000, "Third"),
    ];
    const index = createEpgIndex(items);

    expect(getNowNext(index, "news", new Date(base + 30_000))).toMatchObject({
      now: { titles: ["First"] },
      next: { titles: ["Second"] },
    });
    expect(
      getRange(index, "news", new Date(base + 30_000), new Date(base + 150_000)).map(
        (item) => item.titles[0],
      ),
    ).toEqual(["First", "Second", "Third"]);
  });

  it("lets the later XMLTV provider win overlapping guide data", () => {
    const base = Date.UTC(2026, 6, 26, 10, 0, 0);
    const merged = mergeEpgSources([
      {
        sourceId: "primary",
        sourceName: "Primary",
        programmes: [programme("news", base, base + 60 * 60_000, "Generic News")],
      },
      {
        sourceId: "preferred",
        sourceName: "Preferred",
        programmes: [programme("news", base, base + 60 * 60_000, "Local News")],
      },
    ]);

    expect(merged.get("news")).toHaveLength(1);
    expect(merged.get("news")?.[0]).toMatchObject({
      titles: ["Local News"],
      sourceId: "preferred",
    });
  });

  it("indexes 100,000 programmes within the release performance budget", () => {
    const base = Date.UTC(2026, 6, 26);
    const items = Array.from({ length: 100_000 }, (_, index) =>
      programme(
        `channel-${index % 20_000}`,
        base + Math.floor(index / 20_000) * 30 * 60_000,
        base + (Math.floor(index / 20_000) + 1) * 30 * 60_000,
        `Programme ${index}`,
      ),
    );
    const startedAt = performance.now();
    const index = createEpgIndex(items);
    const elapsedMs = performance.now() - startedAt;

    expect(index.size).toBe(20_000);
    expect(index.get("channel-0")).toHaveLength(5);
    expect(elapsedMs).toBeLessThan(2_500);
  });

  it("parses negative-UTC-offset XMLTV timestamps instead of dropping them", () => {
    // 18:00 at -0500 == 23:00 UTC
    expect(parseXmltvTimestamp("20260302180000 -0500")).toBe(Date.UTC(2026, 2, 2, 23, 0, 0));
    expect(parseXmltvTimestamp("20260302180000 +0100")).toBe(Date.UTC(2026, 2, 2, 17, 0, 0));
    expect(parseXmltvTimestamp("2026-03-02T18:00:00Z")).toBe(Date.UTC(2026, 2, 2, 18, 0, 0));
  });

  it("includes long-running programmes that started before the window", () => {
    const base = Date.UTC(2026, 6, 26, 10, 0, 0);
    const items = [
      programme("news", base - 3 * 60_000, base + 27 * 60_000, "Morning Show"),
      programme("news", base + 30_000, base + 90_000, "Flash"),
      programme("news", base + 60_000, base + 120_000, "Second"),
    ];
    const index = createEpgIndex(items);

    expect(
      getRange(index, "news", new Date(base), new Date(base + 60_000)).map((p) => p.titles[0]),
    ).toEqual(["Morning Show", "Flash"]);
  });

  it("never fuzzy-matches nameless channels to nameless guide entries", () => {
    const matches = matchChannelsToEpg(
      [{ url: "https://example.test/hd.m3u8", tvgId: "", name: "HD" }],
      ["HD"],
      new Map([["HD", ["HD"]]]),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].method).toBe("none");
    expect(matches[0].epgChannelId).toBe("");
  });
});
