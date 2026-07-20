import type { MasterSourceDTO } from "@stream-shogun/shared";
import { env } from "../config/env.js";
import { EpgCache } from "./epg-cache.js";
import { processEpgBuffer } from "./epg-gzip.js";
import { validateEpgUrl } from "./epg-url-validator.js";

const BANGUMI_BASE_URL = "https://bangumi.org";
const BANGUMI_TOKYO_GROUP_ID = "42";
const BANGUMI_FETCH_DAYS = 2;
const BANGUMI_FETCH_ATTEMPTS = 2;
const BANGUMI_RETRY_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_MASTER_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const MAX_MASTER_EPG_XML_BYTES = 50 * 1024 * 1024;
const MIN_BANGUMI_CHANNELS = 5;
const MIN_BANGUMI_PROGRAMMES_PER_PAGE = 20;

const USER_AGENT = "StreamShogun-MasterEPG/1.0 (+https://streamshogun.com)";

const masterEpgCache = new EpgCache(6 * 60 * 60 * 1000, 20);

export const JAPAN_BANGUMI_SOURCE_ID = "japan-bangumi-tokyo-terrestrial";
export const KOREA_EPG2XML_SOURCE_ID = "korea-epg2xml";

const TOKYO_TERRESTRIAL_CHANNELS = [
  "NHK総合1・東京",
  "NHK Eテレ1東京",
  "日テレ1",
  "テレビ朝日",
  "TBS1",
  "テレ東",
  "フジテレビ",
  "TOKYO MX1",
  "TOKYO MX2",
  "tvk1",
  "チバテレ1",
  "テレ玉1",
] as const;

interface BangumiChannel {
  id: string;
  name: string;
  line: number;
}

interface BangumiProgramme {
  channelId: string;
  start: string;
  stop: string;
  title: string;
  description: string;
  categories: string[];
  url: string;
}

export function getGeneratedMasterSources(): MasterSourceDTO[] {
  const sources: MasterSourceDTO[] = [];

  if (env.MASTER_JAPAN_BANGUMI_ENABLED !== "false") {
    sources.push({
      id: JAPAN_BANGUMI_SOURCE_ID,
      kind: "epg",
      name: env.MASTER_JAPAN_BANGUMI_NAME ?? "Japan Guide - Bangumi Tokyo",
      loadMode: "api",
      description: "Tokyo terrestrial XMLTV generated from bangumi.org.",
    });
  }

  if (env.MASTER_KOREA_EPG_URL) {
    sources.push({
      id: KOREA_EPG2XML_SOURCE_ID,
      kind: "epg",
      name: env.MASTER_KOREA_EPG_NAME ?? "Korea Guide - epg2xml",
      loadMode: "api",
      description: "XMLTV loaded from an epg2xml-compatible private output URL.",
    });
  }

  return sources;
}

export async function loadGeneratedMasterSourceContent(sourceId: string): Promise<string> {
  if (sourceId === JAPAN_BANGUMI_SOURCE_ID) {
    return getCachedXml(sourceId, buildJapanBangumiXmltv);
  }

  if (sourceId === KOREA_EPG2XML_SOURCE_ID) {
    return getCachedXml(sourceId, loadKoreaEpg2xmlXmltv);
  }

  throw new Error("Unknown generated Master source");
}

async function getCachedXml(cacheKey: string, loader: () => Promise<string>): Promise<string> {
  const datedKey = `${cacheKey}:${formatJstDate(new Date())}`;
  const cached = masterEpgCache.get(datedKey);
  if (cached) return cached.xml;

  const xml = await loader();
  masterEpgCache.set(datedKey, xml);
  return xml;
}

async function buildJapanBangumiXmltv(): Promise<string> {
  const dates = Array.from({ length: BANGUMI_FETCH_DAYS }, (_unused, index) =>
    formatJstDate(addDays(new Date(), index)),
  );

  const pages = await Promise.all(dates.map((date) => fetchBangumiSchedulePage(date)));
  const channels = mergeChannels(pages.flatMap((page) => page.channels));
  const programmes = dedupeProgrammes(pages.flatMap((page) => page.programmes));

  return renderXmltv({
    generator: "StreamShogun Bangumi",
    channels,
    programmes,
  });
}

async function fetchBangumiSchedulePage(date: string): Promise<{
  channels: BangumiChannel[];
  programmes: BangumiProgramme[];
}> {
  const url = `${BANGUMI_BASE_URL}/epg/td?broad_cast_date=${date}&ggm_group_id=${BANGUMI_TOKYO_GROUP_ID}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= BANGUMI_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const html = await fetchText(url, "text/html,application/xhtml+xml");
      return parseBangumiScheduleHtml(html);
    } catch (error) {
      lastError = error;
      if (attempt < BANGUMI_FETCH_ATTEMPTS) {
        await delay(BANGUMI_RETRY_DELAY_MS);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "unknown upstream error";
  throw new Error(`Bangumi schedule fetch failed for ${date}: ${detail}`);
}

export function parseBangumiScheduleHtml(html: string): {
  channels: BangumiChannel[];
  programmes: BangumiProgramme[];
} {
  const rawChannels = parseBangumiChannels(html);
  const channels = rawChannels.length
    ? rawChannels
    : TOKYO_TERRESTRIAL_CHANNELS.map((name, index) => ({
        id: bangumiChannelId(index + 1, name),
        name,
        line: index + 1,
      }));
  const byLine = new Map(channels.map((channel) => [channel.line, channel]));
  const programmes: BangumiProgramme[] = [];

  const lineRegex = /<ul\b[^>]*\bid=["']program_line_(\d+)["'][^>]*>([\s\S]*?)<\/ul>/gi;
  for (const lineMatch of html.matchAll(lineRegex)) {
    const line = Number(lineMatch[1]);
    const channel = byLine.get(line);
    if (!channel) continue;

    const lineHtml = lineMatch[2] ?? "";
    const itemRegex =
      /<li\b(?=[^>]*\bs=["'](\d{12})["'])(?=[^>]*\be=["'](\d{12})["'])[^>]*>([\s\S]*?)<\/li>/gi;

    for (const itemMatch of lineHtml.matchAll(itemRegex)) {
      const start = itemMatch[1] ?? "";
      const stop = itemMatch[2] ?? "";
      if (stop <= start) continue;

      const itemHtml = itemMatch[3] ?? "";
      const title = cleanText(matchClassElement(itemHtml, "p", "program_title"));
      if (!title) continue;

      const description = cleanText(matchClassElement(itemHtml, "p", "program_detail"));
      const href = decodeHtml(matchFirst(itemHtml, /<a\b[^>]*\bhref=["']([^"']+)["']/i) ?? "");
      const categoryClass = matchClassAttribute(itemHtml, "div", "program_time")
        ?.split(/\s+/)
        .find((className) => className !== "program_time");

      programmes.push({
        channelId: channel.id,
        start: xmltvJstTime(start),
        stop: xmltvJstTime(stop),
        title,
        description,
        categories: categoryClassToCategories(categoryClass),
        url: href ? new URL(href, BANGUMI_BASE_URL).toString() : "",
      });
    }
  }

  if (channels.length < MIN_BANGUMI_CHANNELS) {
    throw new Error(`Bangumi returned only ${channels.length} channels`);
  }
  if (programmes.length < MIN_BANGUMI_PROGRAMMES_PER_PAGE) {
    throw new Error(`Bangumi returned only ${programmes.length} programmes`);
  }

  return { channels, programmes };
}

function parseBangumiChannels(html: string): BangumiChannel[] {
  const channels: BangumiChannel[] = [];
  const channelRegex =
    /<li\b(?=[^>]*\bclass=["'][^"']*\bjs_channel\b[^"']*["'])[^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(channelRegex)) {
    const visibleName = cleanText(match[1] ?? "");
    if (!visibleName) continue;

    const line = channels.length + 1;
    const fallbackName = TOKYO_TERRESTRIAL_CHANNELS[line - 1];
    const name = visibleName.includes("..") && fallbackName ? fallbackName : visibleName;
    channels.push({
      id: bangumiChannelId(line, name),
      name,
      line,
    });
  }

  return channels;
}

function mergeChannels(channels: BangumiChannel[]): BangumiChannel[] {
  const byId = new Map<string, BangumiChannel>();
  for (const channel of channels) {
    if (!byId.has(channel.id)) byId.set(channel.id, channel);
  }
  return [...byId.values()].sort((a, b) => a.line - b.line);
}

function dedupeProgrammes(programmes: BangumiProgramme[]): BangumiProgramme[] {
  const byKey = new Map<string, BangumiProgramme>();
  for (const programme of programmes) {
    const key = `${programme.channelId}:${programme.start}:${programme.stop}:${programme.title}`;
    if (!byKey.has(key)) byKey.set(key, programme);
  }
  return [...byKey.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function loadKoreaEpg2xmlXmltv(): Promise<string> {
  if (!env.MASTER_KOREA_EPG_URL) {
    throw new Error("MASTER_KOREA_EPG_URL is not configured");
  }

  const validation = await validateEpgUrl(env.MASTER_KOREA_EPG_URL);
  if (!validation.ok) {
    throw new Error(`Korea epg2xml URL rejected: ${validation.reason}`);
  }

  const buffer = await fetchBuffer(
    validation.url.href,
    "application/xml,text/xml,application/gzip,*/*",
  );
  const result = await processEpgBuffer(validation.url.href, buffer, {
    maxDecompressedBytes: MAX_MASTER_EPG_XML_BYTES,
  });
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.xml;
}

async function fetchText(url: string, accept: string): Promise<string> {
  const buffer = await fetchBuffer(url, accept);
  return buffer.toString("utf-8");
}

async function fetchBuffer(url: string, accept: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Upstream returned an empty response");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_MASTER_DOWNLOAD_BYTES) {
      throw new Error(`Upstream response exceeds ${MAX_MASTER_DOWNLOAD_BYTES} bytes`);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = response.body.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_MASTER_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error(`Upstream response exceeds ${MAX_MASTER_DOWNLOAD_BYTES} bytes`);
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
  }
}

function renderXmltv(input: {
  generator: string;
  channels: BangumiChannel[];
  programmes: BangumiProgramme[];
}): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
    `<tv generator-info-name="${xmlEscape(input.generator)}">`,
  ];

  for (const channel of input.channels) {
    lines.push(`  <channel id="${xmlEscape(channel.id)}">`);
    lines.push(`    <display-name>${xmlEscape(channel.name)}</display-name>`);
    lines.push("  </channel>");
  }

  for (const programme of input.programmes) {
    lines.push(
      `  <programme start="${programme.start}" stop="${programme.stop}" channel="${xmlEscape(
        programme.channelId,
      )}">`,
    );
    lines.push(`    <title lang="ja">${xmlEscape(programme.title)}</title>`);
    if (programme.description) {
      lines.push(`    <desc lang="ja">${xmlEscape(programme.description)}</desc>`);
    }
    for (const category of programme.categories) {
      lines.push(`    <category lang="ja">${xmlEscape(category)}</category>`);
    }
    if (programme.url) {
      lines.push(`    <url>${xmlEscape(programme.url)}</url>`);
    }
    lines.push("  </programme>");
  }

  lines.push("</tv>");
  return `${lines.join("\n")}\n`;
}

function categoryClassToCategories(categoryClass: string | undefined): string[] {
  if (!categoryClass || categoryClass === "no_genre") return [];
  const normalized = categoryClass.replace(/^gc-/, "");
  const map: Record<string, string> = {
    anime: "アニメ",
    cinema: "映画",
    documentary: "ドキュメンタリー",
    drama: "ドラマ",
    education: "教育",
    music: "音楽",
    news: "ニュース",
    sports: "スポーツ",
    variety: "バラエティ",
    welfare: "福祉",
  };
  return [map[normalized] ?? normalized];
}

function bangumiChannelId(line: number, name: string): string {
  return `bangumi-jp-td-tokyo-${line}-${slug(name)}`;
}

function slug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return ascii || "channel";
}

function xmltvJstTime(raw: string): string {
  return `${raw}00 +0900`;
}

function formatJstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}${month}${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function matchFirst(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

function matchClassAttribute(text: string, tag: string, requiredClass: string): string | undefined {
  const pattern = new RegExp(
    `<${tag}\\b[^>]*\\bclass=["']([^"']*\\b${requiredClass}\\b[^"']*)["'][^>]*>`,
    "i",
  );
  return matchFirst(text, pattern);
}

function matchClassElement(text: string, tag: string, requiredClass: string): string | undefined {
  const pattern = new RegExp(
    `<${tag}\\b(?=[^>]*\\bclass=["'][^"']*\\b${requiredClass}\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i",
  );
  return matchFirst(text, pattern);
}

function cleanText(value: string | undefined): string {
  if (!value) return "";
  return decodeHtml(stripTags(value)).replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
