import { describe, expect, it } from "vitest";
import {
  mergeEpgSources,
  serializeMergedEpg,
  type EpgSourceBatch,
  type Programme,
} from "../index.js";

const BASE = Date.UTC(2026, 7, 1, 12, 0, 0);
const MIN = 60_000;

function programme(channelId: string, startMin: number, stopMin: number, title: string): Programme {
  return {
    channelId,
    start: BASE + startMin * MIN,
    stop: BASE + stopMin * MIN,
    titles: [title],
    subtitle: "",
    description: "",
    categories: [],
    episodeNum: "",
    icon: "",
    rating: "",
  };
}

function batch(sourceId: string, programmes: Programme[]): EpgSourceBatch {
  return { sourceId, sourceName: `Name-${sourceId}`, programmes };
}

describe("mergeEpgSources overlap resolution", () => {
  it("keeps the head of a lower-priority programme when the winner starts mid-way", () => {
    const merged = mergeEpgSources([
      batch("low", [programme("ch", 0, 60, "Long Show")]),
      batch("high", [programme("ch", 30, 60, "Priority Show")]),
    ]);

    const progs = merged.get("ch");
    expect(progs).toHaveLength(2);
    expect(progs?.[0]).toMatchObject({
      titles: ["Long Show"],
      start: BASE,
      stop: BASE + 30 * MIN, // trimmed at the overlap
      sourceId: "low",
      sourceName: "Name-low",
    });
    expect(progs?.[1]).toMatchObject({ titles: ["Priority Show"], sourceId: "high" });
  });

  it("drops a lower-priority programme fully inside a higher-priority one", () => {
    const merged = mergeEpgSources([
      batch("low", [programme("ch", 20, 40, "Filler")]),
      batch("high", [programme("ch", 0, 60, "Main Event")]),
    ]);

    expect(merged.get("ch")?.map((p) => p.titles[0])).toEqual(["Main Event"]);
  });

  it("replaces an equal-start lower-priority programme entirely", () => {
    const merged = mergeEpgSources([
      batch("low", [programme("ch", 0, 30, "Old")]),
      batch("high", [programme("ch", 0, 60, "New")]),
    ]);

    const progs = merged.get("ch");
    expect(progs).toHaveLength(1);
    expect(progs?.[0].titles[0]).toBe("New");
  });

  it("keeps the first of two overlapping programmes from the same source", () => {
    const merged = mergeEpgSources([
      batch("solo", [programme("ch", 0, 60, "First"), programme("ch", 30, 90, "Dupe")]),
    ]);

    expect(merged.get("ch")?.map((p) => p.titles[0])).toEqual(["First"]);
  });

  it("treats a missing stop as a 30-minute slot when detecting overlaps", () => {
    const untimed: Programme = { ...programme("ch", 0, 0, "Untimed"), stop: 0 };
    const merged = mergeEpgSources([
      batch("low", [untimed]),
      batch("high", [programme("ch", 20, 50, "Timed")]),
    ]);

    // 20 min in overlaps the default 30-min window, so the head is trimmed.
    const progs = merged.get("ch");
    expect(progs).toHaveLength(2);
    expect(progs?.[0]).toMatchObject({ titles: ["Untimed"], stop: BASE + 20 * MIN });
    expect(progs?.[1].titles[0]).toBe("Timed");
  });

  it("filters out backwards (stop ≤ start) programmes", () => {
    const backwards = programme("ch", 60, 30, "Broken");
    const merged = mergeEpgSources([batch("solo", [programme("ch", 0, 30, "Good"), backwards])]);

    expect(merged.get("ch")?.map((p) => p.titles[0])).toEqual(["Good"]);
  });

  it("sorts each channel by start time regardless of input order", () => {
    const merged = mergeEpgSources([
      batch("solo", [programme("ch", 60, 90, "Later"), programme("ch", 0, 30, "Earlier")]),
    ]);

    expect(merged.get("ch")?.map((p) => p.titles[0])).toEqual(["Earlier", "Later"]);
  });

  it("keeps channels independent and serialises to a plain object", () => {
    const merged = mergeEpgSources([
      batch("a", [programme("ch1", 0, 30, "One"), programme("ch2", 0, 30, "Two")]),
    ]);

    const obj = serializeMergedEpg(merged);
    expect(Object.keys(obj).sort()).toEqual(["ch1", "ch2"]);
    expect(obj.ch1[0].titles[0]).toBe("One");
    expect(obj.ch2[0].titles[0]).toBe("Two");
  });
});
