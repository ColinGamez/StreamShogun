// ── Zod validation schemas ─────────────────────────────────────────────

import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────

export const registerBody = z.object({
  email: z.string().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export const loginBody = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshBody = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ── Types ─────────────────────────────────────────────────────────────

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type RefreshBody = z.infer<typeof refreshBody>;
