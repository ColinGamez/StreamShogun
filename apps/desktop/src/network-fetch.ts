import { createGunzip } from "node:zlib";

export const DEFAULT_MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** Cap for decompressed gzip output: compressed input is already size-capped,
 *  but highly compressible data (zip bomb) can expand ~1000x. */
export const DEFAULT_MAX_DECOMPRESSED_BYTES = 100 * 1024 * 1024;

/**
 * Gunzip with a hard cap on decompressed output. Rejects instead of
 * exhausting memory on malicious archives.
 */
export function gunzipCapped(
  data: Buffer,
  maxBytes: number = DEFAULT_MAX_DECOMPRESSED_BYTES,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      gunzipStream.destroy();
      reject(err);
    };
    const gunzipStream = createGunzip();
    const chunks: Buffer[] = [];
    let total = 0;
    gunzipStream.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(new Error(`Decompressed output exceeded ${maxBytes} bytes - aborted`));
        return;
      }
      chunks.push(chunk);
    });
    gunzipStream.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, total));
    });
    gunzipStream.on("error", (err: Error) => fail(err));
    gunzipStream.end(data);
  });
}

export interface FetchRawOptions {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

function readableNetworkError(error: unknown, timedOut: boolean): Error {
  if (timedOut) return new Error("Download timed out");
  if (error instanceof Error) return new Error(`Download failed: ${error.message}`);
  return new Error(`Download failed: ${String(error)}`);
}

export async function fetchRaw(url: string | URL, options: FetchRawOptions = {}): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(String(url), {
      signal: controller.signal,
      headers: options.userAgent ? { "User-Agent": options.userAgent } : undefined,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${maxBytes})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response has no readable body");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Download exceeded ${maxBytes} bytes - aborted`);
      }
      chunks.push(value);
    }

    return Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      totalBytes,
    );
  } catch (error) {
    throw readableNetworkError(error, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string | URL, options: FetchRawOptions = {}): Promise<string> {
  const raw = await fetchRaw(url, options);
  const pathname = new URL(String(url)).pathname.toLowerCase();
  const isGzip =
    pathname.endsWith(".gz") || (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);
  const content = isGzip ? await gunzipCapped(raw) : raw;
  return new TextDecoder("utf-8").decode(content);
}
