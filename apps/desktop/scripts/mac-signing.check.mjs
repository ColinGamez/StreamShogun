import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  existsSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMacSigningConfig, normalizeEmptySigningEnvironment } from "./mac-signing.mjs";
import { prepareMacSigning, cleanupMacSigning } from "./prepare-mac-signing.mjs";

const pem = "-----BEGIN PRIVATE KEY-----\nfake-test-key\n-----END PRIVATE KEY-----\n";
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "streamshogun-sign-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const key = join(directory, "AuthKey.p8");
  writeFileSync(key, pem);
  return {
    directory,
    env: {
      CSC_LINK: "sensitive-certificate",
      CSC_KEY_PASSWORD: "sensitive-password",
      APPLE_API_KEY: key,
      APPLE_API_KEY_ID: "TEST123456",
      APPLE_API_ISSUER: "11111111-2222-3333-4444-555555555555",
    },
  };
}

test("credential-free builds are explicitly ad-hoc without hardened library validation", () => {
  const config = resolveMacSigningConfig({ env: {}, platform: "darwin" });
  assert.deepEqual(config, {
    forceCodeSigning: false,
    mac: { identity: "-", hardenedRuntime: false, notarize: false },
  });
});
test("non-Mac targets do not require Mac secrets", () => {
  assert.deepEqual(
    resolveMacSigningConfig({
      env: { REQUIRE_MAC_SIGNING: "true", CSC_LINK: "partial-test-certificate" },
      platform: "win32",
      isMacBuild: false,
    }),
    {},
  );
});
test("required and partial configurations fail closed without printing credential values", (t) => {
  const { env } = fixture(t);
  for (const field of Object.keys(env)) {
    const partial = { ...env };
    delete partial[field];
    assert.throws(
      () => resolveMacSigningConfig({ env: partial, platform: "darwin" }),
      (error) => {
        assert.match(error.message, new RegExp(field));
        assert.ok(!error.message.includes("sensitive-certificate"));
        assert.ok(!error.message.includes("sensitive-password"));
        assert.ok(!error.message.includes(pem));
        return true;
      },
    );
  }
  assert.throws(
    () => resolveMacSigningConfig({ env: { REQUIRE_MAC_SIGNING: "true" }, platform: "darwin" }),
    /CSC_LINK/,
  );
});
test("complete credentials enable flat v26 signing and built-in notarization", (t) => {
  const { env } = fixture(t);
  const config = resolveMacSigningConfig({ env, platform: "darwin" });
  assert.equal(config.forceCodeSigning, true);
  assert.equal(config.mac.hardenedRuntime, true);
  assert.equal(config.mac.notarize, true);
  assert.equal(config.mac.type, "distribution");
  assert.equal(config.mac.sign, undefined);
  assert.equal(config.mac.entitlements, "build/entitlements.mac.plist");
  assert.ok(!JSON.stringify(config).includes("sensitive"));
  assert.throws(() => resolveMacSigningConfig({ env, platform: "win32" }), /macOS/);
});
test("invalid keys and bypass environment settings fail before builder", (t) => {
  const { env, directory } = fixture(t);
  for (const overrides of [
    { APPLE_API_KEY: join(directory, "missing.p8") },
    { APPLE_API_KEY_ID: "invalid" },
    { APPLE_API_ISSUER: "invalid" },
    { CSC_NAME: "-" },
    { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    { APPLE_ID: "test" },
    { REQUIRE_MAC_SIGNING: "yes" },
  ]) {
    assert.throws(() =>
      resolveMacSigningConfig({ env: { ...env, ...overrides }, platform: "darwin" }),
    );
  }
  writeFileSync(env.APPLE_API_KEY, "not a PEM private key");
  assert.throws(() => resolveMacSigningConfig({ env, platform: "darwin" }), /PEM/);
});
test("CI preparation writes only the key path to GITHUB_ENV and private key to temp", (t) => {
  const { env, directory } = fixture(t);
  delete env.APPLE_API_KEY;
  const githubEnv = join(directory, "github-env");
  const config = prepareMacSigning({
    env: {
      ...env,
      RUNNER_TEMP: directory,
      GITHUB_ENV: githubEnv,
      MAC_APPLE_API_KEY_BASE64: Buffer.from(pem).toString("base64"),
    },
    platform: "darwin",
  });
  assert.equal(config.mac.notarize, true);
  const exported = readFileSync(githubEnv, "utf8");
  assert.match(exported, /^APPLE_API_KEY=/);
  assert.ok(!exported.includes("PRIVATE KEY"));
  const keyPath = exported.trim().slice("APPLE_API_KEY=".length);
  assert.equal(readFileSync(keyPath, "utf8"), pem);
  if (process.platform !== "win32") assert.equal(statSync(keyPath).mode & 0o777, 0o600);
});
test("CI preparation rejects malformed base64 and cleans up on validation failures", (t) => {
  const { env, directory } = fixture(t);
  delete env.APPLE_API_KEY;
  const prepared = {
    ...env,
    RUNNER_TEMP: directory,
    GITHUB_ENV: join(directory, "github-env"),
    MAC_APPLE_API_KEY_BASE64: "!!invalid!!",
  };
  assert.throws(() => prepareMacSigning({ env: prepared, platform: "darwin" }), /base64/);
  prepared.MAC_APPLE_API_KEY_BASE64 = Buffer.from(pem).toString("base64");
  delete prepared.CSC_LINK;
  assert.throws(() => prepareMacSigning({ env: prepared, platform: "darwin" }), /CSC_LINK/);
  assert.equal(
    readdirSync(directory).filter((name) => name.startsWith("streamshogun-signing-")).length,
    0,
  );
});

test("cleanup deletes only the managed directory and tolerates absent credentials", (t) => {
  const { directory } = fixture(t);
  const managed = mkdtempSync(join(directory, "streamshogun-signing-"));
  const key = join(managed, "AuthKey.p8");
  writeFileSync(key, pem);
  cleanupMacSigning({ env: { APPLE_API_KEY: key, RUNNER_TEMP: directory } });
  assert.equal(existsSync(managed), false);
  cleanupMacSigning({ env: { APPLE_API_KEY: key, RUNNER_TEMP: directory } });
  cleanupMacSigning({ env: {} });
});

test("cleanup refuses outside paths and incorrect directory or key names", (t) => {
  const { directory, env } = fixture(t);
  const runner = join(directory, "runner");
  mkdirSync(runner);
  const outside = mkdtempSync(join(directory, "streamshogun-signing-"));
  const outsideKey = join(outside, "AuthKey.p8");
  writeFileSync(outsideKey, pem);
  assert.throws(
    () => cleanupMacSigning({ env: { APPLE_API_KEY: outsideKey, RUNNER_TEMP: runner } }),
    /Refusing/,
  );
  assert.equal(existsSync(outsideKey), true);
  assert.throws(
    () => cleanupMacSigning({ env: { APPLE_API_KEY: env.APPLE_API_KEY, RUNNER_TEMP: directory } }),
    /Refusing/,
  );
  assert.equal(existsSync(env.APPLE_API_KEY), true);
  assert.throws(
    () =>
      cleanupMacSigning({
        env: { APPLE_API_KEY: join(outside, "wrong.p8"), RUNNER_TEMP: directory },
      }),
    /Refusing/,
  );
});

test(
  "cleanup refuses a managed-name symlink that points outside runner temp",
  { skip: process.platform === "win32" },
  (t) => {
    const { directory } = fixture(t);
    const runner = join(directory, "runner");
    mkdirSync(runner);
    const outside = mkdtempSync(join(directory, "streamshogun-signing-"));
    writeFileSync(join(outside, "AuthKey.p8"), pem);
    const link = join(runner, "streamshogun-signing-link");
    symlinkSync(outside, link);
    assert.throws(
      () =>
        cleanupMacSigning({
          env: { APPLE_API_KEY: join(link, "AuthKey.p8"), RUNNER_TEMP: runner },
        }),
      /Refusing/,
    );
    assert.equal(existsSync(join(outside, "AuthKey.p8")), true);
  },
);

test("normalization deletes empty workflow signing values from the actual environment object", () => {
  const env = {
    CSC_LINK: "",
    CSC_KEY_PASSWORD: " ",
    CSC_NAME: "\t",
    CSC_INSTALLER_LINK: "\n",
    CSC_INSTALLER_KEY_PASSWORD: "",
    APPLE_API_KEY: "",
    APPLE_API_KEY_ID: " ",
    APPLE_API_ISSUER: "",
    APPLE_ID: "",
    APPLE_APP_SPECIFIC_PASSWORD: "",
    APPLE_TEAM_ID: "",
    APPLE_KEYCHAIN: " ",
    APPLE_KEYCHAIN_PROFILE: "",
    REQUIRE_MAC_SIGNING: "false",
    UNRELATED_EMPTY: "",
  };
  assert.equal(normalizeEmptySigningEnvironment(env), env);
  assert.equal(env.CSC_LINK, undefined);
  assert.equal(Object.hasOwn(env, "CSC_LINK"), false);
  assert.deepEqual(env, { REQUIRE_MAC_SIGNING: "false", UNRELATED_EMPTY: "" });
  assert.equal(resolveMacSigningConfig({ env, platform: "darwin" }).mac.identity, "-");
});

test("normalization preserves nonempty credential values exactly", () => {
  const env = {
    CSC_LINK: "  sensitive-certificate  ",
    CSC_KEY_PASSWORD: " password with spaces ",
    CSC_NAME: "-",
    APPLE_API_KEY: "/path with spaces/key.p8",
    REQUIRE_MAC_SIGNING: "true",
  };
  const before = { ...env };
  normalizeEmptySigningEnvironment(env);
  assert.deepEqual(env, before);
});
