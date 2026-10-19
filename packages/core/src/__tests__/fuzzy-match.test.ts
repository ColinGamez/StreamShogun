import { describe, expect, it } from "vitest";
import { matchChannelsToEpg, normaliseChannelName } from "../index.js";

function channel(url: string, tvgId: string, name: string) {
  return { url, tvgId, name };
}

describe("normaliseChannelName", () => {
  it("strips quality suffixes, punctuation, and case", () => {
    expect(normaliseChannelName("BBC One HD")).toBe("bbc one");
    expect(normaliseChannelName("Channel 5 +1")).toBe("channel 5");
    expect(normaliseChannelName("ITV (4K)")).toBe("itv");
    expect(normaliseChannelName("A&E  Networks")).toBe("ae networks");
  });
});

describe("matchChannelsToEpg ladder", () => {
  it("prefers an exact tvg-id match at confidence 1", () => {
    const [m] = matchChannelsToEpg(
      [channel("http://s/1", "bbc.one.uk", "Something Entirely Different")],
      ["bbc.one.uk"],
    );
    expect(m).toMatchObject({
      epgChannelId: "bbc.one.uk",
      method: "exact-id",
      confidence: 1,
    });
  });

  it("matches a normalised tvg-id against a punctuated EPG id at 0.95", () => {
    const [m] = matchChannelsToEpg([channel("http://s/1", "bbc-one", "ignored")], ["bbc.one"]);
    expect(m).toMatchObject({
      epgChannelId: "bbc.one",
      method: "normalised-name",
      confidence: 0.95,
    });
  });

  it("matches a normalised display name at 0.9, trying every alias", () => {
    const names = new Map([["id.bbc1", ["BBC One", "BBC1"]]]);
    const [hd, alias] = matchChannelsToEpg(
      [channel("http://s/1", "", "BBC One HD"), channel("http://s/2", "", "BBC1")],
      ["id.bbc1"],
      names,
    );
    expect(hd).toMatchObject({
      epgChannelId: "id.bbc1",
      method: "normalised-name",
      confidence: 0.9,
    });
    expect(alias.epgChannelId).toBe("id.bbc1");
  });

  it("falls through to fuzzy matching at the 0.5 Jaccard threshold", () => {
    const names = new Map([["id.news", ["BBC News"]]]);
    const [m] = matchChannelsToEpg([channel("http://s/1", "", "BBC News 24")], ["id.news"], names);
    // tokens {bbc,news,24} vs {bbc,news} → 2/3
    expect(m).toMatchObject({ epgChannelId: "id.news", method: "fuzzy", confidence: 0.67 });
  });

  it("returns method none below the threshold instead of guessing", () => {
    const names = new Map([["id.cnn", ["CNN Headline News"]]]);
    const [m] = matchChannelsToEpg(
      [channel("http://s/1", "", "CNN International")],
      ["id.cnn"],
      names,
    );
    // 1/4 tokens → below 0.5
    expect(m).toMatchObject({ epgChannelId: "", method: "none", confidence: 0 });
  });

  it("never matches a channel whose name normalises to nothing", () => {
    const names = new Map([["id.hd", ["Some Channel"]]]);
    const [m] = matchChannelsToEpg([channel("http://s/1", "", "HD")], ["id.hd"], names);
    expect(m.method).toBe("none");
    expect(m.epgChannelId).toBe("");
  });

  it("exact-id wins even when a fuzzy alternative exists", () => {
    const names = new Map([["id.other", ["BBC One"]]]);
    const [m] = matchChannelsToEpg(
      [channel("http://s/1", "bbc.one.uk", "BBC One")],
      ["bbc.one.uk", "id.other"],
      names,
    );
    expect(m).toMatchObject({ epgChannelId: "bbc.one.uk", method: "exact-id" });
  });
});
