import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export const PASSWORD_RESET_TTL_MINUTES = 60;

let transporter: nodemailer.Transporter | null | undefined;

export function resolvedSmtpUrl(): string | null {
  return env.SMTP_URL ?? null;
}

export function isEmailConfigured(): boolean {
  return resolvedSmtpUrl() !== null || Boolean(env.RESEND_API_KEY);
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) {
    return transporter;
  }

  const smtpUrl = resolvedSmtpUrl();
  transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  return transporter;
}

function publicAppUrl(): string {
  return env.APP_PUBLIC_URL ?? env.CORS_ORIGIN.split(",")[0].trim();
}

export function createPasswordResetToken(): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
  };
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildPasswordResetUrl(token: string): string {
  const url = new URL("/reset-password", publicAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

interface PasswordResetEmailInput {
  to: string;
  displayName?: string | null;
  resetUrl: string;
}

export interface PasswordResetDeliveryResult {
  delivered: boolean;
  previewUrl?: string;
}

export async function deliverPasswordResetEmail(
  input: PasswordResetEmailInput,
  logger: FastifyBaseLogger,
): Promise<PasswordResetDeliveryResult> {
  const greetingName = input.displayName?.trim() || input.to;
  const subject = "Reset your StreamShogun password";
  const text = [
    `Hi ${greetingName},`,
    "",
    "We received a request to reset your StreamShogun password.",
    `Use this link within ${PASSWORD_RESET_TTL_MINUTES} minutes:`,
    input.resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
    `Need help? Contact ${env.SUPPORT_EMAIL}.`,
  ].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(greetingName)},</p>`,
    "<p>We received a request to reset your StreamShogun password.</p>",
    `<p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>`,
    `<p>This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>`,
    "<p>If you did not request this, you can ignore this email.</p>",
    `<p>Need help? Contact <a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}">${escapeHtml(env.SUPPORT_EMAIL)}</a>.</p>`,
  ].join("");
  const from = env.EMAIL_FROM ?? `StreamShogun <${env.SUPPORT_EMAIL}>`;

  const mailer = getTransporter();
  if (mailer) {
    try {
      await mailer.sendMail({
        from,
        replyTo: env.SUPPORT_EMAIL,
        to: input.to,
        subject,
        text,
        html,
      });
      return { delivered: true };
    } catch (error) {
      logger.error({ err: error, to: input.to }, "Failed to send password reset email");
      if (env.NODE_ENV !== "production") {
        return { delivered: false, previewUrl: input.resetUrl };
      }
      return { delivered: false };
    }
  }

  if (env.RESEND_API_KEY) {
    try {
      await sendViaResendApi({ from, to: input.to, subject, text, html });
      return { delivered: true };
    } catch (error) {
      logger.error({ err: error, to: input.to }, "Failed to send password reset email");
      if (env.NODE_ENV !== "production") {
        return { delivered: false, previewUrl: input.resetUrl };
      }
      return { delivered: false };
    }
  }

  logger.warn("Password reset email requested without email transport configuration");
  if (env.NODE_ENV !== "production") {
    return { delivered: false, previewUrl: input.resetUrl };
  }
  return { delivered: false };
}

interface ResendSendEmailInput {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendViaResendApi(input: ResendSendEmailInput): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: env.SUPPORT_EMAIL,
    }),
  });

  if (response.ok) {
    return;
  }

  const errorBody = await safeReadText(response);
  throw new Error(
    `Resend API request failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`,
  );
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    if (env.NODE_ENV !== "production") {
      return "";
    }
    return "";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
