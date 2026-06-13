import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

interface GoogleIdTokenPayload extends JWTPayload {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  sub?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("Google Sign-In is not configured.");
  }

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: env.GOOGLE_CLIENT_ID,
  });

  const typedPayload = payload as GoogleIdTokenPayload;
  const issuer = typeof typedPayload.iss === "string" ? typedPayload.iss : "";

  if (!GOOGLE_ISSUERS.has(issuer)) {
    throw new Error("Invalid Google token issuer.");
  }

  if (typedPayload.email_verified !== true && typedPayload.email_verified !== "true") {
    throw new Error("Google account email must be verified.");
  }

  if (typeof typedPayload.sub !== "string" || !typedPayload.sub) {
    throw new Error("Google token is missing a subject.");
  }

  if (typeof typedPayload.email !== "string" || !typedPayload.email) {
    throw new Error("Google token is missing an email address.");
  }

  return {
    sub: typedPayload.sub,
    email: typedPayload.email.toLowerCase(),
    displayName:
      typeof typedPayload.name === "string" && typedPayload.name.trim()
        ? typedPayload.name.trim()
        : undefined,
    avatarUrl:
      typeof typedPayload.picture === "string" && typedPayload.picture.trim()
        ? typedPayload.picture.trim()
        : undefined,
  };
}
