import { describe, expect, it } from "vitest";
import {
  createEpgIndex,
  getNowNext,
  getRange,
  mergeEpgSources,
  parseXmltv,
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
});
