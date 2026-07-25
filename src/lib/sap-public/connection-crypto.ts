/**
 * AES-256-GCM encryption for per-Organization SAP connection secrets.
 *
 * A SapConnection stores its non-secret fields (baseUrl, authType, label) in
 * plaintext columns and its SECRETS (password / bearer token / client secret)
 * as a single encrypted JSON bundle. This module is the ONLY sanctioned path
 * to seal/open that bundle.
 *
 * Mirrors src/lib/intelligence/ai-key-crypto.ts (the established BYOAI key
 * pattern) so the crypto convention is uniform across the codebase: IV(12) +
 * ciphertext + authTag(16), base64-encoded, AES-256-GCM.
 *
 * Requires SAP_CONNECTION_ENCRYPTION_KEY — a 32-byte key as 64 hex chars.
 * Generate one with:  openssl rand -hex 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** The secret half of a connection — never stored or logged in plaintext. */
export interface SapConnectionSecrets {
  /** basic auth */
  username?: string;
  password?: string;
  /** static bearer */
  bearerToken?: string;
  /** oauth client-credentials */
  clientId?: string;
  clientSecret?: string;
  /** guarded-write secret (mirrors {PREFIX}_WRITE_SECRET) */
  writeSecret?: string;
}

function getEncryptionKey(): Buffer {
  const hex = process.env.SAP_CONNECTION_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "SAP_CONNECTION_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with `openssl rand -hex 32`.",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a UTF-8 string → base64(IV + ciphertext + authTag). */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/** Decrypt a base64(IV + ciphertext + authTag) blob → UTF-8 string. Throws on tamper. */
export function decryptSecret(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encryptedBase64, "base64");
  if (buf.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) {
    throw new Error("SapConnection secret blob is too short to be valid ciphertext.");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

/** Seal a secrets object into a single storable blob (only defined fields are kept). */
export function sealSecrets(secrets: SapConnectionSecrets): string {
  const trimmed: SapConnectionSecrets = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === "string" && v.length > 0) trimmed[k as keyof SapConnectionSecrets] = v;
  }
  return encryptSecret(JSON.stringify(trimmed));
}

/** Open a sealed blob back into a secrets object. Returns {} for an empty/absent blob. */
export function openSecrets(blob: string | null | undefined): SapConnectionSecrets {
  if (!blob) return {};
  const parsed = JSON.parse(decryptSecret(blob)) as unknown;
  if (!parsed || typeof parsed !== "object") return {};
  const src = parsed as Record<string, unknown>;
  const out: SapConnectionSecrets = {};
  for (const key of ["username", "password", "bearerToken", "clientId", "clientSecret", "writeSecret"] as const) {
    if (typeof src[key] === "string") out[key] = src[key] as string;
  }
  return out;
}
