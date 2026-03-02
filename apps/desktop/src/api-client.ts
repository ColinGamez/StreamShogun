// ── HTTP client for the StreamShōgun SaaS API ────────────────────────
//
// Wraps fetch with:
//  • Configurable base URL (dev: localhost:8787, prod: api.streamshogun.com)
//  • Automatic Authorization header injection
//  • Transparent token refresh on 401

import { loadTokens, saveTokens, clearTokens } from "./token-store.js";

// Default API base URL — override via settings or env
const DEFAULT_API_URL = "http://localhost:8787";

let apiBaseUrl = DEFAULT_API_URL;

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.replace(/\/+$/, ""); // strip trailing slashes
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

// ── Core request helper ───────────────────────────────────────────────

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // default true except for auth routes
}

async function apiFetch<T>(
  path: string,
  opts: FetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const { body, auth = true, ...init } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (auth) {
    const tokens = await loadTokens();
    if (tokens?.accessToken) {
      headers["Authorization"] = `Bearer ${tokens.accessToken}`;
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, data };
}

// ── Auto-refresh wrapper ──────────────────────────────────────────────

async function apiFetchWithRefresh<T>(
  path: string,
  opts: FetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  let result = await apiFetch<T>(path, opts);

  // If 401, try refresh then retry once
  if (result.status === 401 && opts.auth !== false) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      result = await apiFetch<T>(path, opts);
    }
  }

  return result;
}

// ── Auth endpoints ────────────────────────────────────────────────────

interface AuthResponse {
  user: { id: string; email: string; displayName?: string; createdAt: string };
  subscription: { plan: string; status: string; currentPeriodEnd?: string };
  accessToken: string;
  refreshToken: string;
}

interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
}

export async function apiRegister(
  email: string,
  password: string,
  displayName?: string
): Promise<{ ok: boolean; status: number; data: AuthResponse }> {
  const result = await apiFetch<AuthResponse>("/v1/auth/register", {
    method: "POST",
    body: { email, password, displayName },
    auth: false,
  });

  if (result.ok) {
    await saveTokens({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
    });
  }

  return result;
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ ok: boolean; status: number; data: AuthResponse }> {
  const result = await apiFetch<AuthResponse>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });

  if (result.ok) {
    await saveTokens({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
    });
  }

  return result;
}

export async function apiLogout(): Promise<void> {
  const tokens = await loadTokens();
  if (tokens?.refreshToken) {
    await apiFetch("/v1/auth/logout", {
      method: "POST",
      body: { refreshToken: tokens.refreshToken },
      auth: false,
    }).catch((_e: unknown) => { /* swallow – fire-and-forget logout */ });
  }
  await clearTokens();
}

async function refreshTokens(): Promise<boolean> {
  const tokens = await loadTokens();
  if (!tokens?.refreshToken) return false;

  const result = await apiFetch<TokenPairResponse>("/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken: tokens.refreshToken },
    auth: false,
  });

  if (result.ok) {
    await saveTokens({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
    });
    return true;
  }

  // Refresh failed — clear everything
  await clearTokens();
  return false;
}

/**
 * Public wrapper around the internal `refreshTokens` used by the IPC
 * AUTH_REFRESH handler so the renderer can trigger a real refresh.
 */
export async function apiRefreshTokens(): Promise<boolean> {
  return refreshTokens();
}

// ── Protected endpoints ───────────────────────────────────────────────

interface MeResponse {
  user: { id: string; email: string; displayName?: string; createdAt: string };
  subscription: { plan: string; status: string; billingInterval: string | null; currentPeriodEnd?: string };
}

interface FeaturesResponse {
  plan: string;
  subscriptionStatus: string;
  billingInterval: string | null;
  flags: Record<string, boolean>;
}

export async function apiGetMe(): Promise<{
  ok: boolean;
  status: number;
  data: MeResponse;
}> {
  return apiFetchWithRefresh<MeResponse>("/v1/me");
}

export async function apiGetFeatures(): Promise<{
  ok: boolean;
  status: number;
  data: FeaturesResponse;
}> {
  return apiFetchWithRefresh<FeaturesResponse>("/v1/features");
}

// ── Billing ───────────────────────────────────────────────────────────

export async function apiBillingCheckout(): Promise<{
  ok: boolean;
  status: number;
  data: { url: string };
}> {
  return apiFetchWithRefresh<{ url: string }>("/v1/billing/checkout", {
    method: "POST",
  });
}

export async function apiBillingPortal(): Promise<{
  ok: boolean;
  status: number;
  data: { url: string };
}> {
  return apiFetchWithRefresh<{ url: string }>("/v1/billing/portal", {
    method: "POST",
  });
}

// ── Cloud Sync v1 ─────────────────────────────────────────────────────

import type { CloudSyncPayload } from "@stream-shogun/shared";

export async function apiCloudSyncGet(): Promise<{
  ok: boolean;
  status: number;
  data: CloudSyncPayload;
}> {
  return apiFetchWithRefresh<CloudSyncPayload>("/v1/cloud/sync");
}

export async function apiCloudSyncPut(body: {
  settings?: Record<string, string>;
  favorites?: string[];
  history?: Array<{ channelUrl: string; channelName: string; channelLogo?: string; groupTitle?: string; watchedAt: number }>;
  localUpdatedAt: string;
}): Promise<{
  ok: boolean;
  status: number;
  data: CloudSyncPayload;
}> {
  return apiFetchWithRefresh<CloudSyncPayload>("/v1/cloud/sync", {
    method: "PUT",
    body,
  });
}
