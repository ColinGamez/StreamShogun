import { describe, expect, it } from "vitest";
import { isPrivateIP, redactUrl, validateEpgUrl } from "./epg-url-validator";

type LookupAddress = { address: string; family: number };
const lookupAll = (addresses: string[]) =>
  (async () => addresses.map((address) => ({ address, family: 4 }))) as unknown as (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<LookupAddress[]>;

describe("isPrivateIP", () => {
  it.each([
    "127.0.0.1", // loopback
    "10.0.0.5", // 10/8
    "172.16.0.1", // 172.16/12 low edge
    "172.31.255.255", // 172.16/12 high edge
    "192.168.1.1", // 192.168/16
    "169.254.169.254", // link-local / cloud metadata
    "0.0.0.0", // "this" network
    "0.1.2.3", // still 0/8
  ])("blocks IPv4 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "172.15.0.1", // just below 172.16/12
    "172.32.0.1", // just above 172.16/12
    "192.167.0.1", // just below 192.168/16
    "169.253.0.1", // just below 169.254/16
    "11.0.0.1",
  ])("allows public IPv4 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it.each([
    "::1",
    "fc00::1",
    "fd12::9",
    "fe80::1",
    "::ffff:10.0.0.1", // IPv4-mapped private ranges
    "::ffff:127.0.0.1",
    "::ffff:172.16.0.1",
    "::ffff:192.168.1.1",
    "::ffff:169.254.1.1",
  ])("blocks IPv6 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each(["2001:4860:4860::8888", "::ffff:8.8.8.8"])("allows public IPv6 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it("returns false for non-IP strings", () => {
    expect(isPrivateIP("example.com")).toBe(false);
    expect(isPrivateIP("")).toBe(false);
  });
});

/** Extract the failure reason with proper narrowing. */
async function reasonFor(raw: string | undefined): Promise<string> {
  const res = await validateEpgUrl(raw);
  return res.ok === false ? res.reason : "(unexpectedly ok)";
}

describe("validateEpgUrl", () => {
  it("rejects missing and empty URLs", async () => {
    expect(await reasonFor(undefined)).toMatch(/Missing/);
    expect(await reasonFor("   ")).toMatch(/Missing/);
  });

  it("rejects over-long URLs", async () => {
    const long = `https://example.com/${"a".repeat(2100)}`;
    expect((await validateEpgUrl(long)).ok).toBe(false);
  });

  it("rejects unparseable and non-http(s) URLs", async () => {
    expect(await reasonFor("not a url")).toBe("Invalid URL");
    expect(await reasonFor("ftp://example.com/x")).toMatch(/http/);
    expect(await reasonFor("file:///etc/passwd")).toMatch(/http/);
  });

  it.each([
    "http://localhost/x",
    "http://0.0.0.0/x",
    "http://router.local/x",
    "http://db.internal/x",
  ])("rejects private hostname %s without DNS", async (raw) => {
    const res = await validateEpgUrl(raw, { lookupAll: lookupAll(["8.8.8.8"]) });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toMatch(/Private\/local/);
  });

  it("validates literal IPs directly, no DNS lookup", async () => {
    expect((await validateEpgUrl("http://192.168.1.10:8080/epg.xml")).ok).toBe(false);
    const okRes = await validateEpgUrl("https://1.1.1.1/epg.xml", {
      lookupAll: () => {
        throw new Error("DNS must not run for literal IPs");
      },
    });
    expect(okRes.ok).toBe(true);
  });

  it("blocks a hostname that resolves to any private IP", async () => {
    const res = await validateEpgUrl("https://evil.example.com/epg.xml", {
      lookupAll: lookupAll(["8.8.8.8", "10.0.0.9"]),
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toMatch(/SSRF/);
  });

  it("allows hostnames resolving to public IPs only", async () => {
    const res = await validateEpgUrl("https://iptv-epg.org/files/epg-jp.xml", {
      lookupAll: lookupAll(["203.0.113.10", "198.51.100.7"]),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.url.hostname).toBe("iptv-epg.org");
  });

  it("fails closed when DNS errors or returns nothing", async () => {
    const throwing = await validateEpgUrl("https://nx.example.com/", {
      lookupAll: () => Promise.reject(new Error("ENOTFOUND")),
    });
    expect(throwing.ok === false && throwing.reason).toMatch(/DNS resolution failed/);

    const empty = await validateEpgUrl("https://nx.example.com/", { lookupAll: lookupAll([]) });
    expect(empty.ok === false && empty.reason).toMatch(/DNS resolution failed/);
  });
});

describe("redactUrl", () => {
  it("masks sensitive query params and never leaks them", () => {
    const out = redactUrl(
      "https://provider.example.com/get.php?user=bob&token=SECRET&api_key=HIDDEN&password=pw",
    );
    expect(out).toBe("https://provider.example.com/get.php?[redacted]");
    expect(out).not.toContain("SECRET");
    expect(out).not.toContain("HIDDEN");
    expect(out).not.toContain("pw");
    expect(out).not.toContain("bob"); // entire query string is dropped
  });

  it("redacts even non-sensitive queries and handles URLs without a query", () => {
    expect(redactUrl("https://x.example.com/guide.xml?page=2")).toBe(
      "https://x.example.com/guide.xml?[redacted]",
    );
    expect(redactUrl("https://x.example.com/guide.xml")).toBe(
      "https://x.example.com/guide.xml?[redacted]",
    );
  });

  it("returns a marker for invalid URLs", () => {
    expect(redactUrl("not a url")).toBe("[invalid-url]");
  });
});
