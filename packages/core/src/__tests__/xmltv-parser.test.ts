import { describe, expect, it } from "vitest";
import { parseXmltv, parseXmltvTimestamp } from "../xmltv-parser";

describe("parseXmltvTimestamp", () => {
  it("parses native XMLTV timestamps with a UTC offset", () => {
    // 2026-03-02 18:00:00 at +0100 == 17:00:00Z
    expect(parseXmltvTimestamp("20260302180000 +0100")).toBe(Date.UTC(2026, 2, 2, 17, 0, 0));
  });

  it("parses negative UTC offsets", () => {
    // 2026-03-02 18:00:00 at -0500 == 23:00:00Z
    expect(parseXmltvTimestamp("20260302180000 -0500")).toBe(Date.UTC(2026, 2, 2, 23, 0, 0));
  });

  it("treats offset-less native timestamps as UTC", () => {
    expect(parseXmltvTimestamp("20260302180000")).toBe(Date.UTC(2026, 2, 2, 18, 0, 0));
  });

  it("parses ISO 8601 fallbacks", () => {
    expect(parseXmltvTimestamp("2026-03-02T18:00:00Z")).toBe(Date.UTC(2026, 2, 2, 18, 0, 0));
  });

  it("returns 0 for missing or unparseable values", () => {
    expect(parseXmltvTimestamp(undefined)).toBe(0);
    expect(parseXmltvTimestamp(null)).toBe(0);
    expect(parseXmltvTimestamp("")).toBe(0);
    expect(parseXmltvTimestamp("not a date")).toBe(0);
    expect(parseXmltvTimestamp("2026-13-99T99:99:99Z")).toBe(0);
  });
});

const DOC = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ch1">
    <display-name>Channel One</display-name>
    <display-name>Channel One HD</display-name>
    <icon src="https://example.com/ch1.png"/>
    <url>https://example.com</url>
  </channel>
  <programme channel="ch1" start="20260302200000 +0000" stop="20260302210000 +0000">
    <title>Evening News</title>
    <title lang="ja">イブニングニュース</title>
    <sub-title>Day 5</sub-title>
    <desc>Top stories.</desc>
    <category>News</category>
    <category>Current Affairs</category>
    <episode-num system="onscreen">S01E05</episode-num>
    <episode-num system="xmltv_ns">0.4.0/1</episode-num>
    <icon src="https://example.com/news.png"/>
    <rating system="MPAA"><value>TV-PG</value></rating>
  </programme>
</tv>`;

describe("parseXmltv", () => {
  it("returns empty results for blank input", () => {
    expect(parseXmltv("")).toEqual({ channels: [], programmes: [] });
    expect(parseXmltv("   \n  ")).toEqual({ channels: [], programmes: [] });
  });

  it("throws with line info on malformed XML", () => {
    expect(() => parseXmltv("<tv><channel></tv>")).toThrow(/Invalid XMLTV/);
  });

  it("extracts channels with display names, icon, and url", () => {
    const { channels } = parseXmltv(DOC);
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual({
      id: "ch1",
      displayNames: ["Channel One", "Channel One HD"],
      icon: "https://example.com/ch1.png",
      url: "https://example.com",
    });
  });

  it("extracts programmes with normalized UTC timestamps", () => {
    const { programmes } = parseXmltv(DOC);
    expect(programmes).toHaveLength(1);
    const p = programmes[0];
    expect(p.channelId).toBe("ch1");
    expect(p.start).toBe(Date.UTC(2026, 2, 2, 20, 0, 0));
    expect(p.stop).toBe(Date.UTC(2026, 2, 2, 21, 0, 0));
    expect(p.titles).toEqual(["Evening News", "イブニングニュース"]);
    expect(p.subtitle).toBe("Day 5");
    expect(p.description).toBe("Top stories.");
    expect(p.categories).toEqual(["News", "Current Affairs"]);
    expect(p.icon).toBe("https://example.com/news.png");
    expect(p.rating).toBe("TV-PG");
  });

  it("prefers the first recognized episode-num system", () => {
    const { programmes } = parseXmltv(DOC);
    // onscreen appears first in the document and is a recognized system
    expect(programmes[0].episodeNum).toBe("S01E05");
  });

  it("handles a single channel/programme without arrays", () => {
    const single = `<tv><channel id="x"><display-name>X</display-name></channel><programme channel="x" start="20260302120000" stop="20260302123000"><title>Solo</title></programme></tv>`;
    const { channels, programmes } = parseXmltv(single);
    expect(channels).toHaveLength(1);
    expect(programmes).toHaveLength(1);
    expect(programmes[0].start).toBe(Date.UTC(2026, 2, 2, 12, 0, 0));
  });

  it("tolerates missing optional elements", () => {
    const sparse = `<tv><channel id="y"></channel><programme channel="y" start="20260302120000" stop="20260302123000"></programme></tv>`;
    const { channels, programmes } = parseXmltv(sparse);
    expect(channels[0]).toMatchObject({ id: "y", displayNames: [], icon: "", url: "" });
    expect(programmes[0]).toMatchObject({
      titles: [],
      subtitle: "",
      description: "",
      categories: [],
      episodeNum: "",
      rating: "",
    });
  });

  it("accepts a lowercase-free <TV> root variant", () => {
    const { channels } = parseXmltv(
      `<TV><channel id="z"><display-name>Zed</display-name></channel></TV>`,
    );
    expect(channels[0].id).toBe("z");
  });
});
