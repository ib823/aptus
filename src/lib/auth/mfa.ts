/** TOTP MFA utilities — encryption, setup, verification */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import * as OTPAuth from "otpauth";
import { APP_CONFIG } from "@/constants/config";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOTP_ENCRYPTION_KEY ?? "";
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a TOTP secret using AES-256-GCM before storing in database.
 * Returns a hex string: iv:authTag:ciphertext
 */
export function encryptTotpSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a TOTP secret from database storage.
 */
export function decryptTotpSecret(encryptedSecret: string): string {
  const parts = encryptedSecret.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }
  const [ivHex, authTagHex, ciphertext] = parts as [string, string, string];

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a new TOTP secret and return the secret + otpauth URI.
 */
export function generateTotpSecret(email: string): {
  secret: string;
  uri: string;
} {
  const totp = new OTPAuth.TOTP({
    issuer: APP_CONFIG.totpIssuer,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verify a TOTP code against an encrypted secret.
 * Returns true if the code is valid within the configured window.
 */
export function verifyTotpCode(
  encryptedSecret: string,
  code: string,
): boolean {
  const secret = decryptTotpSecret(encryptedSecret);

  const totp = new OTPAuth.TOTP({
    issuer: APP_CONFIG.totpIssuer,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code, window: APP_CONFIG.totpWindow });
  return delta !== null;
}
