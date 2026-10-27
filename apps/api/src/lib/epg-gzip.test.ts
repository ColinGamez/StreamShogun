import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decompressGzip, isGzipBuffer, processEpgBuffer } from "./epg-gzip";

const XMLTV = '<?xml version="1.0" encoding="UTF-8"?><tv><channel id="c1"/></tv>';

describe("isGzipBuffer", () => {
  it("detects gzip by .gz URL suffix (case-insensitive)", () => {
    expect(isGzipBuffer("https://example.com/guide.xml.gz", Buffer.from("plain"))).toBe(true);
    expect(isGzipBuffer("https://example.com/guide.XML.GZ", Buffer.from("plain"))).toBe(true);
  });

  it("detects gzip by magic bytes regardless of URL", () => {
    const gz = gzipSync(Buffer.from(XMLTV));
    expect(isGzipBuffer("https://example.com/guide.xml", gz)).toBe(true);
  });

  it("returns false for plain XML over a non-.gz URL", () => {
    expect(isGzipBuffer("https://example.com/guide.xml", Buffer.from(XMLTV))).toBe(false);
  });

  it("returns false for buffers shorter than the 2-byte magic", () => {
    expect(isGzipBuffer("https://example.com/guide.xml", Buffer.from([0x1f]))).toBe(false);
  });
});

describe("decompressGzip", () => {
  it("round-trips gzipped content", async () => {
    const gz = gzipSync(Buffer.from(XMLTV));
    const out = await decompressGzip(gz);
    expect(out.toString("utf-8")).toBe(XMLTV);
  });

  it("rejects invalid gzip data", async () => {
    await expect(decompressGzip(Buffer.from("not gzip at all"))).rejects.toThrow(
      /Gzip decompression failed/,
    );
  });

  it("rejects when the decompressed output exceeds maxOutputLength", async () => {
    const big = "x".repeat(10_000);
    const gz = gzipSync(Buffer.from(big));
    await expect(decompressGzip(gz, 100)).rejects.toThrow();
  });
});

describe("processEpgBuffer", () => {
  it("accepts plain XMLTV", async () => {
    const res = await processEpgBuffer("https://example.com/guide.xml", Buffer.from(XMLTV));
    expect(res).toEqual({ ok: true, xml: XMLTV });
  });

  it("accepts XMLTV with a BOM and XML declaration", async () => {
    const withBom = `﻿${XMLTV}`;
    const res = await processEpgBuffer("https://example.com/guide.xml", Buffer.from(withBom));
    expect(res.ok).toBe(true);
  });

  it("decompresses gzipped XMLTV by URL suffix", async () => {
    const gz = gzipSync(Buffer.from(XMLTV));
    const res = await processEpgBuffer("https://example.com/guide.xml.gz", gz);
    expect(res).toEqual({ ok: true, xml: XMLTV });
  });

  it("decompresses gzipped XMLTV by magic bytes even without .gz suffix", async () => {
    const gz = gzipSync(Buffer.from(XMLTV));
    const res = await processEpgBuffer("https://example.com/guide", gz);
    expect(res).toEqual({ ok: true, xml: XMLTV });
  });

  it("rejects downloads larger than the raw size limit", async () => {
    const res = await processEpgBuffer("https://example.com/guide.xml", Buffer.from(XMLTV), {
      maxDecompressedBytes: 10,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/limit/);
  });

  it("rejects gzip bombs that decompress past the limit", async () => {
    const gz = gzipSync(Buffer.from(`${XMLTV}${"x".repeat(10_000)}`));
    const res = await processEpgBuffer("https://example.com/guide.xml.gz", gz, {
      // raw size must pass so only the decompression limit can trip
      maxDecompressedBytes: 5_000,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects corrupt gzip bodies on a .gz URL", async () => {
    const res = await processEpgBuffer(
      "https://example.com/guide.xml.gz",
      Buffer.from("not really gzip"),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Gzip decompression failed/);
  });

  it("rejects content without a <tv element", async () => {
    const res = await processEpgBuffer(
      "https://example.com/guide.xml",
      Buffer.from("<html><body>404</body></html>"),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/XMLTV/);
  });

  it("finds <tv beyond a long XML declaration but within the head window", async () => {
    const padded = `<?xml ${" ".repeat(500)}?><tv></tv>`;
    const res = await processEpgBuffer("https://example.com/guide.xml", Buffer.from(padded));
    expect(res.ok).toBe(true);
  });
});
