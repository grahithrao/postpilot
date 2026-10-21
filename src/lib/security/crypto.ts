import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  return Buffer.from(env().ENCRYPTION_KEY, "hex");
}

/**
 * Encrypts an OAuth token for storage. Format: v1.<iv>.<authTag>.<ciphertext>
 * (all base64url). Tokens are only ever decrypted inside the platform adapters.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function tryDecryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptSecret(payload);
  } catch {
    return null;
  }
}

/** Constant-time comparison for shared secrets (cron token, OAuth state). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Never render a raw token - show only a recognisable stub. */
export function maskToken(token?: string | null): string {
  if (!token) return "-";
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}********${token.slice(-4)}`;
}
