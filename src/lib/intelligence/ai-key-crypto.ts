/**
 * AES-256-GCM encryption for BYOAI API keys.
 * Requires BYOAI_ENCRYPTION_KEY env var (32-byte hex string = 64 hex chars).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.BYOAI_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "BYOAI_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext API key.
 * Returns a base64-encoded string containing IV + ciphertext + auth tag.
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: IV (12) + ciphertext (variable) + authTag (16)
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/**
 * Decrypts a base64-encoded encrypted API key.
 */
export function decryptApiKey(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * Check if a string looks like an encrypted key (base64 with sufficient length).
 */
export function isEncryptedKey(value: string): boolean {
  if (!value || value.length < 20) return false;
  try {
    const buf = Buffer.from(value, "base64");
    // Minimum: IV (12) + at least 1 byte ciphertext + authTag (16) = 29
    return buf.length >= IV_LENGTH + 1 + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}
