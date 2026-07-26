import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { fetchRaw, fetchText } from "../network-fetch";

describe("desktop network imports", () => {
  it.each([403, 404])("reports HTTP %s without accepting the response body", async (status) => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status })) as typeof fetch;
    await expect(fetchRaw("https://example.com/list.m3u", { fetchImpl })).rejects.toThrow(
      `HTTP ${status}`,
    );
  });

  it("aborts a request that exceeds its timeout", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }) as typeof fetch;

    await expect(
      fetchRaw("https://example.com/slow.m3u", { fetchImpl, timeoutMs: 10 }),
    ).rejects.toThrow("Download timed out");
  });

  it("surfaces a connection dropped while streaming", async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads === 1) controller.enqueue(new TextEncoder().encode("#EXTM3U\n"));
        else controller.error(new Error("socket closed"));
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 })) as typeof fetch;

    await expect(fetchRaw("https://example.com/drop.m3u", { fetchImpl })).rejects.toThrow(
      "socket closed",
    );
  });

  it("rejects oversized declared and streamed payloads", async () => {
    const declared = vi.fn(
      async () => new Response("x", { headers: { "content-length": "100" } }),
    ) as typeof fetch;
    await expect(
      fetchRaw("https://example.com/large", { fetchImpl: declared, maxBytes: 10 }),
    ).rejects.toThrow("Response too large");

    const streamed = vi.fn(async () => new Response("01234567890")) as typeof fetch;
    await expect(
      fetchRaw("https://example.com/large", { fetchImpl: streamed, maxBytes: 10 }),
    ).rejects.toThrow("Download exceeded");
  });

  it("decodes plain text and gzip imports", async () => {
    const plain = vi.fn(async () => new Response("#EXTM3U")) as typeof fetch;
    await expect(fetchText("https://example.com/list.m3u", { fetchImpl: plain })).resolves.toBe(
      "#EXTM3U",
    );

    const zipped = gzipSync("<tv></tv>");
    const gzipFetch = vi.fn(async () => new Response(zipped)) as typeof fetch;
    await expect(
      fetchText("https://example.com/guide.xml.gz", { fetchImpl: gzipFetch }),
    ).resolves.toBe("<tv></tv>");
  });
});
