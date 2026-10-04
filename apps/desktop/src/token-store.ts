// ── Secure token storage for the desktop client ───────────────────────
//
// Stores access + refresh tokens, best store first:
//  1. Electron safeStorage (OS keychain/DPAPI, no native deps)
//  2. keytar (OS keychain) — optional, only if the user installs it
//  3. File in appData — AES-256-GCM with a machine-bound key plus 0o600
//     permissions. This last tier is obfuscation, not real secrecy: anyone
//     who can read the user profile can derive the key.
//
// Tokens are NEVER held in memory for longer than necessary.

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { app, safeStorage } from "electron";

const SERVICE_NAME = "StreamShogun";
const ACCOUNT_NAME = "auth-tokens";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Encryption helpers (fallback) ─────────────────────────────────────

const ALGO = "aes-256-gcm";

/** Derive a deterministic key from the machine + user so the file is bound to this install. */
function deriveKey(): Buffer {
  const seed = `${SERVICE_NAME}:${app.getPath("userData")}:${process.env.USERNAME ?? "user"}`;
  return crypto.createHash("sha256").update(seed).digest();
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(ciphertext: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, data] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function tokenFilePath(): string {
  return path.join(app.getPath("userData"), ".auth-tokens.enc");
}

/** OS vault available (keychain/DPAPI)? False on headless Linux, etc. */
function isOsVaultAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Prefix distinguishing safeStorage blobs from the legacy AES file format. */
const SAFE_STORAGE_PREFIX = "v2:";

// ── Try keytar (optional native dep) ──────────────────────────────────

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let keytarModule: KeytarLike | null = null;
let keytarFailed = false;

async function getKeytar(): Promise<KeytarLike | null> {
  if (keytarFailed) return null;
  if (keytarModule) return keytarModule;
  try {
    // Dynamic import so it's optional — won't crash if not installed
    keytarModule = (await import(/* webpackIgnore: true */ "keytar" as string)) as KeytarLike;
    return keytarModule;
  } catch {
    keytarFailed = true;
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const json = JSON.stringify(tokens);
  const keytar = await getKeytar();
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, json);
  } else if (isOsVaultAvailable()) {
    await fs.writeFile(
      tokenFilePath(),
      SAFE_STORAGE_PREFIX + safeStorage.encryptString(json).toString("base64"),
      {
        encoding: "utf-8",
        mode: 0o600,
      },
    );
  } else {
    await fs.writeFile(tokenFilePath(), encrypt(json), { encoding: "utf-8", mode: 0o600 });
  }
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const keytar = await getKeytar();
  if (keytar) {
    const raw = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  // File fallback: safeStorage blob or legacy AES blob
  try {
    const raw = await fs.readFile(tokenFilePath(), "utf-8");
    if (raw.startsWith(SAFE_STORAGE_PREFIX)) {
      if (!isOsVaultAvailable()) return null;
      return JSON.parse(
        safeStorage.decryptString(Buffer.from(raw.slice(SAFE_STORAGE_PREFIX.length), "base64")),
      ) as StoredTokens;
    }
    return JSON.parse(decrypt(raw)) as StoredTokens;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME).catch((_e: unknown) => {
      /* ignore */
    });
  }
  await fs.unlink(tokenFilePath()).catch((_e: unknown) => {
    /* ignore */
  });
}
