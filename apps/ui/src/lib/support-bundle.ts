// ── Support Bundle Builder ────────────────────────────────────────────
//
// Assembles a JSON-serialisable support bundle containing diagnostics,
// redacted chat history, and matched guide IDs.  No tokens or PII leak.

import type { SupportBundle, SupportChatMessage } from "@stream-shogun/core";
import { redactSensitiveInfo, redactMessages } from "./support-redaction";
import { searchSupport } from "./support-codex";

export interface BundleContext {
  appVersion: string;
  os: string;
  locale: string;
  loggedIn: boolean;
  playlistCount: number;
  epgSourceCount: number;
  billingEnabled: boolean;
  billingPlan?: string;
  billingStatus?: string;
  messages: SupportChatMessage[];
}

/**
 * Build a support bundle object with all text fields redacted.
 *
 * @param ctx  Runtime context gathered from stores and navigator
 * @returns    A plain JSON-safe SupportBundle
 */
export function buildSupportBundle(ctx: BundleContext): SupportBundle {
  const last10 = ctx.messages.slice(-10);
  const redacted = redactMessages(last10);

  // Top matched guide IDs for the last user question
  const lastUserMsg = [...last10].reverse().find((m) => m.role === "user");
  let matchedGuideIds: string[] = [];
  if (lastUserMsg) {
    const matches = searchSupport(lastUserMsg.text, 5);
    matchedGuideIds = matches.map((m) => m.id);
  }

  const bundle: SupportBundle = {
    generatedAt: new Date().toISOString(),
    appVersion: redactSensitiveInfo(ctx.appVersion),
    os: ctx.os,
    locale: ctx.locale,
    auth: { loggedIn: ctx.loggedIn },
    counts: {
      playlists: ctx.playlistCount,
      epgSources: ctx.epgSourceCount,
    },
    billing: {
      enabled: ctx.billingEnabled,
      ...(ctx.billingPlan ? { plan: ctx.billingPlan } : {}),
      ...(ctx.billingStatus ? { status: ctx.billingStatus } : {}),
    },
    recentMessages: redacted.map((m) => ({
      role: m.role,
      text: m.text,
    })),
    matchedGuideIds,
  };

  return bundle;
}

/**
 * Generate the bundle filename in the form `support-bundle-YYYYMMDD-HHMM.json`.
 */
export function bundleFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  return `support-bundle-${y}${mo}${d}-${h}${mi}.json`;
}
