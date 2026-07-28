import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    MASTER_EMAIL: "master@example.com",
    MASTER_JAPAN_BANGUMI_ENABLED: "true",
  },
}));

import { mergeXmltvDocuments, parseBangumiScheduleHtml } from "./master-epg-providers.js";

function scheduleHtml(programmeCount = 20): string {
  const channels = Array.from(
    { length: 5 },
    (_unused, index) =>
      `<li data-line='${index + 1}' class='channel js_channel active'><p>Channel ${index + 1}</p></li>`,
  ).join("");

  const programmes = Array.from({ length: programmeCount }, (_unused, index) => {
    const hour = String(index % 20).padStart(2, "0");
    const nextHour = String((index % 20) + 1).padStart(2, "0");
    return `<li data-extra="ok" e='20260721${nextHour}00' s='20260721${hour}00'>
      <a data-id="${index}" href='/tv_events/${index}'>
        <p data-role="title" class='featured program_title'>Show ${index}</p>
        <p class="program_detail muted">Description ${index}</p>
        <div class='gc-news program_time'>Time</div>
      </a>
    </li>`;
  }).join("");

  return `<div id="ch_area"><ul>${channels}</ul></div>
    <ul data-date="today" id='program_line_1'>${programmes}</ul>`;
}

describe("Bangumi G-Guide parser", () => {
  it("accepts reordered attributes, single quotes, and extra CSS classes", () => {
    const result = parseBangumiScheduleHtml(scheduleHtml());

    expect(result.channels).toHaveLength(5);
    expect(result.programmes).toHaveLength(20);
    expect(result.programmes[0]).toMatchObject({
      title: "Show 0",
      description: "Description 0",
      categories: ["ニュース"],
      start: "20260721000000 +0900",
      stop: "20260721010000 +0900",
      url: "https://bangumi.org/tv_events/0",
    });
  });

  it("rejects an upstream page that no longer contains programme data", () => {
    expect(() => parseBangumiScheduleHtml("<html><title>Maintenance</title></html>")).toThrow(
      "Bangumi returned only 0 programmes",
    );
  });

  it("rejects suspiciously partial schedules", () => {
    expect(() => parseBangumiScheduleHtml(scheduleHtml(3))).toThrow(
      "Bangumi returned only 3 programmes",
    );
  });
});

describe("Master XMLTV merge", () => {
  it("combines Japan and Korea channels and programmes under one XMLTV root", () => {
    const japan = `<?xml version="1.0"?><tv><channel id="jp-1"><display-name>JP One</display-name></channel><programme channel="jp-1" start="20260728000000 +0900" stop="20260728010000 +0900"><title>Japan</title></programme></tv>`;
    const korea = `<?xml version="1.0"?><tv><channel id="kr-1"><display-name>KR One</display-name></channel><programme channel="kr-1" start="20260728000000 +0900" stop="20260728010000 +0900"><title>Korea</title></programme></tv>`;

    const merged = mergeXmltvDocuments([japan, korea], "Japan + Korea");

    expect(merged.match(/<tv\b/g)).toHaveLength(1);
    expect(merged).toContain('channel id="jp-1"');
    expect(merged).toContain('channel id="kr-1"');
    expect(merged).toContain("<title>Japan</title>");
    expect(merged).toContain("<title>Korea</title>");
  });

  it("rejects malformed source documents", () => {
    expect(() => mergeXmltvDocuments(["not xmltv"], "Combined")).toThrow(
      "Cannot merge invalid XMLTV document",
    );
  });
});
