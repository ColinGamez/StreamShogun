// ── XMLTV + EPG Index demo / runnable tests ───────────────────────────
//
// Run:  cd packages/core && npx tsx src/__demo__/xmltv-epg.demo.ts
//
// Tests parseXmltv, createEpgIndex, getNowNext, getRange, and
// parseXmltvTimestamp across various edge cases.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseXmltv, parseXmltvTimestamp } from "../xmltv-parser.js";
import { createEpgIndex, getNowNext, getRange } from "../epg-index.js";
import type { EpgIndex } from "../xmltv-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✔ ${label}`);
    passed++;
  } else {
    console.error(`  ✘ FAIL: ${label}`);
    failed++;
  }
}

function eq<T>(a: T, b: T, label: string): void {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    console.error(`    expected: ${JSON.stringify(b)}`);
    console.error(`    got:      ${JSON.stringify(a)}`);
  }
  assert(ok, label);
}

// ── Load sample data ──────────────────────────────────────────────────
const samplePath = resolve(__dirname, "../../data/sample.xmltv.xml");
const xmlText = readFileSync(samplePath, "utf-8");

// =====================================================================
// 1. parseXmltvTimestamp
// =====================================================================
console.log("\n1. parseXmltvTimestamp");
{
  // Standard XMLTV format, UTC
  const ts1 = parseXmltvTimestamp("20260302180000 +0000");
  eq(ts1, new Date("2026-03-02T18:00:00Z").getTime(), "UTC timestamp");

  // With positive timezone offset
  const ts2 = parseXmltvTimestamp("20260302060000 +0100");
  eq(ts2, new Date("2026-03-02T05:00:00Z").getTime(), "+0100 normalised to UTC");

  // With JST offset (+0900)
  const ts3 = parseXmltvTimestamp("20260302070000 +0900");
  eq(ts3, new Date("2026-03-01T22:00:00Z").getTime(), "+0900 normalised to UTC");

  // No timezone → assumed UTC
  const ts4 = parseXmltvTimestamp("20260302120000");
  eq(ts4, new Date("2026-03-02T12:00:00Z").getTime(), "no offset → UTC");

  // ISO 8601 fallback
  const ts5 = parseXmltvTimestamp("2026-03-02T18:00:00Z");
  eq(ts5, new Date("2026-03-02T18:00:00Z").getTime(), "ISO 8601 format");

  // Edge cases
  eq(parseXmltvTimestamp(null), 0, "null → 0");
  eq(parseXmltvTimestamp(""), 0, "empty string → 0");
  eq(parseXmltvTimestamp("garbage"), 0, "garbage → 0");
}

// =====================================================================
// 2. parseXmltv — sample file
// =====================================================================
console.log("\n2. parseXmltv — sample file");
{
  const result = parseXmltv(xmlText);

  eq(result.channels.length, 3, "3 channels parsed");
  eq(result.programmes.length, 14, "14 programmes parsed");

  // BBC One channel
  const bbc = result.channels.find((c) => c.id === "bbc1.uk")!;
  assert(!!bbc, "bbc1.uk channel found");
  eq(bbc.displayNames.length, 2, "BBC has 2 display names");
  eq(bbc.displayNames[0], "BBC One", "primary display name");
  eq(bbc.icon, "https://logo.example.com/bbc1.png", "icon URL");
  eq(bbc.url, "https://www.bbc.co.uk/bbcone", "channel URL");

  // NHK channel (Japanese name)
  const nhk = result.channels.find((c) => c.id === "nhk.jp")!;
  assert(nhk.displayNames.includes("NHK ワールド"), "Japanese display name preserved");

  // Programme attributes
  const huth = result.programmes.find((p) => p.titles[0] === "Homes Under the Hammer")!;
  assert(!!huth, "Homes Under the Hammer found");
  eq(huth.channelId, "bbc1.uk", "channelId");
  eq(huth.categories.length, 2, "2 categories");
  eq(huth.episodeNum, "14.7.", "xmltv_ns episode number");
  eq(huth.icon, "https://images.example.com/huth.jpg", "programme icon");
  eq(huth.rating, "7.2/10", "rating parsed");

  // Subtitle
  const doctors = result.programmes.find((p) => p.titles[0] === "Doctors")!;
  eq(doctors.subtitle, "A New Dawn", "subtitle parsed");
  eq(doctors.episodeNum, "S24E96", "onscreen episode number");
}

// =====================================================================
// 3. parseXmltv — edge cases
// =====================================================================
console.log("\n3. parseXmltv — edge cases");
{
  // Empty input
  const empty = parseXmltv("");
  eq(empty.channels.length, 0, "empty string → 0 channels");
  eq(empty.programmes.length, 0, "empty string → 0 programmes");

  // Minimal valid
  const minimal = parseXmltv(`<?xml version="1.0"?>
<tv>
  <channel id="test.1">
    <display-name>Test</display-name>
  </channel>
  <programme start="20260302120000 +0000" stop="20260302130000 +0000" channel="test.1">
    <title>Minimal</title>
  </programme>
</tv>`);
  eq(minimal.channels.length, 1, "minimal: 1 channel");
  eq(minimal.programmes.length, 1, "minimal: 1 programme");
  eq(minimal.programmes[0].titles[0], "Minimal", "minimal: title");

  // Missing fields don't crash
  const sparse = parseXmltv(`<?xml version="1.0"?>
<tv>
  <programme start="20260302120000" channel="x.1">
    <title>No Stop Time</title>
  </programme>
</tv>`);
  eq(sparse.programmes[0].stop, 0, "missing stop → 0");
  eq(sparse.programmes[0].subtitle, "", "missing subtitle → empty");
  eq(sparse.programmes[0].categories.length, 0, "missing categories → []");
}

// =====================================================================
// 4. createEpgIndex
// =====================================================================
console.log("\n4. createEpgIndex");
let index: EpgIndex;
{
  const { programmes } = parseXmltv(xmlText);
  index = createEpgIndex(programmes);

  assert(index instanceof Map, "returns a Map");
  eq(index.size, 3, "3 channel keys");

  const bbcProgs = index.get("bbc1.uk")!;
  assert(bbcProgs.length === 8, "8 BBC programmes in index");

  // Verify sorted by start time
  let sorted = true;
  for (let i = 1; i < bbcProgs.length; i++) {
    if (bbcProgs[i].start < bbcProgs[i - 1].start) {
      sorted = false;
      break;
    }
  }
  assert(sorted, "BBC programmes sorted by start time");

  // CNN programmes should be in UTC (offset-adjusted)
  const cnnProgs = index.get("cnn.us")!;
  eq(cnnProgs.length, 3, "3 CNN programmes");
  // "20260302060000 +0100" → 05:00 UTC
  eq(
    cnnProgs[0].start,
    new Date("2026-03-02T05:00:00Z").getTime(),
    "CNN first programme start in UTC",
  );
}

// =====================================================================
// 5. getNowNext
// =====================================================================
console.log("\n5. getNowNext");
{
  // 10:30 UTC — during "Homes Under the Hammer" (10:00–11:00)
  const at1030 = new Date("2026-03-02T10:30:00Z");
  const nn1 = getNowNext(index, "bbc1.uk", at1030);
  eq(nn1.now?.titles[0], "Homes Under the Hammer", "now = HUTH at 10:30");
  eq(nn1.next?.titles[0], "Bargain Hunt", "next = Bargain Hunt");

  // 05:00 UTC — before any BBC programme
  const at0500 = new Date("2026-03-02T05:00:00Z");
  const nn2 = getNowNext(index, "bbc1.uk", at0500);
  eq(nn2.now, undefined, "nothing airing at 05:00");
  eq(nn2.next?.titles[0], "BBC Breakfast", "next = BBC Breakfast");

  // 21:30 UTC — after last programme (EastEnders ends 21:00)
  const at2130 = new Date("2026-03-02T21:30:00Z");
  const nn3 = getNowNext(index, "bbc1.uk", at2130);
  eq(nn3.now, undefined, "nothing airing at 21:30");
  eq(nn3.next, undefined, "no next after all programmes");

  // Unknown channel
  const nn4 = getNowNext(index, "nonexistent.ch", at1030);
  eq(nn4.now, undefined, "unknown channel → no now");
  eq(nn4.next, undefined, "unknown channel → no next");
}

// =====================================================================
// 6. getRange
// =====================================================================
console.log("\n6. getRange");
{
  // Morning window 06:00–12:00 UTC for BBC
  const morning = getRange(
    index,
    "bbc1.uk",
    new Date("2026-03-02T06:00:00Z"),
    new Date("2026-03-02T12:00:00Z"),
  );
  // BBC Breakfast (06–07:30), Morning Live (07:30–10), HUTH (10–11), Bargain Hunt (11-12)
  eq(morning.length, 4, "4 programmes in 06:00–12:00 window");
  eq(morning[0].titles[0], "BBC Breakfast", "first = BBC Breakfast");
  eq(morning[3].titles[0], "Bargain Hunt", "last = Bargain Hunt");

  // Narrow window — just the 10:00 slot
  const narrow = getRange(
    index,
    "bbc1.uk",
    new Date("2026-03-02T10:15:00Z"),
    new Date("2026-03-02T10:45:00Z"),
  );
  eq(narrow.length, 1, "narrow window hits HUTH only");
  eq(narrow[0].titles[0], "Homes Under the Hammer", "HUTH in narrow range");

  // Full day for CNN
  const cnnDay = getRange(
    index,
    "cnn.us",
    new Date("2026-03-02T00:00:00Z"),
    new Date("2026-03-03T00:00:00Z"),
  );
  eq(cnnDay.length, 3, "all 3 CNN programmes in full day");

  // Empty channel
  const empty = getRange(
    index,
    "nonexistent.ch",
    new Date("2026-03-02T00:00:00Z"),
    new Date("2026-03-03T00:00:00Z"),
  );
  eq(empty.length, 0, "unknown channel → 0 results");

  // Window before any programmes
  const before = getRange(
    index,
    "bbc1.uk",
    new Date("2026-03-01T00:00:00Z"),
    new Date("2026-03-01T23:59:00Z"),
  );
  eq(before.length, 0, "day before → 0 results");
}

// =====================================================================
// 7. Timezone consistency
// =====================================================================
console.log("\n7. Timezone consistency across channels");
{
  // NHK "20260302070000 +0900" = 2026-03-01T22:00Z
  // NHK "20260302120000 +0900" = 2026-03-02T03:00Z
  const nhkProgs = index.get("nhk.jp")!;
  eq(
    nhkProgs[0].start,
    new Date("2026-03-01T22:00:00Z").getTime(),
    "NHK #1 start correctly UTC-normalised",
  );
  eq(
    nhkProgs[1].start,
    new Date("2026-03-02T03:00:00Z").getTime(),
    "NHK #2 start correctly UTC-normalised",
  );

  // getNowNext at 03:30Z should be during Japan Railway Journal
  const nn = getNowNext(index, "nhk.jp", new Date("2026-03-02T03:30:00Z"));
  eq(nn.now?.titles[0], "Japan Railway Journal", "NHK now at 03:30Z");
}

// ── Summary ───────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✔\n");
}
