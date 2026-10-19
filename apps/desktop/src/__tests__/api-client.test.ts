import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Mock the token store so no Electron keychain / file I/O happens. The mock
// path resolves to the same module api-client imports as "./token-store.js".
const store = vi.hoisted(() => ({
  tokens: null as { accessToken: string; refreshToken: string } | null,
  loadTokens: vi.fn(),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock("../token-store.js", () => ({
  loadTokens: store.loadTokens,
  saveTokens: store.saveTokens,
  clearTokens: store.clearTokens,
}));

import { apiGetMe, apiLogin, getApiBaseUrl, setApiBaseUrl } from "../api-client";

type FetchCall = [url: string | URL | Request, init?: RequestInit];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchCalls(mock: ReturnType<typeof vi.fn>, path: string): FetchCall[] {
  return mock.mock.calls.filter((call) => String(call[0]).endsWith(path)) as FetchCall[];
}

beforeEach(() => {
  store.tokens = null;
  store.loadTokens.mockImplementation(async () => store.tokens);
  store.saveTokens.mockImplementation(async (t: typeof store.tokens) => {
    store.tokens = t;
  });
  store.clearTokens.mockImplementation(async () => {
    store.tokens = null;
  });
  setApiBaseUrl("https://api.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api-client base URL", () => {
  it("strips trailing slashes so paths join cleanly", () => {
    setApiBaseUrl("https://api.test///");
    expect(getApiBaseUrl()).toBe("https://api.test");
  });
});

describe("api-client auth flows", () => {
  it("logs in without an Authorization header and persists the token pair", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, {
        user: { id: "u1", email: "master@example.com", createdAt: "2026-01-01" },
        subscription: { plan: "pro", status: "active" },
        accessToken: "access-1",
        refreshToken: "refresh-1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiLogin("master@example.com", "hunter2");

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/v1/auth/login");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    expect(store.saveTokens).toHaveBeenCalledWith({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    expect(store.tokens).toEqual({ accessToken: "access-1", refreshToken: "refresh-1" });
  });

  it("attaches the stored Bearer token to protected requests", async () => {
    store.tokens = { accessToken: "access-1", refreshToken: "refresh-1" };
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { user: {}, subscription: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiGetMe();

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer access-1");
    expect(fetchCalls(fetchMock, "/v1/auth/refresh")).toHaveLength(0);
  });

  it("refreshes once after a 401 and retries with the rotated token", async () => {
    store.tokens = { accessToken: "access-old", refreshToken: "refresh-old" };
    let meCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/v1/auth/refresh")) {
        return jsonResponse(200, { accessToken: "access-new", refreshToken: "refresh-new" });
      }
      meCalls += 1;
      const auth = (init?.headers as Record<string, string>)["Authorization"];
      return auth === "Bearer access-new"
        ? jsonResponse(200, { user: { id: "u1" }, subscription: {} })
        : jsonResponse(401, {});
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiGetMe();

    expect(result.ok).toBe(true);
    expect(meCalls).toBe(2);
    expect(
      fetchCalls(fetchMock as unknown as ReturnType<typeof vi.fn>, "/v1/auth/refresh"),
    ).toHaveLength(1);
    expect(store.tokens).toEqual({ accessToken: "access-new", refreshToken: "refresh-new" });
  });

  it("shares a single refresh across concurrent 401s (no double rotation)", async () => {
    store.tokens = { accessToken: "access-old", refreshToken: "refresh-old" };
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/v1/auth/refresh")) {
        // Slow refresh so both requests pile onto the in-flight promise.
        await new Promise((r) => setTimeout(r, 25));
        return jsonResponse(200, { accessToken: "access-new", refreshToken: "refresh-new" });
      }
      const auth = (init?.headers as Record<string, string>)["Authorization"];
      return auth === "Bearer access-new"
        ? jsonResponse(200, { user: {}, subscription: {} })
        : jsonResponse(401, {});
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([apiGetMe(), apiGetMe()]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(
      fetchCalls(fetchMock as unknown as ReturnType<typeof vi.fn>, "/v1/auth/refresh"),
    ).toHaveLength(1);
  });

  it("clears tokens and surfaces the original 401 when the refresh fails", async () => {
    store.tokens = { accessToken: "access-old", refreshToken: "refresh-old" };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      return String(url).endsWith("/v1/auth/refresh")
        ? jsonResponse(401, {})
        : jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiGetMe();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(store.clearTokens).toHaveBeenCalled();
    expect(store.tokens).toBeNull();
    // No retry: /v1/me is fetched exactly once.
    expect(fetchCalls(fetchMock, "/v1/me")).toHaveLength(1);
  });

  it("maps an aborted request to a timeout error", async () => {
    vi.useFakeTimers();
    const hangingFetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", hangingFetch);

    const pending = apiGetMe();
    const assertion = expect(pending).rejects.toThrow("API request timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
