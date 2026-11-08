import { readFileSync } from "node:fs";

const REQUIRED = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];
const present = (value) => typeof value === "string" && value.trim().length > 0;

/** GitHub substitutes missing secrets with empty strings. Builder treats a defined
 * empty CSC_LINK as a certificate path, so remove empty optional settings in-place.
 * Nonempty credential values must remain byte-for-byte unchanged.
 */
export function normalizeEmptySigningEnvironment(env = process.env) {
  for (const name of [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "CSC_NAME",
    "CSC_INSTALLER_LINK",
    "CSC_INSTALLER_KEY_PASSWORD",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_KEYCHAIN",
    "APPLE_KEYCHAIN_PROFILE",
  ]) {
    if (typeof env[name] === "string" && env[name].trim().length === 0) delete env[name];
  }
  return env;
}

/** Validate before electron-builder can silently skip signing/notarization. Never include values in errors. */
export function resolveMacSigningConfig({
  env = process.env,
  platform = process.platform,
  isMacBuild = true,
} = {}) {
  if (!isMacBuild) return {};
  const required = env.REQUIRE_MAC_SIGNING;
  if (present(required) && !["true", "false"].includes(required)) {
    throw new Error("REQUIRE_MAC_SIGNING must be true or false.");
  }
  const supplied = REQUIRED.filter((name) => present(env[name]));
  const signing = required === "true" || supplied.length > 0;
  if (!signing) {
    // v26's ad-hoc signatures have no Team ID. Hardened library validation
    // rejects Electron's pre-signed frameworks; keep exceptions out of plists.
    return {
      forceCodeSigning: false,
      mac: { identity: "-", hardenedRuntime: false, notarize: false },
    };
  }
  const missing = REQUIRED.filter((name) => !present(env[name]));
  if (missing.length) throw new Error(`macOS signing requires: ${missing.join(", ")}.`);
  if (platform !== "darwin") throw new Error("Signed macOS releases must be built on macOS.");
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === "false" || env.CSC_NAME === "-") {
    throw new Error(
      "macOS release signing cannot disable certificate discovery or use an ad-hoc identity.",
    );
  }
  if (present(env.APPLE_ID) || present(env.APPLE_APP_SPECIFIC_PASSWORD)) {
    throw new Error(
      "Remove APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD when using API-key notarization.",
    );
  }
  if (!/^[A-Za-z0-9]{10}$/.test(env.APPLE_API_KEY_ID))
    throw new Error("APPLE_API_KEY_ID must be a 10-character key ID.");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.APPLE_API_ISSUER)
  ) {
    throw new Error("APPLE_API_ISSUER must be an issuer UUID for a team API key.");
  }
  let key;
  try {
    key = readFileSync(env.APPLE_API_KEY, "utf8");
  } catch {
    throw new Error("APPLE_API_KEY must reference a readable .p8 private-key file.");
  }
  if (
    !env.APPLE_API_KEY.endsWith(".p8") ||
    !/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(key)
  ) {
    throw new Error("APPLE_API_KEY must reference a PEM .p8 private-key file.");
  }
  return {
    forceCodeSigning: true,
    mac: {
      type: "distribution",
      hardenedRuntime: true,
      entitlements: "build/entitlements.mac.plist",
      entitlementsInherit: "build/entitlements.mac.inherit.plist",
      notarize: true,
    },
  };
}
