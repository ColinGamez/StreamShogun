// ── Gzip detection + decompression + XMLTV validation ─────────────
import { gunzip } from "node:zlib";

const DEFAULT_MAX_DECOMPRESSED_SIZE = 10 * 1024 * 1024; // 10 MB

/** Gzip magic bytes: 0x1f 0x8b */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Detect gzip by URL suffix (.gz) or magic bytes.
 */
export function isGzipBuffer(url: string, buffer: Buffer): boolean {
  // Check URL suffix
  if (/\.gz$/i.test(new URL(url).pathname)) return true;
  // Check magic bytes
  if (buffer.length >= 2 && buffer[0] === GZIP_MAGIC_0 && buffer[1] === GZIP_MAGIC_1) {
    return true;
  }
  return false;
}

/**
 * Decompress a gzip buffer. Rejects if result exceeds MAX_DECOMPRESSED_SIZE.
 */
export function decompressGzip(
  buffer: Buffer,
  maxOutputLength = DEFAULT_MAX_DECOMPRESSED_SIZE,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(buffer, { maxOutputLength }, (err, result) => {
      if (err) {
        reject(new Error(`Gzip decompression failed: ${err.message}`));
        return;
      }
      if (result.length > maxOutputLength) {
        reject(new Error(`Decompressed size exceeds ${maxOutputLength} bytes`));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Process a fetched buffer into XMLTV text.
 * - Detects gzip and decompresses if needed
 * - Decodes as UTF-8
 * - Validates that content looks like XMLTV
 */
export async function processEpgBuffer(
  url: string,
  buffer: Buffer,
  options: { maxDecompressedBytes?: number } = {},
): Promise<{ ok: true; xml: string } | { ok: false; reason: string }> {
  const maxDecompressedBytes = options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_SIZE;

  // Enforce raw download size limit
  if (buffer.length > maxDecompressedBytes) {
    return {
      ok: false,
      reason: `Download size exceeds ${maxDecompressedBytes / 1024 / 1024}MB limit`,
    };
  }

  let data: Buffer;
  try {
    if (isGzipBuffer(url, buffer)) {
      data = await decompressGzip(buffer, maxDecompressedBytes);
    } else {
      data = buffer;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Decompression failed";
    return { ok: false, reason: msg };
  }

  const xml = data.toString("utf-8");

  // Validate: must contain <tv within first 1000 chars (allow BOM, XML declaration)
  const head = xml.substring(0, 1000).toLowerCase();
  if (!head.includes("<tv")) {
    return {
      ok: false,
      reason: "Response does not appear to be valid XMLTV (missing <tv element)",
    };
  }

  return { ok: true, xml };
}
