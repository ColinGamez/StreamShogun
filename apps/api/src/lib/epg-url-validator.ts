// ── SSRF-safe URL validation for EPG proxy ────────────────────────
// Validates user-provided URLs before upstream fetch.
// Blocks private/reserved IP ranges, enforces http(s), max length.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_URL_LENGTH = 2048;
interface LookupAddress {
  address: string;
  family: number;
}
type LookupAllFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>;

/** All private / reserved CIDR ranges to block (IPv4). */
const BLOCKED_IPV4_RANGES: { network: number; mask: number }[] = [
  // 127.0.0.0/8  — loopback
  { network: 0x7f000000, mask: 0xff000000 },
  // 10.0.0.0/8   — private
  { network: 0x0a000000, mask: 0xff000000 },
  // 172.16.0.0/12 — private
  { network: 0xac100000, mask: 0xfff00000 },
  // 192.168.0.0/16 — private
  { network: 0xc0a80000, mask: 0xffff0000 },
  // 169.254.0.0/16 — link-local
  { network: 0xa9fe0000, mask: 0xffff0000 },
  // 0.0.0.0/8 — "this" network
  { network: 0x00000000, mask: 0xff000000 },
];

/** IPv6 prefixes to block. */
const BLOCKED_IPV6_PREFIXES = [
  "::1", // loopback
  "fc", // fc00::/7 unique-local
  "fd", // fc00::/7 unique-local (fd prefix)
  "fe80:", // link-local
  "::ffff:10.", // mapped IPv4 10.x
  "::ffff:127.", // mapped IPv4 127.x
  "::ffff:172.16.", // mapped IPv4 172.16.x
  "::ffff:192.168.", // mapped IPv4 192.168.x
  "::ffff:169.254.", // mapped IPv4 169.254.x
];

function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".");
  return (
    ((parseInt(parts[0]!, 10) << 24) >>> 0) +
    (parseInt(parts[1]!, 10) << 16) +
    (parseInt(parts[2]!, 10) << 8) +
    parseInt(parts[3]!, 10)
  );
}

function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToNumber(ip);
  return BLOCKED_IPV4_RANGES.some((range) => (num & range.mask) >>> 0 === range.network >>> 0);
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** Check if an IP address (v4 or v6) is in a blocked range. */
export function isPrivateIP(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  if (isIP(ip) === 6) return isPrivateIPv6(ip);
  return false;
}

export type UrlValidationResult = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Validate a URL for safe upstream fetching.
 * Checks: scheme, length, hostname not private, DNS resolution not private.
 */
export async function validateEpgUrl(
  raw: string | undefined,
  deps: { lookupAll?: LookupAllFn } = {},
): Promise<UrlValidationResult> {
  if (!raw || raw.trim() === "") {
    return { ok: false, reason: "Missing url parameter" };
  }

  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `URL exceeds max length (${MAX_URL_LENGTH})` };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed" };
  }

  const hostname = url.hostname;

  // Block obvious private hostnames
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { ok: false, reason: "Private/local hostnames are not allowed" };
  }

  // If hostname is already an IP, validate directly
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return { ok: false, reason: "Private IP addresses are not allowed" };
    }
    return { ok: true, url };
  }

  // Resolve DNS and check the resolved IP
  try {
    const lookupAll =
      deps.lookupAll ??
      ((lookupHostname: string, options: { all: true; verbatim: true }) =>
        lookup(lookupHostname, options));
    const results = await lookupAll(hostname, { all: true, verbatim: true });

    if (results.length === 0) {
      return { ok: false, reason: "DNS resolution failed for hostname" };
    }

    if (results.some((result) => isPrivateIP(result.address))) {
      return {
        ok: false,
        reason: "DNS resolves to a private IP address (possible SSRF)",
      };
    }
  } catch {
    return { ok: false, reason: "DNS resolution failed for hostname" };
  }

  return { ok: true, url };
}

/**
 * Redact sensitive query parameters from a URL for safe logging.
 * Masks: token, key, pass, auth, secret, password, apikey, api_key.
 */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const sensitiveKeys = [
      "token",
      "key",
      "pass",
      "auth",
      "secret",
      "password",
      "apikey",
      "api_key",
      "access_token",
    ];
    for (const [k] of url.searchParams) {
      if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
        url.searchParams.set(k, "***");
      }
    }
    return `${url.protocol}//${url.host}${url.pathname}?[redacted]`;
  } catch {
    return "[invalid-url]";
  }
}
