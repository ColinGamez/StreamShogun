// ── Secure token storage for the desktop client ───────────────────────
//
// Stores access + refresh tokens:
//  1. keytar (OS keychain) — preferred
//  2. Encrypted JSON file in appData — fallback
//
// Tokens are NEVER held in memory for longer than necessary.

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { app } from "electron";

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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
  } else {
    await fs.writeFile(tokenFilePath(), encrypt(json), "utf-8");
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

  // Fallback: encrypted file
  try {
    const raw = await fs.readFile(tokenFilePath(), "utf-8");
    return JSON.parse(decrypt(raw)) as StoredTokens;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME).catch((_e: unknown) => { /* ignore */ });
  }
  await fs.unlink(tokenFilePath()).catch((_e: unknown) => { /* ignore */ });
}
