// ── parseM3U demo / runnable tests ────────────────────────────────────
//
// Run:  npx tsx packages/core/src/__demo__/m3u-parser.demo.ts
//
// Each section exercises a different aspect of the parser.
// A non-zero exit code means something failed.

import { parseM3U } from "../m3u-parser.js";
import type { Channel, Playlist } from "../iptv-types.js";

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

// ── 1. Standard playlist ──────────────────────────────────────────────
console.log("\n1. Standard playlist with header + channels");
{
  const m3u = `#EXTM3U x-tvg-url="https://epg.example.com/guide.xml"
#EXTINF:-1 tvg-id="BBC1.uk" tvg-name="BBC One" tvg-logo="https://logo.com/bbc1.png" group-title="UK News",BBC One HD
https://stream.example.com/bbc1.m3u8
#EXTINF:-1 tvg-id="CNN.us" tvg-name="CNN" tvg-logo="https://logo.com/cnn.png" group-title="US News",CNN International
https://stream.example.com/cnn.m3u8
`;

  const p: Playlist = parseM3U(m3u);

  eq(p.channels.length, 2, "parses 2 channels");
  eq(p.epgSources.length, 1, "extracts 1 EPG source");
  eq(p.epgSources[0].url, "https://epg.example.com/guide.xml", "EPG URL correct");

  const ch0: Channel = p.channels[0];
  eq(ch0.tvgId, "BBC1.uk", "tvg-id");
  eq(ch0.tvgName, "BBC One", "tvg-name");
  eq(ch0.name, "BBC One HD", "display name from EXTINF");
  eq(ch0.tvgLogo, "https://logo.com/bbc1.png", "tvg-logo");
  eq(ch0.groupTitle, "UK News", "group-title");
  eq(ch0.url, "https://stream.example.com/bbc1.m3u8", "stream URL");
  eq(ch0.duration, -1, "duration -1 for live");
}

// ── 2. Name fallback logic ────────────────────────────────────────────
console.log("\n2. Name fallback logic");
{
  // No display name after comma → fall back to tvg-name
  const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="TEST.1" tvg-name="Fallback Name",
https://stream.example.com/a.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels[0].name, "Fallback Name", "falls back to tvg-name when display name empty");
}
{
  // No tvg-name either → fall back to tvg-id
  const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="CHAN.ID",
https://stream.example.com/b.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels[0].name, "CHAN.ID", "falls back to tvg-id when tvg-name absent");
}
{
  // No attributes at all → "Unnamed Channel"
  const m3u = `#EXTM3U
#EXTINF:-1,
https://stream.example.com/c.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels[0].name, "Unnamed Channel", "falls back to 'Unnamed Channel'");
}

// ── 3. Bare URLs without #EXTINF ─────────────────────────────────────
console.log("\n3. Bare URLs without EXTINF");
{
  const m3u = `#EXTM3U
https://stream.example.com/bare1.m3u8
https://stream.example.com/bare2.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels.length, 2, "picks up 2 bare URLs");
  eq(p.channels[0].name, "Unnamed Channel", "bare URL → Unnamed Channel");
  eq(p.channels[1].url, "https://stream.example.com/bare2.m3u8", "second bare URL captured");
}

// ── 4. CRLF and mixed line endings ───────────────────────────────────
console.log("\n4. CRLF / mixed line endings");
{
  const m3u = '#EXTM3U\r\n#EXTINF:-1 tvg-name="Test",Test Channel\r\nhttps://a.com/s.m3u8\r\n';
  const p = parseM3U(m3u);
  eq(p.channels.length, 1, "handles CRLF");
  eq(p.channels[0].name, "Test Channel", "name parsed through CRLF");
}
{
  const m3u = "#EXTM3U\r#EXTINF:-1,CR Only\rhttps://a.com/cr.m3u8\r";
  const p = parseM3U(m3u);
  eq(p.channels.length, 1, "handles bare CR line endings");
}

// ── 5. Extra whitespace / indentation ────────────────────────────────
console.log("\n5. Whitespace normalisation");
{
  const m3u = `#EXTM3U

   #EXTINF:-1   tvg-id="X"  tvg-name="Spaced"  ,  Spaced Channel  
   https://stream.example.com/spaced.m3u8   

`;
  const p = parseM3U(m3u);
  eq(p.channels.length, 1, "parses through extra whitespace");
  eq(p.channels[0].name, "Spaced Channel", "name trimmed");
}

// ── 6. Unknown directives are silently skipped ───────────────────────
console.log("\n6. Unknown directives");
{
  const m3u = `#EXTM3U
#EXTVLCOPT:http-user-agent=Mozilla/5.0
#EXTINF:-1,Good Channel
https://stream.example.com/good.m3u8
#KODIPROP:inputstream=inputstream.ffmpegdirect
#EXTINF:-1,Another Channel
https://stream.example.com/another.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels.length, 2, "unknown directives don't break parsing");
  eq(p.malformedLines.length, 0, "no malformed lines");
}

// ── 7. Malformed lines tracked ───────────────────────────────────────
console.log("\n7. Malformed / garbage lines");
{
  const m3u = `#EXTM3U
#EXTINF:-1,Good
https://stream.example.com/ok.m3u8
this is not a valid line at all
another garbage line
#EXTINF:-1,Also Good
https://stream.example.com/ok2.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels.length, 2, "good channels still parsed");
  eq(p.malformedLines.length, 2, "2 malformed lines recorded");
  assert(p.malformedLines[0].includes("this is not a valid line"), "malformed content captured");
}

// ── 8. Multiple EPG sources ──────────────────────────────────────────
console.log("\n8. Multiple EPG sources");
{
  const m3u = `#EXTM3U x-tvg-url="https://epg1.com/g.xml" url-tvg="https://epg2.com/g.xml"
#EXTINF:-1,Ch1
https://s.com/1.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.epgSources.length, 2, "picks up 2 EPG sources from different attrs");
}

// ── 9. Extra attributes preserved ────────────────────────────────────
console.log("\n9. Extra / custom attributes");
{
  const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="X" tvg-shift="+1" catchup="default" catchup-source="https://catch.up/{start}",Custom Attrs
https://stream.example.com/custom.m3u8
`;
  const p = parseM3U(m3u);
  const extras = p.channels[0].extras;
  eq(extras["tvg-shift"], "+1", "tvg-shift in extras");
  eq(extras["catchup"], "default", "catchup in extras");
  eq(extras["catchup-source"], "https://catch.up/{start}", "catchup-source in extras");
}

// ── 10. Various stream URL protocols ─────────────────────────────────
console.log("\n10. Various stream protocols");
{
  const m3u = `#EXTM3U
#EXTINF:-1,RTMP Stream
rtmp://live.example.com/stream/key
#EXTINF:-1,UDP Stream
udp://@239.0.0.1:1234
#EXTINF:-1,RTSP Stream
rtsp://cam.example.com/live
`;
  const p = parseM3U(m3u);
  eq(p.channels.length, 3, "all 3 protocol URLs parsed");
  eq(p.channels[0].url, "rtmp://live.example.com/stream/key", "rtmp URL");
  eq(p.channels[1].url, "udp://@239.0.0.1:1234", "udp URL");
  eq(p.channels[2].url, "rtsp://cam.example.com/live", "rtsp URL");
}

// ── 11. Empty / minimal input ────────────────────────────────────────
console.log("\n11. Edge cases: empty & minimal input");
{
  const p = parseM3U("");
  eq(p.channels.length, 0, "empty string → 0 channels");
  eq(p.malformedLines.length, 0, "no malformed lines for empty");
}
{
  const p = parseM3U("#EXTM3U");
  eq(p.channels.length, 0, "header only → 0 channels");
}
{
  const p = parseM3U("   \n\n  \n  ");
  eq(p.channels.length, 0, "whitespace only → 0 channels");
}

// ── 12. Positive duration ────────────────────────────────────────────
console.log("\n12. Positive duration value");
{
  const m3u = `#EXTM3U
#EXTINF:300,Five Minute Clip
https://stream.example.com/clip.m3u8
`;
  const p = parseM3U(m3u);
  eq(p.channels[0].duration, 300, "duration=300 parsed");
}

// ── Summary ───────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✔\n");
}
