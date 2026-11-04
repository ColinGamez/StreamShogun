import { describe, expect, it } from "vitest";
import { createEpgIndex, getNowNext, getRange, type Programme } from "../index.js";

const BASE = Date.UTC(2026, 7, 1, 12, 0, 0);
const MIN = 60_000;

function programme(channelId: string, startMin: number, stopMin: number, title: string): Programme {
  return {
    channelId,
    start: BASE + startMin * MIN,
    stop: stopMin === 0 ? 0 : BASE + stopMin * MIN,
    titles: [title],
    subtitle: "",
    description: "",
    categories: [],
    episodeNum: "",
    icon: "",
    rating: "",
  };
}

describe("createEpgIndex", () => {
  it("groups programmes per channel and sorts each channel by start", () => {
    const index = createEpgIndex([
      programme("a", 30, 60, "A2"),
      programme("b", 0, 30, "B1"),
      programme("a", 0, 30, "A1"),
    ]);

    expect(index.get("a")?.map((p) => p.titles[0])).toEqual(["A1", "A2"]);
    expect(index.get("b")?.map((p) => p.titles[0])).toEqual(["B1"]);
  });
});

describe("getNowNext", () => {
  it("returns empty for unknown or empty channels", () => {
    const index = createEpgIndex([programme("a", 0, 30, "A1")]);
    expect(getNowNext(index, "missing", new Date(BASE))).toEqual({});
    index.set("empty", []);
    expect(getNowNext(index, "empty", new Date(BASE))).toEqual({});
  });

  it("treats the first programme as next when everything is in the future", () => {
    const index = createEpgIndex([programme("a", 60, 90, "Later")]);
    expect(getNowNext(index, "a", new Date(BASE))).toMatchObject({
      now: undefined,
      next: { titles: ["Later"] },
    });
  });

  it("keeps a programme with no recorded stop time (stop = 0) as now", () => {
    const index = createEpgIndex([
      programme("a", 0, 0, "Open Ended"),
      programme("a", 60, 90, "Later"),
    ]);
    expect(getNowNext(index, "a", new Date(BASE + 30 * MIN))).toMatchObject({
      now: { titles: ["Open Ended"] },
      next: { titles: ["Later"] },
    });
  });

  it("moves to next at the exact stop boundary (stop is exclusive)", () => {
    const index = createEpgIndex([
      programme("a", 0, 30, "First"),
      programme("a", 30, 60, "Second"),
    ]);
    // At t=30 "Second" starts, so lowerBound lands on it and it is airing.
    expect(getNowNext(index, "a", new Date(BASE + 30 * MIN))).toMatchObject({
      now: { titles: ["Second"] },
      next: undefined,
    });
  });

  it("reports a gap as no current programme with the following one as next", () => {
    const index = createEpgIndex([
      programme("a", 0, 30, "First"),
      programme("a", 60, 90, "After Gap"),
    ]);
    expect(getNowNext(index, "a", new Date(BASE + 45 * MIN))).toMatchObject({
      now: undefined,
      next: { titles: ["After Gap"] },
    });
  });

  it("returns no next after the final programme", () => {
    const index = createEpgIndex([programme("a", 0, 30, "Only")]);
    expect(getNowNext(index, "a", new Date(BASE + 10 * MIN))).toMatchObject({
      now: { titles: ["Only"] },
      next: undefined,
    });
  });
});

describe("getRange", () => {
  it("returns an empty window instead of crashing when every programme starts later", () => {
    // Regression: lowerBound returns -1 here; the scan must not read progs[-1].
    const index = createEpgIndex([programme("a", 120, 180, "Late Show")]);
    expect(getRange(index, "a", new Date(BASE), new Date(BASE + 30 * MIN))).toEqual([]);
  });

  it("returns empty for unknown channels and windows after all programmes", () => {
    const index = createEpgIndex([programme("a", 0, 30, "Early")]);
    expect(getRange(index, "missing", new Date(BASE), new Date(BASE + 30 * MIN))).toEqual([]);
    expect(getRange(index, "a", new Date(BASE + 60 * MIN), new Date(BASE + 90 * MIN))).toEqual([]);
  });

  it("excludes a programme starting exactly at the window end", () => {
    const index = createEpgIndex([
      programme("a", 0, 30, "Inside"),
      programme("a", 60, 90, "At End"),
    ]);
    expect(
      getRange(index, "a", new Date(BASE), new Date(BASE + 60 * MIN)).map((p) => p.titles[0]),
    ).toEqual(["Inside"]);
  });

  it("excludes a programme ending exactly at the window start", () => {
    const index = createEpgIndex([
      programme("a", 0, 30, "Before"),
      programme("a", 30, 60, "Inside"),
    ]);
    expect(
      getRange(index, "a", new Date(BASE + 30 * MIN), new Date(BASE + 60 * MIN)).map(
        (p) => p.titles[0],
      ),
    ).toEqual(["Inside"]);
  });

  it("treats programmes with unknown stop (stop = 0) as overlapping once started", () => {
    const index = createEpgIndex([
      programme("a", 0, 0, "Open Ended"),
      programme("a", 90, 120, "Later"),
    ]);
    expect(
      getRange(index, "a", new Date(BASE + 30 * MIN), new Date(BASE + 60 * MIN)).map(
        (p) => p.titles[0],
      ),
    ).toEqual(["Open Ended"]);
  });
});
