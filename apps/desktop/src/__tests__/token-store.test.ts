import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ── Fakes ─────────────────────────────────────────────────────────────
// token-store.ts pulls electron's app/safeStorage at module scope; keytar
// is an optional dynamic import that simply fails in Node, exercising the
// real fallback chain. The vault is mocked so tests can flip its
// availability between save and load.

const fakes = vi.hoisted(() => ({ vaultAvailable: false }));

vi.mock("electron", async () => {
  const os = await import("node:os");
  const nodePath = await import("node:path");
  const dir = nodePath.join(os.tmpdir(), "streamshogun-tokenstore-tests");
  return {
    app: { getPath: () => dir },
    safeStorage: {
      isEncryptionAvailable: () => fakes.vaultAvailable,
      encryptString: (s: string) => Buffer.from(`vault:${s}`, "utf8"),
      decryptString: (b: Buffer) => {
        const s = b.toString("utf8");
        if (!s.startsWith("vault:")) throw new Error("not a vault blob");
        return s.slice("vault:".length);
      },
    },
    // The store's userData dir, exposed so tests can inspect the file.
    __dir: dir,
  };
});

import { clearTokens, loadTokens, saveTokens } from "../token-store";
import * as electron from "electron";

const USER_DATA = (electron as unknown as { __dir: string }).__dir;
const TOKEN_FILE = path.join(USER_DATA, ".auth-tokens.enc");
const TOKENS = { accessToken: "access-1", refreshToken: "refresh-1" };

async function readFile(): Promise<string | null> {
  try {
    return await fs.readFile(TOKEN_FILE, "utf-8");
  } catch {
    return null;
  }
}

beforeEach(async () => {
  fakes.vaultAvailable = false;
  await fs.mkdir(USER_DATA, { recursive: true });
  await fs.rm(TOKEN_FILE, { force: true });
});

afterEach(async () => {
  await fs.rm(TOKEN_FILE, { force: true });
});

describe("token-store AES file fallback (no OS vault)", () => {
  it("round-trips tokens through an encrypted file", async () => {
    await saveTokens(TOKENS);

    const raw = await readFile();
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("access-1"); // actually encrypted at rest
    expect(raw).not.toContain("v2:");

    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });

  it("keeps legacy AES blobs readable after the OS vault appears", async () => {
    await saveTokens(TOKENS); // written with vault absent → AES format
    fakes.vaultAvailable = true;

    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });

  it("returns null for a tampered blob (GCM auth tag mismatch)", async () => {
    await saveTokens(TOKENS);
    const raw = (await readFile()) as string;
    const tampered = `${raw.slice(0, -1)}${raw.endsWith("0") ? "1" : "0"}`;
    await fs.writeFile(TOKEN_FILE, tampered, "utf-8");

    await expect(loadTokens()).resolves.toBeNull();
  });
});

describe("token-store safeStorage tier", () => {
  beforeEach(() => {
    fakes.vaultAvailable = true;
  });

  it("writes a v2-prefixed vault blob and reads it back", async () => {
    await saveTokens(TOKENS);

    const raw = await readFile();
    expect(raw?.startsWith("v2:")).toBe(true);
    expect(raw).not.toContain("access-1"); // blob is base64 of vault ciphertext

    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });

  it("fails closed when a v2 blob exists but the vault is gone", async () => {
    await saveTokens(TOKENS); // v2 blob written while vault present
    fakes.vaultAvailable = false;

    // Must NOT fall back to AES-decrypting a vault blob.
    await expect(loadTokens()).resolves.toBeNull();
  });
});

describe("token-store clearTokens", () => {
  it("removes the token file and tolerates it already being gone", async () => {
    await saveTokens(TOKENS);
    await clearTokens();
    expect(await readFile()).toBeNull();

    await expect(clearTokens()).resolves.toBeUndefined();
    await expect(loadTokens()).resolves.toBeNull();
  });
});
