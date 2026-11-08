import {
  appendFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { join, resolve, dirname, basename, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMacSigningConfig } from "./mac-signing.mjs";

/** Decode only into runner temp, validate, then expose the file path to later steps. */
export function prepareMacSigning({ env = process.env, platform = process.platform } = {}) {
  const encoded = env.MAC_APPLE_API_KEY_BASE64;
  const hasEncoded = typeof encoded === "string" && encoded.trim().length > 0;
  if (!hasEncoded) return resolveMacSigningConfig({ env, platform });
  if (!env.RUNNER_TEMP || !env.GITHUB_ENV)
    throw new Error("macOS signing preparation requires RUNNER_TEMP and GITHUB_ENV.");
  if (env.APPLE_API_KEY)
    throw new Error("Provide MAC_APPLE_API_KEY_BASE64 or APPLE_API_KEY, not both.");
  const compact = encoded.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new Error("MAC_APPLE_API_KEY_BASE64 must be valid base64.");
  }
  const directory = mkdtempSync(join(env.RUNNER_TEMP, "streamshogun-signing-"));
  const keyPath = join(directory, "AuthKey.p8");
  try {
    if (/[\r\n]/.test(keyPath))
      throw new Error("Signing temporary path contains unsupported characters.");
    writeFileSync(keyPath, Buffer.from(compact, "base64"), { mode: 0o600 });
    const config = resolveMacSigningConfig({ env: { ...env, APPLE_API_KEY: keyPath }, platform });
    appendFileSync(env.GITHUB_ENV, `APPLE_API_KEY=${keyPath}\n`);
    return config;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Remove only this script's verified temporary signing directory. */
export function cleanupMacSigning({ env = process.env } = {}) {
  if (!env.APPLE_API_KEY) return;
  if (!env.RUNNER_TEMP) throw new Error("Signing cleanup requires RUNNER_TEMP.");
  const keyPath = resolve(env.APPLE_API_KEY);
  const parentPath = dirname(keyPath);
  if (
    basename(keyPath) !== "AuthKey.p8" ||
    !basename(parentPath).startsWith("streamshogun-signing-")
  ) {
    throw new Error("Refusing cleanup outside the managed signing directory.");
  }
  // Validate lexical containment even when a previous cleanup removed the path.
  const relativeParent = relative(resolve(env.RUNNER_TEMP), parentPath);
  if (!relativeParent || relativeParent.startsWith("..") || isAbsolute(relativeParent)) {
    throw new Error("Refusing cleanup outside RUNNER_TEMP.");
  }
  if (!existsSync(parentPath)) return;
  const realTemp = realpathSync(env.RUNNER_TEMP);
  const realParent = realpathSync(parentPath);
  const withinTemp = relative(realTemp, realParent);
  if (
    !withinTemp ||
    withinTemp.startsWith("..") ||
    isAbsolute(withinTemp) ||
    !basename(realParent).startsWith("streamshogun-signing-")
  ) {
    throw new Error("Refusing cleanup outside the real managed signing directory.");
  }
  if (existsSync(keyPath) && dirname(realpathSync(keyPath)) !== realParent) {
    throw new Error("Refusing cleanup of a redirected signing key.");
  }
  rmSync(realParent, { recursive: true, force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes("--cleanup")) cleanupMacSigning();
    else prepareMacSigning();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
