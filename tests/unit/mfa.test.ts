import { describe, it, expect, beforeAll } from "vitest";
import { encryptTotpSecret, decryptTotpSecret, generateTotpSecret } from "@/lib/auth/mfa";

// Set a test encryption key (32 bytes = 64 hex chars for AES-256)
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY =
    "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  process.env.TOTP_ISSUER = "Aptus";
});

describe("MFA Utilities", () => {
  describe("TOTP Secret Encryption", () => {
    it("should encrypt and decrypt a TOTP secret", () => {
      const originalSecret = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptTotpSecret(originalSecret);

      expect(encrypted).not.toBe(originalSecret);
      expect(encrypted).toContain(":");

      const decrypted = decryptTotpSecret(encrypted);
      expect(decrypted).toBe(originalSecret);
    });

    it("should produce different ciphertexts for the same input (unique IV)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted1 = encryptTotpSecret(secret);
      const encrypted2 = encryptTotpSecret(secret);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(decryptTotpSecret(encrypted1)).toBe(secret);
      expect(decryptTotpSecret(encrypted2)).toBe(secret);
    });

    it("should throw on invalid encrypted format", () => {
      expect(() => decryptTotpSecret("invalid")).toThrow();
    });
  });

  describe("TOTP Secret Generation", () => {
    it("should generate a valid TOTP secret and URI", () => {
      const result = generateTotpSecret("user@example.com");

      expect(result.secret).toBeTruthy();
      expect(result.secret.length).toBeGreaterThan(10);
      expect(result.uri).toContain("otpauth://totp/");
      expect(result.uri).toContain("user%40example.com");
      expect(result.uri).toContain("Aptus");
    });

    it("should generate different secrets for different emails", () => {
      const result1 = generateTotpSecret("user1@example.com");
      const result2 = generateTotpSecret("user2@example.com");

      expect(result1.secret).not.toBe(result2.secret);
    });
  });
});
